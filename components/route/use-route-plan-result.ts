import { useMemo } from "react";

import { nearestFirst } from "@/components/map/drive-controls";
import { useDriveWalk, useLoadedGrid, type DriveWalk } from "@/components/map/route-hooks";
import type { Plan } from "@/components/map/route-layers";
import type { SitePoi } from "@/components/map/scene-panel";
import { loadBaseGrid } from "@/lib/mars/load-route-grid";
import { planWalk, slopeDegrees, wallMask } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import type { RoutePlanInputs } from "./route-plan";

export interface RoutePlanResult {
  /** The walk from start to end and back, null until the elevation grid is in. */
  walk: { plan: Plan | null; loadFailed: boolean };
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
  const { mission, start, end, power, samplingMin, zones } = inputs;
  const { grid, failed: loadFailed } = useLoadedGrid(loadBaseGrid, true);
  const destinations = useMemo(() => nearestFirst(sites, base), [sites, base]);
  const destination = destinations.find((site) => samePoint(site.center, end)) ?? null;

  const slope = useMemo(() => grid && slopeDegrees(grid), [grid]);
  const walls = useMemo(() => grid && slope && wallMask(grid, slope, zones), [grid, slope, zones]);
  const plan = useMemo(
    () => grid && slope && walls && planWalk(grid, slope, walls, start, end),
    [grid, slope, walls, start, end],
  );
  const journey = useDriveWalk(
    { start, destination, power, samplingMin, zones },
    mission === "drive-walk",
  );
  return { walk: { plan, loadFailed }, journey, destinations, destination };
}

export function samePoint([lngA, latA]: LngLat, [lngB, latB]: LngLat): boolean {
  return lngA === lngB && latA === latB;
}
