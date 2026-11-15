import { describe, expect, it } from "vitest";

import { GROUND } from "../flight-rules/rover-rules";
import {
  type DriveGrid,
  drivingCost,
  groundOf,
  NO_THERMAL_INERTIA,
  planDrive,
  stepEnergyWh,
} from "./driving";
import { cellAt, cellCenter, type RouteGrid } from "./route-grid";
import { findPath, slopeDegrees } from "./routing";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const RADIANS_TO_DEGREES = 180 / Math.PI;

/** A grid centred on the equator with square cells of cellM metres, heights of 0 and no thermal-inertia data. */
function flatGrid(width: number, height: number, cellM: number): DriveGrid {
  const cellDeg = (cellM / MARS_RADIUS_M) * RADIANS_TO_DEGREES;
  return {
    width,
    height,
    west: 0,
    east: width * cellDeg,
    rowEdges: Float64Array.from({ length: height + 1 }, (_, edge) => (height / 2 - edge) * cellDeg),
    heights: new Float32Array(width * height),
    thermalInertia: new Int16Array(width * height).fill(NO_THERMAL_INERTIA),
  };
}

const LOOSE_DUST_TI = 90;
const FIRM_TI = 450;

function center(grid: RouteGrid, row: number, col: number): LngLat {
  return cellCenter(grid, row * grid.width + col);
}

describe("groundOf", () => {
  it("sorts thermal inertia into the pipeline's classes, and a gap into no data", () => {
    expect(groundOf(LOOSE_DUST_TI)).toBe("loose_dust");
    expect(groundOf(149)).toBe("loose_dust");
    expect(groundOf(150)).toBe("sand_crust");
    expect(groundOf(399)).toBe("sand_crust");
    expect(groundOf(400)).toBe("firm");
    expect(groundOf(NO_THERMAL_INERTIA)).toBe("no_data");
  });

  it("doubles rolling resistance on loose dust; a gap keeps the study's 0.15", () => {
    expect(GROUND.loose_dust.rolling_resistance).toBeCloseTo(0.3, 9);
    expect(GROUND.sand_crust.rolling_resistance).toBe(0.15);
    expect(GROUND.firm.rolling_resistance).toBe(0.15);
    expect(GROUND.no_data.rolling_resistance).toBe(0.15);
  });
});

describe("stepEnergyWh", () => {
  it("costs about 1.4 kWh per flat km on firm ground, and about 2.6 kWh on loose dust", () => {
    expect(stepEnergyWh(1000, 0, GROUND.firm.rolling_resistance)).toBeCloseTo(1415, -1);
    expect(stepEnergyWh(1000, 0, GROUND.loose_dust.rolling_resistance)).toBeCloseTo(2599, -1);
  });

  it("gets nothing back downhill: only life support is left", () => {
    const lengthKm = Math.hypot(1000, 200) / 1000;
    const speedKmh = 8 - 0.175 * Math.atan2(200, 1000) * RADIANS_TO_DEGREES;
    expect(stepEnergyWh(1000, -200, 0.15)).toBeCloseTo((1850 * lengthKm) / speedKmh, 6);
  });
});

describe("drivingCost", () => {
  it("never costs less per metre than the heuristic's bound, on any ground or slope", () => {
    const { costPerMetreLowerBound } = drivingCost(flatGrid(1, 1, 100));
    for (const { rolling_resistance } of Object.values(GROUND)) {
      for (let degrees = -10; degrees <= 10; degrees++) {
        const rise = 100 * Math.tan((degrees * Math.PI) / 180);
        const perMetre = stepEnergyWh(100, rise, rolling_resistance) / Math.hypot(100, rise);
        expect(perMetre).toBeGreaterThanOrEqual(costPerMetreLowerBound);
      }
    }
  });

  it("charges a step half of each cell's ground", () => {
    const grid = flatGrid(2, 1, 100);
    grid.thermalInertia.set([LOOSE_DUST_TI, FIRM_TI]);
    const halfAndHalf = (GROUND.loose_dust.rolling_resistance + 0.15) / 2;
    expect(drivingCost(grid).stepCost(100, 0, 0, 1)).toBeCloseTo(
      stepEnergyWh(100, 0, halfAndHalf),
      9,
    );
  });
});

describe("energy-cost A*", () => {
  // A 300 m cone with 31° sides between start and goal: short to drive over, costly to climb.
  const grid = flatGrid(31, 31, 100);
  grid.heights.forEach((_, cell) => {
    const r = Math.hypot(Math.floor(cell / 31) - 15, (cell % 31) - 15);
    grid.heights[cell] = Math.max(0, 300 - 60 * r);
  });
  // Loose dust on the cone's lower slopes south of it, so the cheapest way round is north.
  grid.thermalInertia.forEach((_, cell) => {
    grid.thermalInertia[cell] = Math.floor(cell / 31) > 15 ? LOOSE_DUST_TI : FIRM_TI;
  });
  const slope = slopeDegrees(grid);
  const walls = new Uint8Array(grid.width * grid.height);
  const start = center(grid, 15, 3);
  const goal = center(grid, 15, 27);
  const highest = (path: LngLat[]) => Math.max(...path.map((p) => grid.heights[cellAt(grid, p)!]));
  const options = { maxSlopeDeg: 90, cost: drivingCost(grid) };

  it("drives round the hill that the shortest path climbs, on the firm side", () => {
    const shortest = findPath(grid, slope, walls, start, goal, { maxSlopeDeg: 90 });
    const driving = findPath(grid, slope, walls, start, goal, options);
    expect(highest(shortest.path)).toBeGreaterThan(200);
    expect(highest(driving.path)).toBeLessThan(50);
    expect(driving.distance_m).toBeGreaterThan(shortest.distance_m);
    expect(driving.path.every(([, lat]) => lat >= center(grid, 15, 0)[1])).toBe(true);
  });

  it("matches Dijkstra's energy on mixed ground, so the heuristic never overestimates", () => {
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

  it("falls back to 0.15 where there is no thermal-inertia data, and says how far that is", () => {
    const { summary } = drive("fission");
    const firm = flatGrid(100, 3, 1000);
    firm.thermalInertia.fill(FIRM_TI);
    const onFirm = planDrive(
      firm,
      slopeDegrees(firm),
      walls,
      center(firm, 1, 2),
      center(firm, 1, 95),
      "fission",
    );
    expect(summary!.hardest_sol_kwh).toBeCloseTo(onFirm.summary!.hardest_sol_kwh, 9);
    expect(summary!.ground_km.no_data).toBeCloseTo(93 * 2, 6);
    expect(onFirm.summary!.ground_km.firm).toBeCloseTo(93 * 2, 6);
    expect(onFirm.summary!.ground_km.no_data).toBe(0);
  });

  it("drains about 1.8× the battery per sol on loose dust", () => {
    const dusty = flatGrid(100, 3, 1000);
    dusty.thermalInertia.fill(LOOSE_DUST_TI);
    const plan = planDrive(
      dusty,
      slopeDegrees(dusty),
      walls,
      center(dusty, 1, 2),
      center(dusty, 1, 95),
      "fission",
    );
    // A full 46 km sol at about 2.599 kWh per odometer km instead of 1.415.
    expect(plan.summary!.hardest_sol_kwh).toBeGreaterThanOrEqual(46 * 2.599);
    expect(plan.summary!.hardest_sol_kwh).toBeLessThan(47.3 * 2.599);
    expect(plan.summary!.ground_km.loose_dust).toBeCloseTo(93 * 2, 6);
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
