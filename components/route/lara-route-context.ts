import type { FocusTarget } from "@/components/copilot/lara-bridge";
import {
  MAX_ASSUMPTIONS,
  MAX_DESTINATIONS,
  MAX_REASONS,
  MAX_TEXT,
  type DestinationFacts,
  type RouteFacts,
  type RoutePlanContext,
} from "@/lib/copilot/lara-context";
import { ROVER, ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import { marsDistanceM } from "@/lib/mars/routing";
import type { LngLat, RouteCollection } from "@/lib/mars/types";

import { notCheckedText, tripWithStorms, walkWithStorms, type Conditions } from "./conditions";
import type { RoutePlan } from "./route-plan-provider";

/** The parts of the route plan that LARA reads and points the map at. */
export type RoutePlanView = Pick<
  RoutePlan,
  "inputs" | "base" | "destinations" | "destination" | "journey" | "walk"
>;

/** How the map shows a focus target: framed points, or one point at a zoom. */
export type FocusView =
  | { kind: "fit"; points: LngLat[] }
  | { kind: "center"; point: LngLat; zoom: number };

// Close enough to see the habitat area, the site's 1 m terrain (from zoom 11), and the parked rover.
const BASE_ZOOM = 12;
const DESTINATION_ZOOM = 13;
const STAGING_ZOOM = 15;

/** The destinations as the Where step numbers them: 1 is the nearest to the base. */
export function numberedDestinations(plan: RoutePlanView): DestinationFacts[] {
  return plan.destinations.slice(0, MAX_DESTINATIONS).map((site, index) => ({
    number: index + 1,
    title: clip(site.title),
    confirmed: site.confirmed,
    straight_line_km: round(marsDistanceM(plan.base, site.center) / 1000, 1),
  }));
}

/** The route plan as LARA reads it, in the shape the server checks. Every value is cut to its limit. */
export function routePlanContext(plan: RoutePlanView, conditions: Conditions): RoutePlanContext {
  const { inputs, destination, destinations } = plan;
  const number = destination ? destinations.indexOf(destination) + 1 : 0;
  const isDriveWalk = inputs.mission === "drive-walk";
  const safest = isDriveWalk ? plan.journey.plan : null;
  return {
    mission: inputs.mission,
    step: inputs.step,
    route_choice: inputs.route,
    shortest_on_map: inputs.showShortest,
    destinations: numberedDestinations(plan),
    destination_number: number >= 1 && number <= MAX_DESTINATIONS ? number : null,
    status: planStatus(plan),
    routes: isDriveWalk
      ? {
          safest: tripFacts(plan.journey.plan, conditions),
          shortest: tripFacts(plan.journey.shortest, conditions),
        }
      : { safest: walkingFacts(plan, conditions), shortest: null },
    staging_point: stagingPoint(safest, destination?.center ?? null),
    not_checked: clip(notChecked(plan, conditions)),
    assumptions: assumptions(safest).slice(0, MAX_ASSUMPTIONS).map(clip),
  };
}

function planStatus({ inputs, journey, walk, destination }: RoutePlanView) {
  if (inputs.mission === "walking") {
    if (walk.loadFailed) return "terrain_failed";
    if (!walk.plan) return "planning";
    return walk.plan.summary ? "ok" : "walk_failed";
  }
  if (journey.driveFailed || journey.siteFailed) return "terrain_failed";
  if (!destination) return "no_destination";
  return journey.plan?.status ?? "planning";
}

/** A drive + walk's numbers and verdict, storms included as the Check step shows it; null unless planned. */
export function tripFacts(trip: DriveWalkPlan | null, conditions: Conditions): RouteFacts | null {
  const drive = trip?.drive?.summary;
  const walk = trip?.walk;
  const check = trip && tripWithStorms(trip, conditions);
  if (!trip?.collection || !drive || !walk?.timing || !check) return null;
  return {
    drive: {
      one_way_km: round(drive.one_way_km, 1),
      odometer_km: round(drive.odometer_km, 1),
      driving_hours: round(drivingMinutes(trip.collection) / 60, 1),
      sols: drive.sols,
      hardest_sol_kwh: round(drive.hardest_sol_kwh, 1),
      battery_left_percent: round(drive.battery_left_percent, 0),
      reserve_km: round(drive.reserve_km, 1),
      max_slope_deg: round(drive.max_slope, 1),
      power: drive.power,
      loose_dust_km: round(drive.ground_km.loose_dust, 1),
      no_ground_data_km: round(drive.ground_km.no_data, 1),
    },
    walk: {
      out_and_back_km: round((walk.outbound.distance_m + walk.back.distance_m) / 1000, 2),
      walking_min: round(walk.timing.walking_min, 0),
      sampling_min: round(walk.timing.sampling_min, 0),
      suit_time_min: round(walk.timing.suit_time_min, 0),
      suit_minutes_left: round(walk.timing.suit_minutes_left, 0),
      max_slope_deg: round(Math.max(walk.outbound.max_slope_deg, walk.back.max_slope_deg), 1),
    },
    verdict: verdictFacts(check),
  };
}

function walkingFacts({ walk }: RoutePlanView, conditions: Conditions): RouteFacts | null {
  const summary = walk.plan?.summary;
  if (!walk.plan || !summary) return null;
  const { outbound, back } = walk.plan;
  return {
    drive: null,
    walk: {
      out_and_back_km: round((outbound.distance_m + back.distance_m) / 1000, 2),
      walking_min: round(summary.est_time_min, 0),
      sampling_min: null,
      suit_time_min: null,
      suit_minutes_left: null,
      max_slope_deg: round(summary.max_slope, 1),
    },
    verdict: verdictFacts(walkWithStorms(summary, conditions)),
  };
}

function verdictFacts(check: {
  verdict: RouteFacts["verdict"]["verdict"];
  limiting_factor: string | null;
  reasons: string[];
}): RouteFacts["verdict"] {
  return {
    verdict: check.verdict,
    limiting_factor: check.limiting_factor,
    reasons: check.reasons.slice(0, MAX_REASONS).map(clip),
  };
}

function notChecked({ inputs, journey, walk }: RoutePlanView, conditions: Conditions): string {
  if (inputs.mission === "walking") {
    const summary = walk.plan?.summary;
    return summary
      ? notCheckedText(walkWithStorms(summary, conditions).not_checked, conditions)
      : "";
  }
  const check = journey.plan && tripWithStorms(journey.plan, conditions);
  return check ? notCheckedText(check.not_checked, conditions) : "";
}

function stagingPoint(trip: DriveWalkPlan | null, destination: LngLat | null) {
  const staging = trip?.staging;
  if (!staging || !destination) return null;
  const [lng, lat] = staging;
  return {
    lon_east: round(lng < 0 ? lng + 360 : lng, 4),
    lat: round(lat, 4),
    km_to_destination: round(marsDistanceM(staging, destination) / 1000, 2),
  };
}

function drivingMinutes(collection: RouteCollection): number {
  return collection.features.reduce(
    (sum, { properties }) =>
      properties.kind === "route-leg" && properties.mode === "drive"
        ? sum + properties.est_time_min
        : sum,
    0,
  );
}

/** The assumptions behind the numbers, in the words of the Check step's "Assumptions and data". */
function assumptions(trip: DriveWalkPlan | null): string[] {
  const { slope, walk_back } = FLIGHT_RULES;
  return [
    "Rover energy, battery, drive time, and suit time are simulated from these assumptions. Terrain is NASA MOLA and HiRISE data.",
    `Rover: NASA Mars Architecture Team rover study, 2022: ${ROVER.battery_kwh} kWh battery, ${ROVER.flat_speed_kmh} km/h on flat ground, ${ROVER.hotel_kw} kW life support.`,
    `Rolling resistance ${ROVER.rolling_resistance} is a Moon-soil value. Motor efficiency ${ROVER.drivetrain_efficiency} and rough ground ×${ROVER.bad_terrain_factor} are team assumptions.`,
    `Real drives run ${round((ROVER.path_factor - 1) * 100, 0)} % longer than the planned path.`,
    "Loose dust (THEMIS thermal inertia) doubles rolling resistance, a team assumption. Thermal inertia is ±20 % and covers about 57 % of the area.",
    `Rover slope limits: caution above ${ROVER_RULES.slope.caution_above_degrees}°, no-go above ${ROVER_RULES.slope.no_go_above_degrees}° on MOLA terrain (team assumption).`,
    `Walk slope limit: ${slope.no_go_above_degrees}° (${slope.applies_to} suit limit, assumed for Mars).`,
    `Staging point (team rule): the rover parks on flat ground clear of boulders, within the ${walk_back.max_distance_km} km walk-back limit.`,
    ...(trip?.walk?.timing?.assumptions ?? []),
  ];
}

/** Where the map goes for a focus target; null for the rover, which the simulation shows. */
export function focusView(target: FocusTarget, plan: RoutePlanView): FocusView | null {
  const { base, inputs } = plan;
  const end = plan.destination?.center ?? inputs.end;
  const destinationView: FocusView = { kind: "center", point: end, zoom: DESTINATION_ZOOM };
  const collection = chosenTrip(plan)?.collection ?? null;
  const walked = walkingPath(plan);
  switch (target) {
    case "base":
      return { kind: "center", point: base, zoom: BASE_ZOOM };
    case "destination":
      return destinationView;
    case "staging": {
      const staging = chosenTrip(plan)?.staging;
      return staging ? { kind: "center", point: staging, zoom: STAGING_ZOOM } : destinationView;
    }
    case "route":
      if (collection) return { kind: "fit", points: tripPoints(collection) };
      return { kind: "fit", points: walked.length > 0 ? walked : [base, end] };
    case "walk":
      if (collection) return { kind: "fit", points: walkPoints(collection) };
      return walked.length > 0 ? { kind: "fit", points: walked } : destinationView;
    case "rover":
      return null;
  }
}

/** The trip the expedition follows; the safest one while the shortest is still being planned. */
function chosenTrip({ inputs, journey }: RoutePlanView): DriveWalkPlan | null {
  if (inputs.mission !== "drive-walk") return null;
  return inputs.route === "shortest" ? (journey.shortest ?? journey.plan) : journey.plan;
}

function walkingPath({ inputs, walk }: RoutePlanView): LngLat[] {
  if (inputs.mission !== "walking" || !walk.plan) return [];
  return [...walk.plan.outbound.path, ...walk.plan.back.path];
}

function tripPoints(collection: RouteCollection): LngLat[] {
  return collection.features.flatMap(({ geometry }) =>
    geometry.type === "LineString" ? geometry.coordinates : [geometry.coordinates],
  );
}

function walkPoints(collection: RouteCollection): LngLat[] {
  return collection.features.flatMap(({ properties, geometry }) =>
    properties.kind === "route-leg" && properties.mode === "walk" && geometry.type === "LineString"
      ? geometry.coordinates
      : [],
  );
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clip(text: string): string {
  return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
}
