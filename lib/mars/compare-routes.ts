import { cellAt, type RouteGrid } from "./route-grid";
import { marsDistanceM } from "./routing";
import type { LngLat } from "./types";

/** One point of a route: how far along it lies, and the ground under it. */
export interface ProfilePoint {
  /** Horizontal metres from the start of the path. */
  distance_m: number;
  height_m: number;
  slope_deg: number;
}

/** The height and slope under each point of a path, read from the grid it was planned on. */
export function routeProfile(grid: RouteGrid, slope: Float32Array, path: LngLat[]): ProfilePoint[] {
  let distance = 0;
  return path.map((point, i) => {
    if (i > 0) distance += marsDistanceM(path[i - 1], point);
    // Safe: the path was planned on this grid, so every point lies inside it.
    const cell = cellAt(grid, point)!;
    return { distance_m: distance, height_m: grid.heights[cell], slope_deg: slope[cell] };
  });
}

/** Metres climbed: the sum of every rise, descents not subtracted. */
export function ascentM(heights: number[]): number {
  let climbed = 0;
  for (let i = 1; i < heights.length; i++) climbed += Math.max(0, heights[i] - heights[i - 1]);
  return climbed;
}

/**
 * The stretches of a profile on ground steeper than limitDeg, as [from, to] in metres. A step
 * counts when either of its ends is steeper, as gentleWalkCost weighs a step by the steeper cell.
 */
export function steepStretches(profile: ProfilePoint[], limitDeg: number): [number, number][] {
  const stretches: [number, number][] = [];
  for (let i = 1; i < profile.length; i++) {
    const from = profile[i - 1];
    const to = profile[i];
    if (Math.max(from.slope_deg, to.slope_deg) <= limitDeg) continue;
    const last = stretches.at(-1);
    if (last && last[1] === from.distance_m) last[1] = to.distance_m;
    else stretches.push([from.distance_m, to.distance_m]);
  }
  return stretches;
}
