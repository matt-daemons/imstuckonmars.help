import { describe, expect, it } from "vitest";

import { cellAt, cellCenter, type EquirectMeta, type RouteGrid } from "./route-grid";
import { marsDistanceM } from "./routing";
import {
  findStagingPoint,
  assertAlignedSiteRasters,
  PARKING_FALLBACK_SLOPE_DEG,
  PARKING_MAX_ROUGHNESS_M,
  PARKING_MAX_SLOPE_DEG,
  PARKING_SQUARE_M,
  siteGridFromSlope,
  STAGING_MIN_M,
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
  it("requires aligned slope and roughness pixels and missing-value masks", () => {
    const meta = rasterMeta(4, 4);
    expect(() => assertAlignedSiteRasters(meta, { ...meta })).not.toThrow();
    for (const changed of [
      { width: 5 },
      { height: 5 },
      { west: DEG_PER_M },
      { north: DEG_PER_M },
      { degreesPerPixel: DEG_PER_M * 2 },
      { nodata: -32768 },
    ]) {
      expect(() => assertAlignedSiteRasters(meta, { ...meta, ...changed })).toThrow("not aligned");
    }
  });

  it("preserves missing roughness rather than treating it as smooth", () => {
    const meta = rasterMeta(4, 2);
    const site = siteGridFromSlope(meta, new Int16Array(8), [], 2, [
      10,
      30,
      0,
      NODATA,
      20,
      15,
      0,
      0,
    ]);
    expect(Array.from(site.roughness ?? [])).toEqual([expect.closeTo(0.3), NaN]);
    expect(Array.from(site.walls)).toEqual([0, 0]);
  });
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

/** A flat site of 2 m cells centred on the POI at the grid's middle cell. */
function flatSite(size = 1101, cellM = 2): { site: SiteGrid; poi: LngLat } {
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
  const site: SiteGrid = {
    grid,
    slope: new Float32Array(size * size),
    walls: new Uint8Array(size * size),
    boulders: [],
    roughness: null,
  };
  return { site, poi };
}

/** Sets every cell within radiusM of the POI to value. */
function fillNear(
  site: SiteGrid,
  poi: LngLat,
  radiusM: number,
  layer: Float32Array,
  value: number,
) {
  layer.forEach((_, cell) => {
    if (marsDistanceM(poi, cellCenter(site.grid, cell)) <= radiusM) layer[cell] = value;
  });
}

describe("findStagingPoint", () => {
  it("parks on flat ground just past 25 m from the POI, on the strict slope", () => {
    const { site, poi } = flatSite();
    const staging = findStagingPoint(site, poi)!;
    expect(marsDistanceM(poi, staging.point)).toBeGreaterThanOrEqual(STAGING_MIN_M);
    expect(marsDistanceM(poi, staging.point)).toBeLessThan(STAGING_MIN_M + 10);
    expect(staging).toMatchObject({ slopeLimitDeg: PARKING_MAX_SLOPE_DEG, fallback: false });
    expect(staging.roughnessChecked).toBe(false);
  });

  it("rejects a square with one cell over 5° and never parks next to a boulder", () => {
    const { site, poi } = flatSite();
    const free = findStagingPoint(site, poi)!.point;
    const freeCell = cellAt(site.grid, free)!;
    site.slope[freeCell] = PARKING_MAX_SLOPE_DEG + 0.5; // one steep cell: the square's maximum fails
    const moved = findStagingPoint(site, poi)!.point;
    expect(marsDistanceM(moved, free)).toBeGreaterThan(PARKING_SQUARE_M / 2 - 2);
    site.slope[freeCell] = 0;
    site.walls[freeCell] = 1; // a boulder where the free site parks
    const staging = findStagingPoint(site, poi)!.point;
    expect(marsDistanceM(staging, free)).toBeGreaterThan(PARKING_SQUARE_M / 2 - 2);
  });

  it("takes the nearest qualifying square beyond a crater-like steep zone", () => {
    const { site, poi } = flatSite();
    fillNear(site, poi, 300, site.slope, 8); // over 5°, under the 20° wall limit
    fillNear(site, poi, 400, site.slope, 8);
    site.slope.forEach((value, cell) => {
      if (marsDistanceM(poi, cellCenter(site.grid, cell)) > 400) site.slope[cell] = 0;
    });
    const staging = findStagingPoint(site, poi)!;
    expect(staging.fallback).toBe(false);
    expect(marsDistanceM(poi, staging.point)).toBeGreaterThan(400 + PARKING_SQUARE_M / 2 - 2);
    expect(marsDistanceM(poi, staging.point)).toBeLessThan(400 + PARKING_SQUARE_M / 2 + 12);
  });

  it("falls back to the 10° limit, flagged, when nothing within the walk-back limit is ≤ 5°", () => {
    const { site, poi } = flatSite();
    site.slope.fill(8);
    const staging = findStagingPoint(site, poi)!;
    expect(staging).toMatchObject({ slopeLimitDeg: PARKING_FALLBACK_SLOPE_DEG, fallback: true });
    expect(marsDistanceM(poi, staging.point)).toBeLessThan(STAGING_MIN_M + 10);
  });

  it("checks roughness when the site has it", () => {
    const { site, poi } = flatSite();
    site.roughness = new Float32Array(site.slope.length);
    const smooth = findStagingPoint(site, poi)!;
    expect(smooth.roughnessChecked).toBe(true);
    fillNear(site, poi, 300, site.roughness, PARKING_MAX_ROUGHNESS_M + 0.05);
    const rough = findStagingPoint(site, poi)!;
    expect(marsDistanceM(poi, rough.point)).toBeGreaterThan(300);
    site.roughness.fill(NaN); // no roughness data anywhere: nothing is cleared to park
    expect(findStagingPoint(site, poi)).toBeNull();
  });

  it("returns null when nothing is flat enough", () => {
    const { site, poi } = flatSite();
    site.slope.fill(PARKING_FALLBACK_SLOPE_DEG + 1);
    expect(findStagingPoint(site, poi)).toBeNull();
  });
});
