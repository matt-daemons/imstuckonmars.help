import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { cellAt, cellCenter, gridFromTiles, type RouteGrid } from "./route-grid";
import { EXAMPLE_ZONE } from "./route-zones";
import { findPath, planWalk, slopeDegrees, wallMask, type NoGoZone } from "./routing";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const RADIANS_TO_DEGREES = 180 / Math.PI;

/** A grid centred on the equator with square cells of cellM metres and heights of 0. */
function flatGrid(width: number, height: number, cellM: number): RouteGrid {
  const cellDeg = (cellM / MARS_RADIUS_M) * RADIANS_TO_DEGREES;
  return {
    width,
    height,
    west: 0,
    east: width * cellDeg,
    rowEdges: Float64Array.from({ length: height + 1 }, (_, edge) => (height / 2 - edge) * cellDeg),
    heights: new Float32Array(width * height),
  };
}

function center(grid: RouteGrid, row: number, col: number): LngLat {
  return cellCenter(grid, row * grid.width + col);
}

/** Longitude/latitude of a point in grid units, where (0, 0) is the north-west corner. */
function gridPoint(grid: RouteGrid, row: number, col: number): LngLat {
  const cellDeg = (grid.east - grid.west) / grid.width;
  return [grid.west + col * cellDeg, grid.rowEdges[0] - row * cellDeg];
}

function openWalls(grid: RouteGrid): Uint8Array {
  return new Uint8Array(grid.width * grid.height);
}

function route(grid: RouteGrid, walls: Uint8Array, start: LngLat, goal: LngLat) {
  return findPath(grid, slopeDegrees(grid), walls, start, goal);
}

function cellsOf(grid: RouteGrid, path: LngLat[]): number[] {
  return path.map((point) => cellAt(grid, point)!);
}

describe("A* route", () => {
  it("goes straight across open flat ground", () => {
    const grid = flatGrid(20, 20, 10);
    const result = route(grid, openWalls(grid), center(grid, 10, 1), center(grid, 10, 18));
    expect(result.status).toBe("ok");
    expect(Math.abs(result.distance_m - 17 * 10)).toBeLessThan(1e-6);
    expect(result.path[0]).toEqual(center(grid, 10, 1));
    expect(result.path.at(-1)).toEqual(center(grid, 10, 18));
  });

  it("goes through the gap in a wall", () => {
    const grid = flatGrid(20, 20, 10);
    const walls = openWalls(grid);
    for (let row = 0; row < 20; row++) if (row !== 2) walls[row * 20 + 10] = 1;
    const result = route(grid, walls, center(grid, 15, 2), center(grid, 15, 17));
    expect(result.status).toBe("ok");
    expect(cellsOf(grid, result.path)).toContain(2 * 20 + 10);
    for (const cell of cellsOf(grid, result.path)) expect(walls[cell]).toBe(0);
  });

  it("does not cut corners", () => {
    const grid = flatGrid(20, 20, 10);
    const walls = openWalls(grid);
    walls[5 * 20 + 6] = 1;
    walls[6 * 20 + 5] = 1;
    const result = route(grid, walls, center(grid, 5, 5), center(grid, 6, 6));
    expect(result.status).toBe("ok");
    expect(result.path.length).toBeGreaterThan(2);
  });

  it("treats steep ground as a wall", () => {
    const grid = flatGrid(20, 20, 10);
    grid.heights.forEach((_, cell) => (grid.heights[cell] = cell % 20 >= 10 ? 10 : 0));
    const slope = slopeDegrees(grid);
    const walls = wallMask(grid, slope, []);
    const wallCols = [...walls.keys()].filter((cell) => walls[cell]).map((cell) => cell % 20);
    expect(new Set(wallCols)).toEqual(new Set([9, 10]));
    expect(slope[5 * 20 + 9]).toBeCloseTo(Math.atan(0.5) * RADIANS_TO_DEGREES, 4);

    const start = center(grid, 10, 2);
    const goal = center(grid, 10, 17);
    expect(findPath(grid, slope, walls, start, goal).status).toBe("no_path");
    const steepWalls = wallMask(grid, slope, [], 90);
    expect(findPath(grid, slope, steepWalls, start, goal, { maxSlopeDeg: 90 }).status).toBe("ok");
  });

  it("blocks cells inside a no-go zone", () => {
    const grid = flatGrid(20, 20, 10);
    const zone: NoGoZone = {
      id: "square",
      name: "Square",
      ring: [
        gridPoint(grid, 8, 8),
        gridPoint(grid, 8, 12),
        gridPoint(grid, 12, 12),
        gridPoint(grid, 12, 8),
      ],
    };
    const walls = wallMask(grid, slopeDegrees(grid), [zone]);
    const expected: number[] = [];
    for (let row = 8; row <= 11; row++)
      for (let col = 8; col <= 11; col++) expected.push(row * 20 + col);
    expect([...walls.keys()].filter((cell) => walls[cell])).toEqual(expected);
  });

  it("reports no_path when the goal is walled in", () => {
    const grid = flatGrid(20, 20, 10);
    const walls = openWalls(grid);
    for (let row = 9; row <= 11; row++)
      for (let col = 9; col <= 11; col++) walls[row * 20 + col] = 1;
    walls[10 * 20 + 10] = 0;
    const result = route(grid, walls, center(grid, 2, 2), center(grid, 10, 10));
    expect(result.status).toBe("no_path");
    expect(result.path).toEqual([]);
  });

  it("reports start_blocked, goal_blocked and outside_grid", () => {
    const grid = flatGrid(20, 20, 10);
    const walls = openWalls(grid);
    walls[3 * 20 + 3] = 1;
    expect(route(grid, walls, center(grid, 3, 3), center(grid, 10, 10)).status).toBe(
      "start_blocked",
    );
    expect(route(grid, walls, center(grid, 10, 10), center(grid, 3, 3)).status).toBe(
      "goal_blocked",
    );
    expect(route(grid, walls, gridPoint(grid, 5, -1), center(grid, 10, 10)).status).toBe(
      "outside_grid",
    );
  });

  it("returns a two-point path when start and goal share a cell", () => {
    const grid = flatGrid(20, 20, 10);
    const start = gridPoint(grid, 4.2, 4.2);
    const goal = gridPoint(grid, 4.7, 4.6);
    const result = route(grid, openWalls(grid), start, goal);
    expect(result).toMatchObject({ status: "ok", path: [start, goal], distance_m: 0 });
  });

  it("matches Dijkstra's cost", () => {
    const grid = flatGrid(40, 40, 10);
    const walls = openWalls(grid);
    let seed = 12345;
    for (let cell = 0; cell < walls.length; cell++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      walls[cell] = seed / 2 ** 31 < 0.25 ? 1 : 0;
    }
    walls[1 * 40 + 1] = 0;
    walls[38 * 40 + 38] = 0;
    const slope = slopeDegrees(grid);
    const start = center(grid, 1, 1);
    const goal = center(grid, 38, 38);
    const astar = findPath(grid, slope, walls, start, goal);
    const dijkstra = findPath(grid, slope, walls, start, goal, { heuristic: false });
    expect(astar.status).toBe("ok");
    expect(Math.abs(astar.distance_m - dijkstra.distance_m)).toBeLessThan(1e-6);
    expect(astar.expanded).toBeLessThanOrEqual(dijkstra.expanded);
  });

  it("sums both legs", () => {
    const grid = flatGrid(11, 11, 100);
    const { outbound, back, summary } = planWalk(
      grid,
      slopeDegrees(grid),
      openWalls(grid),
      center(grid, 5, 0),
      center(grid, 5, 10),
    );
    expect(summary).not.toBeNull();
    expect(summary!.distance_km).toBeCloseTo(1.0, 6);
    expect(summary!.est_time_min).toBeCloseTo(outbound.time_min + back.time_min, 9);
    expect(summary!.farthest_from_base_km).toBeCloseTo(1.0, 6);
    expect(summary!.max_slope).toBe(0);
  });

  it("avoids the placeholder zone on the real tile", async () => {
    const png = PNG.sync.read(await readFile("lib/mars/fixtures/hab-display.png"));
    const grid = gridFromTiles(9, 5, 182, [[png.data]]);
    const slope = slopeDegrees(grid);
    const walls = wallMask(grid, slope, [EXAMPLE_ZONE]);
    const result = findPath(grid, slope, walls, [-176.05, 45.97], [-175.95, 46.03]);
    expect(result.status).toBe("ok");
    const zoneWalls = wallMask(grid, new Float32Array(walls.length), [EXAMPLE_ZONE]);
    expect(zoneWalls.some((wall) => wall === 1)).toBe(true);
    for (const cell of cellsOf(grid, result.path)) expect(zoneWalls[cell]).toBe(0);
  });
});
