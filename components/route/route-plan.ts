import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { PowerSource } from "@/lib/mars/driving";
import { EXAMPLE_ZONE } from "@/lib/mars/route-zones";
import type { NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

export type MissionType = "walking" | "drive-walk";
export type Step = "mission" | "where" | "check";

/** The operator's route choices. The destination is not stored: it is the site the end is on. */
export interface RoutePlanInputs {
  mission: MissionType;
  /** Map longitudes, −180..180. */
  start: LngLat;
  end: LngLat;
  power: PowerSource;
  samplingMin: number;
  zones: NoGoZone[];
  step: Step;
}

export type RoutePlanAction =
  // The caller passes the mission's start and end, since the end depends on the sites it shows.
  | { type: "setMission"; mission: MissionType; start: LngLat; end: LngLat }
  | { type: "setStart"; point: LngLat }
  | { type: "setEnd"; point: LngLat }
  | { type: "setPower"; power: PowerSource }
  | { type: "setSampling"; minutes: number }
  | { type: "addZone"; zone: NoGoZone }
  | { type: "clearZones" }
  | { type: "goTo"; step: Step };

// Time at the site, a planning input like the walk-leg timing's, not a NASA value.
const DEFAULT_SAMPLING_MIN = 60;

/** A walk from the base to the target, with the example zone drawn. */
export function initialRoutePlan(base: LngLat, target: LngLat): RoutePlanInputs {
  return {
    mission: "walking",
    start: base,
    end: target,
    power: "fission",
    samplingMin: DEFAULT_SAMPLING_MIN,
    zones: [EXAMPLE_ZONE],
    step: "mission",
  };
}

export function routePlanReducer(state: RoutePlanInputs, action: RoutePlanAction): RoutePlanInputs {
  switch (action.type) {
    case "setMission":
      return { ...state, mission: action.mission, start: action.start, end: action.end };
    case "setStart":
      return { ...state, start: action.point };
    case "setEnd":
      return { ...state, end: action.point };
    case "setPower":
      return { ...state, power: action.power };
    case "setSampling": {
      // Sampling can't outlast the suit's main supply, the same cap as the sampling field's.
      const max = FLIGHT_RULES.suit_supply.primary_minutes;
      return { ...state, samplingMin: Math.min(Math.max(action.minutes, 0), max) };
    }
    case "addZone":
      return { ...state, zones: [...state.zones, action.zone] };
    case "clearZones":
      return { ...state, zones: [] };
    case "goTo":
      return { ...state, step: action.step };
  }
}
