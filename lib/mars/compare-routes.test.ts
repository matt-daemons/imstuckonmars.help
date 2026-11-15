import { describe, expect, it } from "vitest";

import { ascentM, routeProfile, steepStretches, type ProfilePoint } from "./compare-routes";
import { gentleWalkCost } from "./drive-walk";
import { cellAt, cellCenter, type RouteGrid } from "./route-grid";
import { planWalk, wallMask } from "./routing";
import { MARS_RADIUS_M } from "./terrain";

const DEG_PER_M = 180 / Math.PI / MARS_RADIUS_M;

/** A grid of square cells starting at 0° E and centred on the equator, with the given heights. */
function equatorGrid(width: number, height: number, cellM: number, heights?: number[]): RouteGrid {
  const cellDeg = cellM * DEG_PER_M;
  return {
    width,
    height,
    west: 0,
    east: width * cellDeg,
    rowEdges: Float64Array.from({ length: height + 1 }, (_, edge) => (height / 2 - edge) * cellDeg),
    heights: heights ? Float32Array.from(heights) : new Float32Array(width * height),
  };
}

describe("ascentM", () => {
  it("sums every rise and ignores descents", () => {
    expect(ascentM([0, 5, 3, 10, 10, 2])).toBe(12);
  });

  it("is 0 for a path with no rise", () => {
    expect(ascentM([])).toBe(0);
    expect(ascentM([7])).toBe(0);
    expect(ascentM([9, 4, 1])).toBe(0);
  });
});

describe("routeProfile", () => {
  // One row of five 10 m cells, each 3 m higher than the last.
  const grid = equatorGrid(5, 1, 10, [0, 3, 6, 9, 12]);
  const slope = Float32Array.from([1, 2, 3, 4, 5]);

  it("reads the height and slope of the cell under each path point, in path order", () => {
    const path = [0, 1, 2, 3, 4].map((cell) => cellCenter(grid, cell));
    const profile = routeProfile(grid, slope, path);
    expect(profile.map((point) => point.height_m)).toEqual([0, 3, 6, 9, 12]);
    expect(profile.map((point) => point.slope_deg)).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts horizontal distance along the path from 0", () => {
    const path = [0, 1, 2, 1].map((cell) => cellCenter(grid, cell));
    const distances = routeProfile(grid, slope, path).map((point) => point.distance_m);
    [0, 10, 20, 30].forEach((metres, i) => expect(distances[i]).toBeCloseTo(metres, 6));
  });
});

describe("steepStretches", () => {
  const profile = (slopes: number[]): ProfilePoint[] =>
    slopes.map((slope_deg, i) => ({ distance_m: i * 10, height_m: 0, slope_deg }));

  it("joins neighbouring steps that touch ground over the limit", () => {
    expect(steepStretches(profile([0, 0, 20, 20, 0, 0, 20]), 15)).toEqual([
      [10, 40],
      [50, 60],
    ]);
  });

  it("is empty when no ground is over the limit", () => {
    expect(steepStretches(profile([0, 15, 3]), 15)).toEqual([]);
    expect(steepStretches(profile([30]), 15)).toEqual([]);
  });
});

describe("shortest and gentle walks", () => {
  // 41 × 21 cells of 10 m: an 18° band across the middle, open only along the top three rows.
  const grid = equatorGrid(41, 21, 10);
  const slope = new Float32Array(41 * 21).map((_, cell) => {
    const row = Math.floor(cell / 41);
    const col = cell % 41;
    return row >= 3 && col >= 15 && col <= 25 ? 18 : 0;
  });
  const start = cellCenter(grid, 10 * 41 + 2);
  const goal = cellCenter(grid, 10 * 41 + 38);

  it("the shortest walk is no longer than the gentle one", () => {
    const walls = wallMask(grid, slope, []);
    const gentle = planWalk(grid, slope, walls, start, goal, gentleWalkCost(slope));
    const shortest = planWalk(grid, slope, walls, start, goal);
    expect(shortest.summary!.distance_km).toBeLessThan(gentle.summary!.distance_km);
    expect(shortest.summary!.max_slope).toBe(18);
    expect(gentle.summary!.max_slope).toBe(0);
  });

  it("the shortest walk keeps out of walls", () => {
    // A wall down column 20, open only in the top row, so the straight line is blocked.
    const walls = new Uint8Array(41 * 21).map((_, cell) =>
      cell % 41 === 20 && cell >= 41 ? 1 : 0,
    );
    const { outbound, back, summary } = planWalk(grid, slope, walls, start, goal);
    expect(summary).not.toBeNull();
    for (const point of [...outbound.path, ...back.path]) {
      expect(walls[cellAt(grid, point)!]).toBe(0);
    }
  });
});
