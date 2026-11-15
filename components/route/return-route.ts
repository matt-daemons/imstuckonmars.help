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
 * What LARA's return check gets: a walk sends the walk back to its start (the habitat unless the
 * start was moved); a drive + walk sends only the walk back to the rover, which is the shelter.
 * Null while there is no planned route.
 */
export function plannedReturn(
  mission: MissionType,
  walk: Plan | null,
  trip: DriveWalkPlan | null,
  fromHabitat: boolean,
): PlannedReturn | null {
  if (mission === "walking") {
    if (!walk?.summary) return null;
    return {
      id: fromHabitat ? "walk-back-to-habitat" : "walk-back-to-start",
      duration_s: Math.round(walk.back.time_min * 60),
    };
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

// While the mission clock plays, the check is sent again every 5 mission minutes.
const RECHECK_S = 300;

/** Identifies one return check: a new key sends it again. */
export function returnCheckKey(
  planned: PlannedReturn,
  session: { revision: number; playing: boolean; atS: number },
): string {
  const bucket = session.playing ? Math.floor(session.atS / RECHECK_S) : "paused";
  return `${planned.id} ${planned.duration_s} ${session.revision} ${bucket}`;
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

// The reasons lib/mission/engine.ts assessReturn can give, in words a crew member reads at a glance.
const REASON_TEXT: Record<string, string> = {
  stale_route_or_different_base: "the route is out of date or starts at another base",
  source_unavailable: "LARA's data source is unavailable",
  no_path: "the planner found no path",
  unknown_data: "the planner is missing data",
  simulated_route_blocked: "a simulated event blocked the route",
  return_legs_missing: "the route has no legs",
  eva_time_limit_unknown: "the EVA time limit is not set",
  portable_discharge_power_limit: "the suit battery cannot supply that much power",
  future_scenario_events_not_projected:
    "a scenario event is scheduled during the walk back, and LARA does not project it",
  prior_unmet_resource_demand: "the mission already ran short of oxygen or energy",
};

/** A backend reason code in plain words; an unknown code is shown with spaces instead of underscores. */
export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? code.replaceAll("_", " ");
}
