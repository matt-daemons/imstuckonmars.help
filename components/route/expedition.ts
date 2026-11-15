import type { DriveWalk } from "@/components/map/route-hooks";
import type { SimulationSummary } from "@/components/copilot/lara-bridge";
import type { DriveWalkPlan, RouteChoice } from "@/lib/mars/drive-walk";
import { SOL_MINUTES } from "@/lib/mars/drive-walk";
import type { ExpeditionPhase, ExpeditionState, ExpeditionTimeline } from "@/lib/mars/expedition";

export type Playback = SimulationSummary["state"];

/** The route the expedition plays, after the operator's choice. */
export interface FollowedRoute {
  /** Null while the chosen route is being planned, or when nothing is planned. */
  plan: DriveWalkPlan | null;
  following: RouteChoice;
  /** The shortest route was chosen but could not be planned, so the safest one is played. */
  isFallback: boolean;
}

/** The shortest trip when it was chosen and planned; otherwise the safest, flagged as a fallback. */
export function followedRoute(
  journey: Pick<DriveWalk, "plan" | "shortest">,
  route: RouteChoice,
): FollowedRoute {
  if (route === "safest") return { plan: journey.plan, following: "safest", isFallback: false };
  if (journey.shortest?.status === "ok") {
    return { plan: journey.shortest, following: "shortest", isFallback: false };
  }
  if (journey.shortest) return { plan: journey.plan, following: "safest", isFallback: true };
  return { plan: null, following: "shortest", isFallback: false };
}

export const SIMULATED_LABEL =
  "Simulated playback of the planned trip: positions, rover battery and suit supply are modelled from the plan's assumptions, not measured.";

/** What is happening now, in a few words. */
export function activityText(state: ExpeditionState, playback: Playback): string {
  if (playback === "idle") return "Ready to leave the base";
  switch (state.activity) {
    case "done":
      return "Back at the base";
    case "parked":
      return "Parked for the night, recharging";
    case "sampling":
      return "Sampling at the site";
    case "walking":
      return state.phase === "walk_out" ? "Walking to the site" : "Walking back to the rover";
    case "driving":
      return state.phase === "drive_out"
        ? "Driving to the parking spot"
        : "Driving back to the base";
  }
}

/** Mission time as sols/h:min, the sol count without leading zeros: "0/04:05", "12/23:59". */
export function formatElapsed(minutes: number): string {
  const sols = Math.floor(minutes / SOL_MINUTES);
  const rest = Math.floor(minutes - sols * SOL_MINUTES);
  const hours = Math.floor(rest / 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${sols}/${pad(hours)}:${pad(rest - hours * 60)}`;
}

/** The simulation as LARA's "simulation" context reports it. */
export function simulationSummary(
  timeline: ExpeditionTimeline,
  state: ExpeditionState,
  playback: Playback,
  followed: FollowedRoute,
): SimulationSummary {
  const route = followed.isFallback
    ? "Following the safest route: the shortest route could not be planned."
    : `Following the ${followed.following} route.`;
  return {
    state: playback,
    phase: state.phase,
    elapsed_min: round(state.elapsedMin, 1),
    total_min: round(timeline.totalMin, 1),
    distance_done_km: round(state.distanceDoneKm, 2),
    distance_total_km: round(timeline.distanceTotalKm, 2),
    rover_battery_wh: {
      remaining: Math.round(state.batteryWh),
      reserve: Math.round(timeline.battery.reserveWh),
      capacity: Math.round(timeline.battery.capacityWh),
    },
    suit_oxygen_min: {
      remaining: round(state.suitMin, 1),
      reserve: timeline.suit.reserveMin,
    },
    labels: [
      SIMULATED_LABEL,
      route,
      `Sol ${state.sol}: ${activityText(state, playback).toLowerCase()}.`,
      `Limiting resource over the trip: ${timeline.limiting === "rover_battery" ? "rover battery" : "suit oxygen"}.`,
    ],
  };
}

/** The line LARA says when playback moves from one phase into another, or null to stay quiet. */
export function milestoneLine(from: ExpeditionPhase, to: ExpeditionPhase): string | null {
  if (from === to) return null;
  if (to === "walk_out") {
    return "Simulation: the rover is parked at the staging point. The crew starts the walk.";
  }
  if (to === "done") return "Simulation complete: the rover is back at the base.";
  return null;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
