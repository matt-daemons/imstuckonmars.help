import { describe, expect, it } from "vitest";

import { cellAt, cellCenter, type EquirectMeta, type RouteGrid } from "./route-grid";
import { marsDistanceM } from "./routing";
import {
  findStagingPoint,
  PARKING_SQUARE_M,
  siteGridFromSlope,
  withZones,
  type SiteGrid,
} from "./site-grid";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const RADIANS_TO_DEGREES = 180 / Math.PI;
const NODATA = -9999;
/** Degrees per metre on the Mars sphere, along a meridian or the equator. */
const DEG_PER_M = RADIANS_TO_DEGREES / MARS_RADIUS_M;

/** A 1 m raster whose north-west corner is on the equator at 0° E. */
function rasterMeta(width: number, height: number): EquirectMeta {
  return { width, height, west: 0, north: 0, degreesPerPixel: DEG_PER_M, nodata: NODATA };
}

describe("siteGridFromSlope", () => {
  it("max-pools 1 m pixels to 2 m cells, keeping the steepest and walling steep or missing slope", () => {
    // Three 2 × 2 blocks: steepest 5°, steepest 25° (over the 20° limit), one pixel without data.
    const tenths = [10, 50, 250, 10, 0, NODATA, 30, 20, 40, 10, 0, 0];
    const { grid, slope, walls } = siteGridFromSlope(rasterMeta(6, 2), tenths, []);
    expect([grid.width, grid.height]).toEqual([3, 1]);
    expect(Array.from(slope)).toEqual([5, 25, NaN]);
    expect(Array.from(walls)).toEqual([0, 1, 1]);
    expect(Array.from(grid.heights)).toEqual([0, 0, 0]);
  });

  it("walls exactly the cells whose centres are inside a boulder circle", () => {
    const center: LngLat = [31.3 * DEG_PER_M, -28.7 * DEG_PER_M];
    const boulder = { center, radius_m: 5.3 };
    const { grid, walls } = siteGridFromSlope(rasterMeta(60, 60), new Int16Array(3600), [boulder]);
    const inside = Array.from(walls, (_, cell) =>
      marsDistanceM(cellCenter(grid, cell), center) <= boulder.radius_m ? 1 : 0,
    );
    expect(Array.from(walls)).toEqual(inside);
    expect(walls.reduce((sum, wall) => sum + wall, 0)).toBeGreaterThan(10);
  });
});

describe("withZones", () => {
  it("walls the cells inside a drawn zone and keeps the boulder walls", () => {
    const boulder = { center: [10 * DEG_PER_M, -10 * DEG_PER_M] as LngLat, radius_m: 3 };
    const site = siteGridFromSlope(rasterMeta(60, 60), new Int16Array(3600), [boulder]);
    // A 20 m square zone over the south-east corner of the 60 m site.
    const [west, north, east, south] = [40, -40, 60, -60].map((m) => m * DEG_PER_M);
    const zone = {
      id: "z",
      name: "Z",
      ring: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ] as LngLat[],
    };
    const zoned = withZones(site, [zone]);
    const inZone = (cell: number) => {
      const [lng, lat] = cellCenter(site.grid, cell);
      return lng > west && lng < east && lat < north && lat > south;
    };
    const expected = Array.from(site.walls, (wall, cell) => (wall || inZone(cell) ? 1 : 0));
    expect(Array.from(zoned.walls)).toEqual(expected);
    expect(zoned.walls.reduce((sum, wall) => sum + wall, 0)).toBeGreaterThan(
      site.walls.reduce((sum, wall) => sum + wall, 0) + 90,
    );
    expect(withZones(site, [])).toBe(site);
  });
});

/** A flat site of 10 m cells centred on the POI at the grid's middle cell, with the base far to the east. */
function flatSite(size = 261, cellM = 10): { site: SiteGrid; poi: LngLat; base: LngLat } {
  const cellDeg = cellM * DEG_PER_M;
  const grid: RouteGrid = {
    width: size,
    height: size,
    west: 0,
    east: size * cellDeg,
    rowEdges: Float64Array.from({ length: size + 1 }, (_, edge) => (size / 2 - edge) * cellDeg),
    heights: new Float32Array(size * size),
  };
  const middle = Math.floor(size / 2);
  const poi = cellCenter(grid, middle * size + middle);
  const site = {
    grid,
    slope: new Float32Array(size * size),
    walls: new Uint8Array(size * size),
    boulders: [],
  };
  return { site, poi, base: [poi[0] + 1, poi[1]] };
}

describe("findStagingPoint", () => {
  it("parks on flat ground 0.5 km from the POI, on the bearing to base", () => {
    const { site, poi, base } = flatSite();
    const staging = findStagingPoint(site, poi, base)!;
    expect(staging[1]).toBeCloseTo(poi[1], 9); // due east, like the base
    expect(staging[0]).toBeGreaterThan(poi[0]);
    expect(marsDistanceM(poi, staging)).toBeGreaterThanOrEqual(500);
    expect(marsDistanceM(poi, staging)).toBeLessThan(511);
  });

  it("parks on a gently rough square but never next to a boulder", () => {
    const { site, poi, base } = flatSite();
    const free = findStagingPoint(site, poi, base)!;
    site.slope[cellAt(site.grid, free)!] = 15; // one rough cell: the square's mean stays under 5°
    const blocked = findStagingPoint(site, poi, base)!;
    expect(blocked).toEqual(free);
    site.walls[cellAt(site.grid, blocked)!] = 1; // a boulder where the free site parks
    const staging = findStagingPoint(site, poi, base)!;
    expect(marsDistanceM(staging, blocked)).toBeGreaterThan(PARKING_SQUARE_M / 2);
    expect(marsDistanceM(poi, staging)).toBeLessThanOrEqual(1000);
  });

  it("falls back to the nearest flat spot within the 2 km walk-back limit", () => {
    const { site, poi, base } = flatSite();
    // Too steep to park (10° > the rover's 5° caution slope) everywhere within 1 km.
    site.slope.forEach((_, cell) => {
      if (marsDistanceM(poi, cellCenter(site.grid, cell)) <= 1000) site.slope[cell] = 10;
    });
    const staging = findStagingPoint(site, poi, base)!;
    expect(marsDistanceM(poi, staging)).toBeGreaterThan(1000);
    expect(marsDistanceM(poi, staging)).toBeLessThan(1100);
  });

  it("returns null when nothing is flat enough", () => {
    const { site, poi, base } = flatSite();
    site.slope.fill(10);
    expect(findStagingPoint(site, poi, base)).toBeNull();
  });
});
