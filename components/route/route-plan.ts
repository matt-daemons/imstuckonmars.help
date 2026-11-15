import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { RouteChoice } from "@/lib/mars/drive-walk";
import type { PowerSource } from "@/lib/mars/driving";
import type { NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

export type MissionType = "walking" | "drive-walk";
export type Step = "mission" | "where" | "check" | "run";

/**
 * The operator's route choices. Mission, end, power and route start empty: nothing is chosen for the
 * operator. The destination is not stored: it is the site the end is on.
 */
export interface RoutePlanInputs {
  mission: MissionType | null;
  /** Map longitudes, −180..180. */
  start: LngLat;
  /** Null until the operator picks a destination or sets the end on the map. */
  end: LngLat | null;
  power: PowerSource | null;
  samplingMin: number;
  zones: NoGoZone[];
  /** How many zones the operator has drawn, so each new one gets the next number. */
  zonesDrawn: number;
  step: Step;
  /** Draw the shortest route under the planned one, to compare them on the map. */
  showShortest: boolean;
  /** The route the expedition follows, null until the operator or LARA picks one. */
  route: RouteChoice | null;
}

export type RoutePlanAction =
  // A new mission starts at the caller's start and has no end until the operator picks one.
  | { type: "setMission"; mission: MissionType; start: LngLat }
  | { type: "setStart"; point: LngLat }
  | { type: "setEnd"; point: LngLat }
  | { type: "setPower"; power: PowerSource }
  | { type: "setSampling"; minutes: number }
  | { type: "addZone"; ring: LngLat[] }
  | { type: "clearZones" }
  | { type: "goTo"; step: Step }
  | { type: "showShortest"; shown: boolean }
  | { type: "chooseRoute"; route: RouteChoice };

// Time at the site, a planning input like the walk-leg timing's, not a NASA value.
const DEFAULT_SAMPLING_MIN = 60;

/** Nothing chosen yet: no mission, destination, power or route. Starts at the base, with no zones. */
export function initialRoutePlan(base: LngLat): RoutePlanInputs {
  return {
    mission: null,
    start: base,
    end: null,
    power: null,
    samplingMin: DEFAULT_SAMPLING_MIN,
    zones: [],
    zonesDrawn: 0,
    step: "mission",
    showShortest: false,
    route: null,
  };
}

/** What the operator still has to choose before a route can be planned, or null when nothing is. */
export function missingChoice(inputs: Pick<RoutePlanInputs, "mission" | "power" | "end">) {
  if (!inputs.mission) return "Pick a mission type in step ① Mission.";
  if (inputs.mission === "drive-walk" && !inputs.power)
    return "Pick the rover's power in step ① Mission.";
  if (!inputs.end) return "Pick a destination in step ② Where.";
  return null;
}

export function routePlanReducer(state: RoutePlanInputs, action: RoutePlanAction): RoutePlanInputs {
  switch (action.type) {
    case "setMission":
      // The same mission keeps its end; another one drops it, since a walk's end and a drive's site
      // are not interchangeable.
      if (state.mission === action.mission) return { ...state, start: action.start };
      return { ...state, mission: action.mission, start: action.start, end: null };
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
    case "addZone": {
      // Numbered here, not by the drawing controls, so the count survives them remounting.
      const n = state.zonesDrawn + 1;
      const zone = { id: `zone-${n}`, name: `No-go zone ${n}`, ring: action.ring };
      return { ...state, zones: [...state.zones, zone], zonesDrawn: n };
    }
    case "clearZones":
      return { ...state, zones: [] };
    case "goTo":
      return { ...state, step: action.step };
    case "showShortest":
      return { ...state, showShortest: action.shown };
    case "chooseRoute":
      return { ...state, route: action.route };
  }
}
