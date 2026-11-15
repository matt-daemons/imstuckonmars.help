import { useEffect, useMemo, useState } from "react";
import { nearestFirst } from "@/components/map/drive-controls";
import type { DriveWalk } from "@/components/map/route-hooks";
import type { Plan } from "@/components/map/route-layers";
import type { SitePoi } from "@/components/map/scene-panel";
import type { PlannerRequest, PlannerResponse } from "@/lib/mars/planner-contract";
import type { RouteComparison } from "@/lib/mars/route-comparison";
import type { LngLat } from "@/lib/mars/types";
import type { RoutePlanInputs } from "./route-plan";

export interface RoutePlanResult {
  walk: { plan: Plan | null; shortest: Plan | null; terrain: null; loadFailed: boolean };
  journey: DriveWalk;
  comparison?: RouteComparison | null;
  planningError?: string;
  cache?: string;
  retryPlanning?: () => void;
  destinations: SitePoi[];
  destination: SitePoi | null;
}

/** The browser sends choices only; terrain decoding and all route calculations run on the server. */
export function useRoutePlanResult(
  inputs: RoutePlanInputs,
  base: LngLat,
  sites: SitePoi[],
): RoutePlanResult {
  const destinations = useMemo(() => nearestFirst(sites, base), [sites, base]);
  const end = inputs.end;
  const destination = end
    ? (destinations.find((site) => samePoint(site.center, end)) ?? null)
    : null;
  const compare =
    inputs.step === "check" ||
    inputs.showShortest ||
    (inputs.step === "run" && inputs.route === "shortest");
  const request: PlannerRequest | null =
    inputs.mission === "walking" && inputs.end
      ? {
          mission: "walking",
          start: inputs.start,
          end: inputs.end,
          samplingMin: inputs.samplingMin,
          zones: inputs.zones,
          compare,
        }
      : inputs.mission === "drive-walk" && destination
        ? {
            mission: "drive-walk",
            start: inputs.start,
            siteId: destination.id,
            power: inputs.power,
            samplingMin: inputs.samplingMin,
            zones: inputs.zones,
            compare,
          }
        : null;
  const key = request ? JSON.stringify(request) : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    response: PlannerResponse | null;
    error: string | null;
    cache: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/routes/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: key,
            signal: controller.signal,
          });
          if (!response.ok) {
            const body = (await response.json()) as { error?: { message?: string } };
            throw new Error(body.error?.message ?? "Route calculation failed. Retry the route.");
          }
          const body = (await response.json()) as PlannerResponse;
          if (!controller.signal.aborted)
            setLoaded({
              key,
              response: body,
              error: null,
              cache: response.headers.get("X-Route-Cache") ?? "unknown",
            });
        } catch (error) {
          if (!controller.signal.aborted)
            setLoaded({
              key,
              response: null,
              error: error instanceof Error ? error.message : "Route calculation failed.",
              cache: "unknown",
            });
        }
      })();
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt]);
  const current = loaded?.key === key ? loaded : null;
  const result = current?.response?.result;
  const walk = result?.mission === "walking" ? result : null;
  const trip = result?.mission === "drive-walk" ? result : null;
  return {
    walk: {
      plan: walk?.plan ?? null,
      shortest: walk?.shortest ?? null,
      terrain: null,
      loadFailed: inputs.mission === "walking" && !!current?.error,
    },
    journey: {
      plan: trip?.plan ?? null,
      shortest: trip?.shortest ?? null,
      driveGrid: null,
      driveSlope: null,
      siteGrid: trip ? { boulders: trip.boulders } : null,
      driveCellM: trip?.driveCellM,
      driveFailed: false,
      siteFailed: false,
      error: current?.error ?? undefined,
    },
    comparison: result?.comparison ?? null,
    planningError: current?.error ?? undefined,
    cache: current?.cache,
    retryPlanning: () => {
      setLoaded(null);
      setAttempt((value) => value + 1);
    },
    destinations,
    destination,
  };
}

export function samePoint([lngA, latA]: LngLat, [lngB, latB]: LngLat): boolean {
  return lngA === lngB && latA === latB;
}
