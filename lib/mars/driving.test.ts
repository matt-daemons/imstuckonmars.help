import { describe, expect, it } from "vitest";

import { DRIVING_COST, planDrive, stepEnergyWh } from "./driving";
import { cellAt, cellCenter, type RouteGrid } from "./route-grid";
import { findPath, slopeDegrees } from "./routing";
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

describe("stepEnergyWh", () => {
  it("costs about 1.4 kWh per flat km, and about 2.6 kWh on bad terrain", () => {
    expect(stepEnergyWh(1000, 0, 1)).toBeCloseTo(1415, -1);
    expect(stepEnergyWh(1000, 0, 2)).toBeCloseTo(2599, -1);
  });

  it("gets nothing back downhill: only life support is left", () => {
    const lengthKm = Math.hypot(1000, 200) / 1000;
    const speedKmh = 8 - 0.175 * Math.atan2(200, 1000) * RADIANS_TO_DEGREES;
    expect(stepEnergyWh(1000, -200, 1)).toBeCloseTo((1850 * lengthKm) / speedKmh, 6);
  });
});

describe("energy-cost A*", () => {
  // A 300 m cone with 31° sides between start and goal: short to drive over, costly to climb.
  const grid = flatGrid(31, 31, 100);
  grid.heights.forEach((_, cell) => {
    const r = Math.hypot(Math.floor(cell / 31) - 15, (cell % 31) - 15);
    grid.heights[cell] = Math.max(0, 300 - 60 * r);
  });
  const slope = slopeDegrees(grid);
  const walls = new Uint8Array(grid.width * grid.height);
  const start = center(grid, 15, 3);
  const goal = center(grid, 15, 27);
  const highest = (path: LngLat[]) => Math.max(...path.map((p) => grid.heights[cellAt(grid, p)!]));

  it("drives round the hill that the shortest path climbs", () => {
    const shortest = findPath(grid, slope, walls, start, goal, { maxSlopeDeg: 90 });
    const driving = findPath(grid, slope, walls, start, goal, {
      maxSlopeDeg: 90,
      cost: DRIVING_COST,
    });
    expect(highest(shortest.path)).toBeGreaterThan(200);
    expect(highest(driving.path)).toBeLessThan(50);
    expect(driving.distance_m).toBeGreaterThan(shortest.distance_m);
  });

  it("matches Dijkstra's energy, so the heuristic never overestimates", () => {
    const options = { maxSlopeDeg: 90, cost: DRIVING_COST };
    const astar = findPath(grid, slope, walls, start, goal, options);
    const dijkstra = findPath(grid, slope, walls, start, goal, { ...options, heuristic: false });
    expect(astar.cost).toBeCloseTo(dijkstra.cost, 6);
    expect(astar.expanded).toBeLessThanOrEqual(dijkstra.expanded);
  });
});

describe("planDrive", () => {
  // 93 km across flat ground, like the nearest ice site.
  const grid = flatGrid(100, 3, 1000);
  const walls = new Uint8Array(grid.width * grid.height);
  const drive = (power: "fission" | "solar") =>
    planDrive(grid, slopeDegrees(grid), walls, center(grid, 1, 2), center(grid, 1, 95), power);

  it("takes about 6 sols with fission power", () => {
    const { summary } = drive("fission");
    expect(summary).toMatchObject({ power: "fission", sols: 6, max_slope: 0 });
    expect(summary!.one_way_km).toBeCloseTo(93, 6);
    expect(summary!.straight_km).toBeCloseTo(93, 3);
    expect(summary!.odometer_km).toBeCloseTo(93 * 2 * 1.3, 6);
    // A full 46 km sol at about 1.415 kWh per odometer km; whole steps of 1.3 km, so up to one step more.
    const hardest = summary!.hardest_sol_kwh;
    expect(hardest).toBeGreaterThanOrEqual(46 * 1.415);
    expect(hardest).toBeLessThan(47.3 * 1.415);
    expect(summary!.battery_left_percent).toBeCloseTo(((200 - hardest) / 200) * 100, 9);
    expect(summary!.reserve_km).toBeCloseTo((160 - hardest) / 2.599, 1);
  });

  it("takes about 18 sols with solar power, with the night on the battery", () => {
    const { summary } = drive("solar");
    expect(summary!.sols).toBe(18);
    const overnight = 1.85 * 12.3;
    expect(summary!.hardest_sol_kwh).toBeGreaterThanOrEqual(14 * 1.415 + overnight);
    expect(summary!.hardest_sol_kwh).toBeLessThan(15.3 * 1.415 + overnight);
  });

  it("has no summary when a leg fails", () => {
    const blocked = new Uint8Array(walls.length);
    for (let row = 0; row < 3; row++) blocked[row * 100 + 50] = 1;
    const result = planDrive(
      grid,
      slopeDegrees(grid),
      blocked,
      center(grid, 1, 2),
      center(grid, 1, 95),
      "fission",
    );
    expect(result.outbound.status).toBe("no_path");
    expect(result.summary).toBeNull();
  });
});
