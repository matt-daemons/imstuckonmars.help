import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  cellAt,
  cellCenter,
  cellSize,
  decodeTerrarium,
  gridFromEquirect,
  gridFromTiles,
  type EquirectMeta,
  type RouteGrid,
  toGridLng,
} from "./route-grid";
import { MARS_RADIUS_M, tileLatitude, tileLongitude } from "./terrain";

const TILE_PIXELS = 256;
const DEGREES_TO_RADIANS = Math.PI / 180;

function blankTile(): number[] {
  return Array.from({ length: TILE_PIXELS * TILE_PIXELS * 4 }, () => 255);
}

function twoByTwoGrid(): RouteGrid {
  const tile = blankTile();
  return gridFromTiles(10, 10, 364, [
    [tile, tile],
    [tile, tile],
  ]);
}

describe("route grid", () => {
  it("decodes a Terrarium pixel and marks transparent pixels as no data", () => {
    const heights = decodeTerrarium([128, 0, 0, 255, 0, 0, 0, 0], 0);
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBeNaN();
  });

  it("lays out 2×2 tiles as one 512×512 grid with Web Mercator row edges", () => {
    const grid = twoByTwoGrid();
    expect([grid.width, grid.height]).toEqual([512, 512]);
    expect(grid.west).toBe(tileLongitude(10, 10));
    expect(grid.east).toBe(tileLongitude(12, 10));
    expect(grid.rowEdges[0]).toBe(tileLatitude(364, 10));
    expect(grid.rowEdges[512]).toBe(tileLatitude(366, 10));
    expect(Math.abs(grid.rowEdges[256] - tileLatitude(365, 10))).toBeLessThan(1e-12);
  });

  it("round trips a cell through cellCenter and cellAt", () => {
    const grid = twoByTwoGrid();
    for (const index of [0, 511, 300 * 512 + 17, 512 * 512 - 1]) {
      expect(cellAt(grid, cellCenter(grid, index))).toBe(index);
    }
  });

  it("returns null outside the grid", () => {
    expect(cellAt(twoByTwoGrid(), [-177, 46])).toBeNull();
  });

  it("uses Mars metres", () => {
    const grid = twoByTwoGrid();
    const { dx, dy } = cellSize(grid, 0);
    const rowLatitude = (grid.rowEdges[0] + grid.rowEdges[1]) / 2;
    expect(dy).toBeCloseTo(
      MARS_RADIUS_M * (grid.rowEdges[0] - grid.rowEdges[1]) * DEGREES_TO_RADIANS,
      6,
    );
    expect(dx).toBeCloseTo(
      (MARS_RADIUS_M *
        Math.cos(rowLatitude * DEGREES_TO_RADIANS) *
        (grid.east - grid.west) *
        DEGREES_TO_RADIANS) /
        grid.width,
      6,
    );
  });

  it("reads the real base tile", async () => {
    const png = PNG.sync.read(await readFile("lib/mars/fixtures/hab-display.png"));
    const grid = gridFromTiles(9, 5, 182, [[png.data]]);
    for (const height of grid.heights) {
      expect(height).toBeGreaterThanOrEqual(-4106);
      expect(height).toBeLessThanOrEqual(-4067);
    }
  });

  describe("equirectangular strip", () => {
    // Same shape as the 463 m driving strip: 171–196° E, 48.5–42.5° N.
    const meta: EquirectMeta = {
      width: 3200,
      height: 768,
      west: 171,
      north: 48.5,
      degreesPerPixel: 0.0078125,
      nodata: -32768,
    };
    const strip = () => gridFromEquirect(meta, new Int16Array(meta.width * meta.height));

    it("spaces row edges evenly from north by degreesPerPixel", () => {
      const grid = strip();
      expect(grid.rowEdges.length).toBe(769);
      expect(grid.rowEdges[0]).toBe(48.5);
      expect(grid.rowEdges[100]).toBeCloseTo(48.5 - 100 * 0.0078125, 12);
      expect(grid.rowEdges[768]).toBeCloseTo(42.5, 12);
      expect(grid.east).toBeCloseTo(196, 12);
    });

    it("finds the habitat west of 0 inside a strip east of 180", () => {
      const grid = strip();
      expect(toGridLng(grid, -176.05)).toBeCloseTo(183.95, 12);
      // (183.95 − 171) × 128 = 1657.6; (48.5 − 45.97) × 128 = 323.84.
      expect(cellAt(grid, [toGridLng(grid, -176.05), 45.97])).toBe(323 * 3200 + 1657);
    });

    it("leaves longitudes alone for a grid west of 180", () => {
      expect(toGridLng(twoByTwoGrid(), -176.05)).toBe(-176.05);
    });

    it("turns nodata into NaN", () => {
      const grid = gridFromEquirect({ ...meta, width: 2, height: 1 }, [-32768, -4100]);
      expect(grid.heights[0]).toBeNaN();
      expect(grid.heights[1]).toBe(-4100);
    });
  });
});
