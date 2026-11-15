import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  cellAt,
  cellCenter,
  cellSize,
  decodeTerrarium,
  gridFromTiles,
  type RouteGrid,
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
});
