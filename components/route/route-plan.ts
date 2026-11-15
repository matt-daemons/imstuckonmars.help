import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { RouteChoice } from "@/lib/mars/drive-walk";
import type { PowerSource } from "@/lib/mars/driving";
import type { NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

export type MissionType = "walking" | "drive-walk";
export type Step = "mission" | "where" | "check" | "run";

/** The operator's route choices. The destination is not stored: it is the site the end is on. */
export interface RoutePlanInputs {
  mission: MissionType;
  /** Map longitudes, −180..180. */
  start: LngLat;
  end: LngLat;
  /** The operator set the end, rather than taking the mission's default. */
  endChosen: boolean;
  power: PowerSource;
  samplingMin: number;
  zones: NoGoZone[];
  /** How many zones the operator has drawn, so each new one gets the next number. */
  zonesDrawn: number;
  step: Step;
  /** Draw the shortest route under the planned one, to compare them on the map. */
  showShortest: boolean;
  /** The route the expedition follows. */
  route: RouteChoice;
}

export type RoutePlanAction =
  // The caller passes the mission's start and end, since the end depends on the sites it shows.
  | { type: "setMission"; mission: MissionType; start: LngLat; end: LngLat }
  | { type: "setStart"; point: LngLat }
  | { type: "setEnd"; point: LngLat }
  // The sites load after the plan starts; nearest is the one closest to the base.
  | { type: "sitesLoaded"; nearest: LngLat }
  | { type: "setPower"; power: PowerSource }
  | { type: "setSampling"; minutes: number }
  | { type: "addZone"; ring: LngLat[] }
  | { type: "clearZones" }
  | { type: "goTo"; step: Step }
  | { type: "showShortest"; shown: boolean }
  | { type: "chooseRoute"; route: RouteChoice };

// Time at the site, a planning input like the walk-leg timing's, not a NASA value.
const DEFAULT_SAMPLING_MIN = 60;

/**
 * A drive + walk from the base, the team's confirmed mission, with no zones. It ends at the target
 * only until the sites load: see sitesLoaded.
 */
export function initialRoutePlan(base: LngLat, target: LngLat): RoutePlanInputs {
  return {
    mission: "drive-walk",
    start: base,
    end: target,
    endChosen: false,
    power: "fission",
    samplingMin: DEFAULT_SAMPLING_MIN,
    zones: [],
    zonesDrawn: 0,
    step: "mission",
    showShortest: false,
    route: "safest",
  };
}

export function routePlanReducer(state: RoutePlanInputs, action: RoutePlanAction): RoutePlanInputs {
  switch (action.type) {
    case "setMission":
      return {
        ...state,
        mission: action.mission,
        start: action.start,
        end: action.end,
        endChosen: false,
      };
    case "setStart":
      return { ...state, start: action.point };
    case "setEnd":
      return { ...state, end: action.point, endChosen: true };
    case "sitesLoaded":
      // A drive + walk ends at the nearest site, as choosing the mission does once the sites are
      // in, unless the operator has set an end by then.
      if (state.mission !== "drive-walk" || state.endChosen) return state;
      return { ...state, end: action.nearest };
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
