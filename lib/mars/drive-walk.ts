import { evaluateDrive } from "../flight-rules/drive";
import { evaluateRoute, type EvaPlan, type EvaVerdict } from "../flight-rules/evaluate";
import { ROVER, ROVER_RULES, type RoverFactor } from "../flight-rules/rover-rules";
import { FLIGHT_RULES, type Factor } from "../flight-rules/rules";
import { walkLegTiming, type WalkLegTiming } from "../flight-rules/walk-leg";
import { planDrive, type DriveGrid, type DriveSummary, type PowerSource } from "./driving";
import { toGridLng } from "./route-grid";
import { findPath, marsDistanceM, type PlannedPath, type StepCostModel } from "./routing";
import { findStagingPoint, type SiteGrid, type SiteInfo } from "./site-grid";
import type {
  LngLat,
  RouteCollection,
  RouteLegProperties,
  RouteSummary,
  TravelMode,
  Verdict,
} from "./types";

/** One Mars solar day (24 h 39 min 35 s) in minutes. */
export const SOL_MINUTES = 88775.244 / 60;
const SOURCE = "MOLA 463 m strip; HiRISE 1 m slope; HiRISE boulders";
const SEVERITY: Record<Verdict, number> = { GO: 0, CAUTION: 1, NO_GO: 2 };

type DrivePlan = ReturnType<typeof planDrive>;
type TripVerdict = EvaVerdict<Factor | RoverFactor>;
type WalkRoute = EvaPlan["route"];

export interface WalkPlan {
  outbound: PlannedPath;
  back: PlannedPath;
  timing: WalkLegTiming | null;
  /** What the walk is checked on; the farthest distance is measured from the rover at the staging point. */
  route: WalkRoute | null;
  verdict: EvaVerdict | null;
}

export interface DriveWalkPlan {
  status: "ok" | "no_staging" | "drive_failed" | "walk_failed";
  /** The trip in the team's agreed route format; null unless ok. */
  collection: RouteCollection | null;
  /** Null only when there is no staging point. */
  drive: DrivePlan | null;
  walk: WalkPlan | null;
  staging: LngLat | null;
  /** The worse of the drive and walk verdicts, with that leg's limiting factor and reasons. */
  verdict: TripVerdict | null;
}

/** Drive base → staging point and back on the MOLA strip; walk staging point → POI and back on the site grid. */
export function planDriveWalk(
  driveGrid: DriveGrid,
  driveSlope: Float32Array,
  driveWalls: Uint8Array,
  site: SiteGrid,
  siteInfo: SiteInfo,
  base: LngLat,
  power: PowerSource,
  samplingMin: number,
): DriveWalkPlan {
  const staging = findStagingPoint(site, siteInfo.poi, base);
  if (!staging) {
    return {
      status: "no_staging",
      collection: null,
      drive: null,
      walk: null,
      staging,
      verdict: null,
    };
  }
  // The strip may lie east of 180°, so points west of 0 move up by 360° before lookup.
  const inDriveGrid = ([lng, lat]: LngLat): LngLat => [toGridLng(driveGrid, lng), lat];
  const drive = planDrive(
    driveGrid,
    driveSlope,
    driveWalls,
    inDriveGrid(base),
    inDriveGrid(staging),
    power,
  );
  const walk = planSiteWalk(site, staging, siteInfo.poi, samplingMin);
  const failed = { collection: null, drive, walk, staging, verdict: null };
  if (!drive.summary) return { status: "drive_failed", ...failed };
  if (!walk.route || !walk.verdict) return { status: "walk_failed", ...failed };

  const driveVerdict = evaluateDrive(drive.summary);
  const walkIsWorse = SEVERITY[walk.verdict.verdict] > SEVERITY[driveVerdict.verdict];
  const verdict: TripVerdict = walkIsWorse ? walk.verdict : driveVerdict;
  const margins = { drive: driveMargins(drive.summary), walk: walkMargins(walk.route) };
  const limitingMargin =
    (walkIsWorse ? margins.walk : margins.drive).find(
      (margin) => margin.factor === verdict.limiting_factor,
    ) ?? [...margins.drive, ...margins.walk].reduce((a, b) => (b.used > a.used ? b : a)); // GO: the tightest
  // Drive lines take the staging point's longitudes, so the legs meet and none jumps across ±180°.
  const lngShift = toGridLng(driveGrid, staging[0]) === staging[0] ? 0 : 360;
  const checks = { drive: driveVerdict, walk: walk.verdict };
  const legs = tripLegs(siteInfo, drive, walk, checks, power, samplingMin, lngShift);
  const stagingPoint = {
    type: "Feature" as const,
    properties: { kind: "staging" as const },
    geometry: { type: "Point" as const, coordinates: staging },
  };
  return {
    status: "ok",
    collection: {
      type: "FeatureCollection",
      features: [...legs.features, stagingPoint],
      route: tripSummary(siteInfo, legs, verdict, limitingMargin),
    },
    drive,
    walk,
    staging,
    verdict,
  };
}

/** Walks out and back on the site grid, preferring gentle ground, and checks the walk against the suit rules. */
function planSiteWalk(site: SiteGrid, staging: LngLat, poi: LngLat, samplingMin: number): WalkPlan {
  const options = { cost: gentleWalkCost(site.slope) };
  const outbound = findPath(site.grid, site.slope, site.walls, staging, poi, options);
  const back = findPath(site.grid, site.slope, site.walls, poi, staging, options);
  if (outbound.status !== "ok" || back.status !== "ok") {
    return { outbound, back, timing: null, route: null, verdict: null };
  }
  const timing = walkLegTiming({
    walk_distance_km: (outbound.distance_m + back.distance_m) / 1000,
    sampling_min: samplingMin,
  });
  const walked = [...outbound.path, ...back.path];
  const route: WalkRoute = {
    est_time_min: timing.est_time_min,
    max_slope: Math.max(outbound.max_slope_deg, back.max_slope_deg),
    // The rover is the safe haven, so walk-back is measured from the staging point.
    farthest_from_base_km: Math.max(...walked.map((point) => marsDistanceM(staging, point))) / 1000,
  };
  return { outbound, back, timing, route, verdict: evaluateRoute(route) };
}

/** Step length × (1 + (slope / caution slope)²), slope being the steeper of the step's two cells. */
export function gentleWalkCost(slope: Float32Array): StepCostModel {
  const cautionDeg = FLIGHT_RULES.slope.caution_above_degrees;
  return {
    // The weighting is our assumption: no NASA rule says how much a suited walker should avoid slope.
    stepCost: (horizontalM, riseM, fromCell, toCell) =>
      Math.hypot(horizontalM, riseM) *
      (1 + (Math.max(slope[fromCell], slope[toCell]) / cautionDeg) ** 2),
    costPerMetreLowerBound: 1, // the weight is never below 1, so plain distance stays admissible
  };
}

type LegFeature = Extract<RouteCollection["features"][number], { properties: RouteLegProperties }>;
type LegTiming = Pick<
  RouteLegProperties,
  "start_offset_min" | "est_time_min" | "stop_min" | "time_to_shelter_min"
>;

/** The four legs in travel order, on a timeline that counts whole sols for drives longer than one sol. */
function tripLegs(
  siteInfo: SiteInfo,
  drive: DrivePlan,
  walk: WalkPlan,
  checks: Record<TravelMode, TripVerdict>,
  power: PowerSource,
  samplingMin: number,
  lngShift: number,
): { features: LegFeature[]; endMin: number } {
  const routeId = `drive-walk-${siteInfo.hiriseId}`;
  const shelterMin = walkingMinutes(walk.back); // from the POI, the farthest point, back to the rover
  const walkOutStart = driveElapsedMinutes(drive.outbound, power);
  const walkBackStart = walkOutStart + walkingMinutes(walk.outbound) + samplingMin;
  const driveBackStart = walkBackStart + walkingMinutes(walk.back);
  const driveLeg = (leg: number, ends: [string, string], path: PlannedPath, start: number) =>
    legFeature(routeId, leg, "drive", ends, path, checks.drive, lngShift, {
      start_offset_min: start,
      est_time_min: drivingMinutes(path),
      stop_min: 0,
      time_to_shelter_min: 0, // the pressurized rover is the shelter
    });
  const walkLeg = (
    leg: number,
    ends: [string, string],
    path: PlannedPath,
    start: number,
    stop: number,
  ) =>
    legFeature(routeId, leg, "walk", ends, path, checks.walk, 0, {
      start_offset_min: start,
      est_time_min: walkingMinutes(path),
      stop_min: stop,
      time_to_shelter_min: shelterMin,
    });
  return {
    features: [
      driveLeg(1, ["base", "staging"], drive.outbound, 0),
      walkLeg(2, ["staging", siteInfo.id], walk.outbound, walkOutStart, samplingMin),
      walkLeg(3, [siteInfo.id, "staging"], walk.back, walkBackStart, 0),
      driveLeg(4, ["staging", "base"], drive.back, driveBackStart),
    ],
    endMin: driveBackStart + driveElapsedMinutes(drive.back, power),
  };
}

function legFeature(
  routeId: string,
  leg: number,
  mode: TravelMode,
  [from, to]: [string, string],
  path: PlannedPath,
  check: TripVerdict,
  lngShift: number,
  timing: LegTiming,
): LegFeature {
  return {
    type: "Feature",
    properties: {
      kind: "route-leg",
      route_id: routeId,
      leg,
      mode,
      from,
      to,
      ...timing,
      distance_km: path.distance_m / 1000,
      max_slope: path.max_slope_deg,
      verdict: check.verdict,
      limiting_factor: check.limiting_factor,
      reasons: check.reasons,
      simulated: false,
    },
    geometry: {
      type: "LineString",
      coordinates: path.path.map(([lng, lat]): LngLat => [lng - lngShift, lat]),
    },
  };
}

/** Real drives run longer than the planned path (ROVER.path_factor). */
function odometerKm(path: PlannedPath): number {
  return (path.distance_m / 1000) * ROVER.path_factor;
}

function drivingMinutes(path: PlannedPath): number {
  return (odometerKm(path) / ROVER.flat_speed_kmh) * 60;
}

// A drive longer than one sol's range takes whole sols: the rover only covers km_per_sol each sol.
function driveElapsedMinutes(path: PlannedPath, power: PowerSource): number {
  const sols = Math.ceil(odometerKm(path) / ROVER.km_per_sol[power]);
  return sols > 1 ? sols * SOL_MINUTES : drivingMinutes(path);
}

/** At the flight-rule pace, the same one walkLegTiming uses. */
function walkingMinutes(path: PlannedPath): number {
  return (path.distance_m / 1000 / FLIGHT_RULES.walk_back.walking_km_per_hour) * 60;
}

function tripSummary(
  siteInfo: SiteInfo,
  legs: { features: LegFeature[]; endMin: number },
  verdict: TripVerdict,
  { resource, value, limit, unit }: Margin,
): RouteSummary {
  const props = legs.features.map((feature) => feature.properties);
  return {
    route_id: props[0].route_id,
    title: `Base → ${siteInfo.hiriseId} (drive + walk)`,
    destination_id: siteInfo.id,
    distance_km: props.reduce((sum, leg) => sum + leg.distance_km, 0),
    est_time_min: legs.endMin, // departure to return, nights of multi-sol drives included
    max_slope: Math.max(...props.map((leg) => leg.max_slope)),
    verdict: verdict.verdict,
    limiting_factor: verdict.limiting_factor,
    reasons: verdict.reasons,
    margin: { resource, value, limit, unit },
    time_to_shelter_min: Math.max(...props.map((leg) => leg.time_to_shelter_min)),
    simulated: false,
    source: SOURCE,
  };
}

/** A resource against its no-go limit; `used` is the share of the limit taken, for finding the tightest. */
export type Margin = RouteSummary["margin"] & { factor: string; used: number };

function makeMargin(
  factor: string,
  resource: string,
  value: number,
  limit: number,
  unit: string,
  limitIs: "max" | "min",
): Margin {
  return {
    factor,
    resource,
    value,
    limit,
    unit,
    used: limitIs === "max" ? value / limit : limit / value,
  };
}

function driveMargins(trip: DriveSummary): Margin[] {
  const { slope, battery, reserve, range, trip_length } = ROVER_RULES;
  return [
    makeMargin("slope", "rover_slope", trip.max_slope, slope.no_go_above_degrees, "°", "max"),
    makeMargin(
      "battery",
      "rover_battery",
      trip.battery_left_percent,
      battery.no_go_below_percent,
      "% after the hardest sol",
      "min",
    ),
    makeMargin("reserve", "rover_reserve", trip.reserve_km, reserve.no_go_below_km, "km", "min"),
    makeMargin("range", "rover_range", trip.straight_km, range.no_go_above_km, "km", "max"),
    makeMargin(
      "trip_length",
      "trip_length",
      trip.sols,
      trip_length.no_go_above_sols,
      "sols",
      "max",
    ),
  ];
}

export function walkMargins(route: WalkRoute): Margin[] {
  const { slope, walk_back, suit_supply } = FLIGHT_RULES;
  return [
    makeMargin("slope", "walk_slope", route.max_slope, slope.no_go_above_degrees, "°", "max"),
    makeMargin(
      "walk_back",
      "walk_back",
      route.farthest_from_base_km,
      walk_back.max_distance_km,
      "km",
      "max",
    ),
    makeMargin(
      "suit_supply",
      "suit_supply",
      route.est_time_min * suit_supply.time_margin, // as evaluateRoute counts it
      suit_supply.primary_minutes - suit_supply.reserve_minutes,
      "min with margin",
      "max",
    ),
  ];
}
