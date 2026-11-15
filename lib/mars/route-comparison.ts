import type { WalkingPlan } from "./planner-contract";
import type { DriveGrid } from "./driving";
import type { SiteGrid } from "./site-grid";
import { evaluateRoute } from "@/lib/flight-rules/evaluate";
import { ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import {
  ascentM,
  routeProfile,
  steepStretches,
  type ProfilePoint,
} from "@/lib/mars/compare-routes";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { RouteGrid } from "@/lib/mars/route-grid";
import type { PlannedPath } from "@/lib/mars/routing";
import type { Verdict } from "@/lib/mars/types";

type Plan = WalkingPlan;

const formatNumber = (value: number, digits: number) =>
  value
    .toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: "min2",
    })
    .replace("-", "−");

/** One line of the comparison: a readout of each route, formatted with its unit. */
export interface ComparisonRow {
  id: string;
  label: string;
  safest: string;
  /** Null while the shortest route is being planned. */
  shortest: string | null;
}

/** Ground along the way out of each route; "slope" where the grid has no heights. */
export interface ProfileChart {
  id: string;
  title: string;
  measure: "height" | "slope";
  cautionDeg: number;
  safest: ProfilePoint[];
  shortest: ProfilePoint[] | null;
}

export interface RouteComparison {
  rows: ComparisonRow[];
  /** Route rules only: storms apply to both routes alike, so they cannot tell them apart. */
  verdicts: { safest: Verdict; shortest: Verdict | null };
  profiles: ProfileChart[];
}

type Terrain = { grid: RouteGrid; slope: Float32Array };

/** The walking mission's two routes, or null until the safest walk is planned. */
export function walkComparison(
  safest: Plan | null,
  shortest: Plan | null,
  terrain: Terrain | null,
): RouteComparison | null {
  if (!safest?.summary || !terrain) return null;
  const short = shortest?.summary ? shortest : null;
  const readouts = (plan: Plan) => {
    const summary = plan.summary!;
    return {
      distance: `${formatNumber(summary.distance_km, 2)} km`,
      time: `${formatNumber(summary.est_time_min, 0)} min`,
      climb: `${formatNumber(climbM(terrain, [plan.outbound, plan.back]), 0)} m`,
      slope: `${formatNumber(summary.max_slope, 1)}°`,
    };
  };
  return {
    rows: rowsOf(
      [
        ["distance", "Distance one way"],
        ["time", "Walk + sampling time"],
        ["climb", "Climb, out and back"],
        ["slope", "Steepest slope"],
      ],
      readouts(safest),
      short && readouts(short),
    ),
    verdicts: {
      safest: evaluateRoute(safest.summary).verdict,
      shortest: short ? evaluateRoute(short.summary!).verdict : null,
    },
    profiles: [
      {
        id: "walk",
        title: "Height along the way out",
        measure: "height",
        cautionDeg: FLIGHT_RULES.slope.caution_above_degrees,
        safest: routeProfile(terrain.grid, terrain.slope, safest.outbound.path),
        shortest: short && routeProfile(terrain.grid, terrain.slope, short.outbound.path),
      },
    ],
  };
}

/** The drive + walk's two trips, or null until the safest trip is planned. */
export function driveWalkComparison(journey: {
  driveGrid: DriveGrid | null;
  driveSlope: Float32Array | null;
  siteGrid: SiteGrid | null;
  plan: DriveWalkPlan | null;
  shortest: DriveWalkPlan | null;
}): RouteComparison | null {
  const { driveGrid, driveSlope, siteGrid } = journey;
  const safest = tripParts(journey.plan);
  if (!safest || !driveGrid || !driveSlope || !siteGrid) return null;
  const short = tripParts(journey.shortest);
  const drive = { grid: driveGrid, slope: driveSlope };
  const readouts = (trip: Trip) => {
    const summary = trip.driveSummary;
    const { outbound, back } = trip.drive;
    const drivingMin = trip.collection.features.reduce(
      (sum, { properties }) =>
        properties.kind === "route-leg" && properties.mode === "drive"
          ? sum + properties.est_time_min
          : sum,
      0,
    );
    const walked = trip.walk.outbound.distance_m + trip.walk.back.distance_m;
    return {
      drive: `${formatNumber(summary.one_way_km, 1)} km`,
      walk: `${formatNumber(walked / 1000, 2)} km`,
      "drive-time": `${formatNumber(drivingMin / 60, 1)} h`,
      "suit-time": `${formatNumber(trip.timing.suit_time_min, 0)} min`,
      climb: `${formatNumber(climbM(drive, [outbound, back]), 0)} m`,
      "drive-slope": `${formatNumber(summary.max_slope, 1)}°`,
      "walk-slope": `${formatNumber(Math.max(trip.walk.outbound.max_slope_deg, trip.walk.back.max_slope_deg), 1)}°`,
      sols: `${summary.sols}`,
      battery: `${formatNumber(summary.battery_left_percent, 0)}%`,
    };
  };
  const profiles = (trip: Trip) => ({
    drive: routeProfile(driveGrid, driveSlope, trip.drive.outbound.path),
    walk: routeProfile(siteGrid.grid, siteGrid.slope, trip.walk.outbound.path),
  });
  const safestProfiles = profiles(safest);
  const shortProfiles = short && profiles(short);
  return {
    rows: rowsOf(
      [
        ["drive", "Drive one way"],
        ["walk", "Walk out and back"],
        ["drive-time", "Driving time"],
        ["suit-time", "Suit time"],
        ["climb", "Drive climb, out and back"],
        ["drive-slope", "Steepest drive slope"],
        ["walk-slope", "Steepest walk slope"],
        ["sols", "Sols"],
        ["battery", "Battery after the hardest day"],
      ],
      readouts(safest),
      short && readouts(short),
    ),
    verdicts: { safest: safest.verdict.verdict, shortest: short?.verdict.verdict ?? null },
    profiles: [
      {
        id: "drive",
        title: "Drive: height along the way out",
        measure: "height",
        cautionDeg: ROVER_RULES.slope.caution_above_degrees,
        safest: safestProfiles.drive,
        shortest: shortProfiles?.drive ?? null,
      },
      {
        // The site grid is flat on purpose (siteGridFromSlope), so the walk shows slope instead.
        id: "walk",
        title: "Walk: slope along the way out",
        measure: "slope",
        cautionDeg: FLIGHT_RULES.slope.caution_above_degrees,
        safest: safestProfiles.walk,
        shortest: shortProfiles?.walk ?? null,
      },
    ],
  };
}

type Trip = NonNullable<ReturnType<typeof tripParts>>;

/** The parts of a trip the comparison reads, or null unless every leg was planned. */
function tripParts(plan: DriveWalkPlan | null) {
  const { collection, drive, walk, verdict } = plan ?? {};
  if (!collection || !drive?.summary || !walk?.timing || !walk.route || !verdict) return null;
  return { collection, drive, driveSummary: drive.summary, walk, timing: walk.timing, verdict };
}

/** Metres climbed over the legs, from the grid's heights. */
function climbM({ grid, slope }: Terrain, legs: PlannedPath[]): number {
  return legs.reduce(
    (sum, leg) => sum + ascentM(routeProfile(grid, slope, leg.path).map((point) => point.height_m)),
    0,
  );
}

function rowsOf<K extends string>(
  labels: [K, string][],
  safest: Record<K, string>,
  shortest: Record<K, string> | null,
): ComparisonRow[] {
  return labels.map(([id, label]) => ({
    id,
    label,
    safest: safest[id],
    shortest: shortest?.[id] ?? null,
  }));
}

/** The chart's text alternative: the climb and highest point, or the steepest slope, and the steep ground. */
export function profileSummary(points: ProfilePoint[], chart: ProfileChart): string {
  const steepM = steepStretches(points, chart.cautionDeg).reduce(
    (sum, [from, to]) => sum + to - from,
    0,
  );
  const steepest = Math.max(...points.map((point) => point.slope_deg));
  const steep =
    steepM > 0
      ? `over ${chart.cautionDeg}° for ${formatNumber(steepM / 1000, 2)} km`
      : `none over ${chart.cautionDeg}°`;
  if (chart.measure === "slope") return `steepest ${formatNumber(steepest, 1)}°, ${steep}`;
  const heights = points.map((point) => point.height_m);
  return `climb ${formatNumber(ascentM(heights), 0)} m, highest ${formatNumber(Math.max(...heights), 0)} m, steepest ${formatNumber(steepest, 1)}°, ${steep}`;
}
