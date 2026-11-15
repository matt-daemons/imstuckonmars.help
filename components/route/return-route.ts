import type { Plan } from "@/components/map/route-layers";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { RouteLegProperties } from "@/lib/mars/types";
import type { ReturnRoute } from "@/lib/mission/types";

import type { MissionType } from "./route-plan";

/** The way home from the farthest point, timed by our own planner. */
export interface PlannedReturn {
  id: string;
  duration_s: number;
}

/**
 * What LARA's return check gets: a walk sends the walk back to the habitat; a drive + walk sends
 * only the walk back to the rover, which is the shelter. Null while there is no planned route.
 */
export function plannedReturn(
  mission: MissionType,
  walk: Plan | null,
  trip: DriveWalkPlan | null,
): PlannedReturn | null {
  if (mission === "walking") {
    if (!walk?.summary) return null;
    return { id: "walk-back-to-habitat", duration_s: Math.round(walk.back.time_min * 60) };
  }
  const walkBack = trip?.collection?.features
    .map((feature) => feature.properties)
    .find(
      (leg): leg is RouteLegProperties =>
        leg.kind === "route-leg" && leg.mode === "walk" && leg.to === "staging",
    );
  if (!walkBack) return null;
  return {
    id: `${walkBack.route_id}-walk-back`,
    duration_s: Math.round(walkBack.est_time_min * 60),
  };
}

/** The assess-return body, for the session's current revision, base and mission clock. */
export function returnRequest(
  planned: PlannedReturn,
  session: { revision: number; baseId: string; atS: number },
): { at_s: number; route: ReturnRoute } {
  return {
    at_s: session.atS,
    route: {
      id: planned.id,
      // The planner keeps no revision counter; the timed return stands in for one.
      revision: `${planned.duration_s} s`,
      mission_revision: session.revision,
      base_id: session.baseId,
      evaluated_at_s: session.atS,
      status: "ok",
      legs: [{ activity: "return", duration_s: planned.duration_s }],
      warnings: [],
    },
  };
}
