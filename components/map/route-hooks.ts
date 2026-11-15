import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { planDriveWalk } from "@/lib/mars/drive-walk";
import type { PowerSource } from "@/lib/mars/driving";
import { loadDriveGrid } from "@/lib/mars/load-route-grid";
import { toGridLng, type RouteGrid } from "@/lib/mars/route-grid";
import { slopeDegrees, wallMask, type NoGoZone } from "@/lib/mars/routing";
import { loadSiteGrid, type SiteGrid, type SiteInfo } from "@/lib/mars/site-grid";
import type { LngLat } from "@/lib/mars/types";

import type { SitePoi } from "./scene-panel";

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

/** Loads the walk grid around a site, again each time the site changes. */
function useSiteGrid(site: SiteInfo | null) {
  const [loaded, setLoaded] = useState<{ site: SiteInfo; grid: SiteGrid | null } | null>(null);
  useEffect(() => {
    if (!site) return;
    const controller = new AbortController();
    loadSiteGrid(site, controller.signal).then(
      (grid) => setLoaded({ site, grid }),
      () => {
        if (!controller.signal.aborted) setLoaded({ site, grid: null });
      },
    );
    return () => controller.abort();
  }, [site]);
  // A grid loaded for an earlier site is stale: its walls are around another POI.
  const current = site && loaded?.site === site ? loaded : null;
  return { grid: current?.grid ?? null, failed: current !== null && current.grid === null };
}

export interface DriveWalkInputs {
  /** Map longitudes, −180..180. */
  start: LngLat;
  /** The site to walk at, or null when the end was set on the map. */
  destination: SitePoi | null;
  power: PowerSource;
  samplingMin: number;
  zones: NoGoZone[];
}

export type DriveWalk = ReturnType<typeof useDriveWalk>;

/**
 * Loads the rover strip and the destination's walk grid, then plans the drive + walk in a deferred
 * render: the panel first shows that it is planning, then A* runs over the rover strip (in Chrome,
 * about 0.3 s for the nearest site and 3.7 s for the farthest) and over the site. The plan is null
 * until both terrains are in and while a new plan is being made.
 */
export function useDriveWalk(inputs: DriveWalkInputs, enabled: boolean) {
  const { start, destination, power, samplingMin, zones } = inputs;
  const drive = useLoadedGrid(loadDriveGrid, enabled);
  const site = useMemo(
    () =>
      enabled && destination
        ? { id: destination.id, hiriseId: destination.hiriseId, poi: destination.center }
        : null,
    [enabled, destination],
  );
  const siteGrid = useSiteGrid(site);
  const latest = useMemo(
    () =>
      drive.grid && site && siteGrid.grid
        ? { driveGrid: drive.grid, site, siteGrid: siteGrid.grid, start, power, samplingMin, zones }
        : null,
    [drive.grid, site, siteGrid.grid, start, power, samplingMin, zones],
  );
  const request = useDeferredValue(latest);
  const requestGrid = request?.driveGrid ?? null;
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
      planDriveWalk(
        request.driveGrid,
        slope,
        walls,
        request.siteGrid,
        request.site,
        request.start,
        request.power,
        request.samplingMin,
      ),
    [request, slope, walls],
  );
  return {
    driveGrid: drive.grid,
    driveFailed: drive.failed,
    siteGrid: siteGrid.grid,
    siteFailed: siteGrid.failed,
    // While a new trip is being planned the old one is stale, so neither the panel nor the map shows it.
    plan: request === latest ? plan : null,
  };
}

// The strip runs 171–196° E, so points west of 0 move up by 360° before lookup.
function inGrid(grid: RouteGrid, [lng, lat]: LngLat): LngLat {
  return [toGridLng(grid, lng), lat];
}
