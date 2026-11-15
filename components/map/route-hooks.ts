import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { planDrive, type PowerSource } from "@/lib/mars/driving";
import { toGridLng, type RouteGrid } from "@/lib/mars/route-grid";
import { slopeDegrees, wallMask, type NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

/** Loads a terrain grid the first time it is wanted and keeps it. A failed load is not retried. */
export function useLoadedGrid(load: (signal: AbortSignal) => Promise<RouteGrid>, wanted: boolean) {
  const [grid, setGrid] = useState<RouteGrid | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted || grid || failed) return;
    const controller = new AbortController();
    load(controller.signal).then(setGrid, () => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [load, wanted, grid, failed]);
  return { grid, failed };
}

export interface DriveInputs {
  /** Map longitudes, −180..180. */
  start: LngLat;
  end: LngLat;
  power: PowerSource;
  zones: NoGoZone[];
}

/**
 * Plans the drive in a deferred render: the panel first shows that it is planning, then A* runs
 * over the rover strip (in Chrome, about 0.3 s for the nearest site and 3.7 s for the farthest).
 */
export function useDrivePlan(grid: RouteGrid | null, inputs: DriveInputs, enabled: boolean) {
  const { start, end, power, zones } = inputs;
  const latest = useMemo(
    () => (enabled && grid ? { grid, start, end, power, zones } : null),
    [enabled, grid, start, end, power, zones],
  );
  const request = useDeferredValue(latest);
  const requestGrid = request?.grid ?? null;
  const requestZones = request?.zones ?? null;
  const slope = useMemo(() => requestGrid && slopeDegrees(requestGrid), [requestGrid]);
  const walls = useMemo(
    () =>
      requestGrid &&
      slope &&
      requestZones &&
      wallMask(
        requestGrid,
        slope,
        requestZones.map((zone) => ({
          ...zone,
          ring: zone.ring.map((p) => inGrid(requestGrid, p)),
        })),
        ROVER_RULES.slope.no_go_above_degrees,
      ),
    [requestGrid, slope, requestZones],
  );
  const plan = useMemo(
    () =>
      request &&
      slope &&
      walls &&
      planDrive(
        request.grid,
        slope,
        walls,
        inGrid(request.grid, request.start),
        inGrid(request.grid, request.end),
        request.power,
      ),
    [request, slope, walls],
  );
  return { plan, planning: request !== latest };
}

// The strip runs 171–196° E, so points west of 0 move up by 360° before lookup.
function inGrid(grid: RouteGrid, [lng, lat]: LngLat): LngLat {
  return [toGridLng(grid, lng), lat];
}
