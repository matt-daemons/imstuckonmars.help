import { useMemo } from "react";

import { nearestFirst } from "@/components/map/drive-controls";
import { useDriveWalk, useLoadedGrid, type DriveWalk } from "@/components/map/route-hooks";
import type { Plan } from "@/components/map/route-layers";
import type { SitePoi } from "@/components/map/scene-panel";
import { gentleWalkCost } from "@/lib/mars/drive-walk";
import { loadBaseGrid } from "@/lib/mars/load-route-grid";
import type { RouteGrid } from "@/lib/mars/route-grid";
import { planWalk, slopeDegrees, wallMask } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import type { RoutePlanInputs } from "./route-plan";

export interface RoutePlanResult {
  walk: {
    /** The walk from start to end and back on gentle ground, null until the elevation grid is in. */
    plan: Plan | null;
    /** The shortest walk within the same walls, planned only while routes are compared. */
    shortest: Plan | null;
    /** The grid both walks were planned on, for their profiles. */
    terrain: { grid: RouteGrid; slope: Float32Array } | null;
    loadFailed: boolean;
  };
  /** The drive + walk; it loads and plans only while that mission is chosen. */
  journey: DriveWalk;
  /** The sites, nearest to the base first. */
  destinations: SitePoi[];
  /** The site the end is on, or null when the end was set on the map. */
  destination: SitePoi | null;
}

/**
 * Plans the walk and, for a drive + walk mission, the trip, from the current inputs. Called once,
 * by RoutePlanProvider, so A* runs once however many panels read the result.
 */
export function useRoutePlanResult(
  inputs: RoutePlanInputs,
  base: LngLat,
  sites: SitePoi[],
): RoutePlanResult {
  const { mission, start, end, power, samplingMin, zones, step, showShortest } = inputs;
  const { grid, failed: loadFailed } = useLoadedGrid(loadBaseGrid, true);
  const destinations = useMemo(() => nearestFirst(sites, base), [sites, base]);
  const destination = destinations.find((site) => samePoint(site.center, end)) ?? null;
  // The shortest route is only for comparing, so it is planned only while step ③ or the map shows it.
  const compare = step === "check" || showShortest;

  const slope = useMemo(() => grid && slopeDegrees(grid), [grid]);
  const walls = useMemo(() => grid && slope && wallMask(grid, slope, zones), [grid, slope, zones]);
  const path = useMemo(
    () => grid && slope && walls && planWalk(grid, slope, walls, start, end, gentleWalkCost(slope)),
    [grid, slope, walls, start, end],
  );
  const walkCompared = compare && mission === "walking";
  const shortestPath = useMemo(
    () =>
      walkCompared && grid && slope && walls ? planWalk(grid, slope, walls, start, end) : null,
    [walkCompared, grid, slope, walls, start, end],
  );
  const terrain = useMemo(() => (grid && slope ? { grid, slope } : null), [grid, slope]);
  // Time at the end counts towards suit time, as it does for a drive + walk.
  const plan = useMemo(
    () => withSamplingTime(path, samplingMin),
    [path, samplingMin],
  );
  const shortest = useMemo(
    () => withSamplingTime(shortestPath, samplingMin),
    [shortestPath, samplingMin],
  );
  const journey = useDriveWalk(
    { start, destination, power, samplingMin, zones, compare },
    mission === "drive-walk",
  );
  return {
    walk: { plan, shortest, terrain, loadFailed },
    journey,
    destinations,
    destination,
  };
}

export function samePoint([lngA, latA]: LngLat, [lngB, latB]: LngLat): boolean {
  return lngA === lngB && latA === latB;
}

function withSamplingTime(plan: Plan | null, minutes: number): Plan | null {
  return plan && {
    ...plan,
    summary: plan.summary && { ...plan.summary, est_time_min: plan.summary.est_time_min + minutes },
  };
}
