import type { Fetcher } from "@cloudflare/workers-types";
import { z } from "zod";
import { planDriveWalk, gentleWalkCost, type DriveWalkPlan } from "../../lib/mars/drive-walk";
import { cellSize, toGridLng } from "../../lib/mars/route-grid";
import { marsDistanceM, planWalk, slopeDegrees, wallMask } from "../../lib/mars/routing";
import { withZones, type SiteInfo } from "../../lib/mars/site-grid";
import type { LngLat, RouteCollection } from "../../lib/mars/types";
import { evaluateDrive } from "../../lib/flight-rules/drive";
import { FLIGHT_RULES } from "../../lib/flight-rules/rules";
import { ROVER_RULES } from "../../lib/flight-rules/rover-rules";
import { driveWalkComparison, walkComparison } from "../../lib/mars/route-comparison";
import type { PlannerRequest, PlannerResult, WalkingPlan } from "../../lib/mars/planner-contract";
import { MissionError } from "../../lib/mission/types";
import { loadPlannerBase, loadPlannerDrive, loadPlannerSite, plannerAssets } from "./data";

const sitesSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({ id: z.string(), hirise_id: z.string(), kind: z.string() }),
      geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
    }),
  ),
});
const pointSchema = z.tuple([z.number().finite(), z.number().finite()]);

function sampling(plan: WalkingPlan, minutes: number): WalkingPlan {
  return {
    ...plan,
    summary: plan.summary && { ...plan.summary, est_time_min: plan.summary.est_time_min + minutes },
  };
}

export async function calculateRoute(
  input: PlannerRequest,
  assets: Fetcher,
  localOrigin?: string,
): Promise<PlannerResult> {
  const source = plannerAssets(assets, localOrigin);
  if (input.mission === "walking") {
    const grid = await loadPlannerBase(source.signal);
    const slope = slopeDegrees(grid);
    const walls = wallMask(grid, slope, input.zones);
    const plan = sampling(
      planWalk(grid, slope, walls, input.start, input.end, gentleWalkCost(slope)),
      input.samplingMin,
    );
    const shortest = input.compare
      ? sampling(planWalk(grid, slope, walls, input.start, input.end), input.samplingMin)
      : null;
    return {
      mission: "walking",
      plan,
      shortest,
      comparison: walkComparison(plan, shortest, { grid, slope }),
    };
  }
  const sites = sitesSchema.parse(await source.json("/data/processed/sites.geojson"));
  const feature = sites.features.find(
    (feature) => feature.properties.kind === "poi" && feature.properties.id === input.siteId,
  );
  if (!feature)
    throw new MissionError("invalid_destination", "Choose a published destination site.", 400);
  const siteInfo = {
    id: input.siteId,
    hiriseId: feature.properties.hirise_id,
    poi: pointSchema.parse(feature.geometry.coordinates),
  };
  const driveGrid = await loadPlannerDrive(source);
  const driveCellM = cellSize(driveGrid, 0).dy;
  const outOfRange = beyondRoverRange(siteInfo, input.start);
  if (outOfRange) {
    return {
      mission: "drive-walk",
      plan: outOfRange,
      shortest: null,
      boulders: [],
      driveCellM,
      comparison: null,
    };
  }
  const driveSlope = slopeDegrees(driveGrid);
  const zones = input.zones.map((zone) => ({
    ...zone,
    ring: zone.ring.map(([lng, lat]): [number, number] => [toGridLng(driveGrid, lng), lat]),
  }));
  const driveWalls = wallMask(driveGrid, driveSlope, zones, ROVER_RULES.slope.no_go_above_degrees);
  const siteGrid = await loadPlannerSite(siteInfo, source);
  const maskedSite = withZones(siteGrid, input.zones);
  const plan = planDriveWalk(
    driveGrid,
    driveSlope,
    driveWalls,
    maskedSite,
    siteInfo,
    input.start,
    input.power,
    input.samplingMin,
  );
  // The shortest route parks at the same staging point, so it cannot come back inside the range.
  const shortest =
    input.compare && !noGoOnRange(plan)
      ? planDriveWalk(
          driveGrid,
          driveSlope,
          driveWalls,
          maskedSite,
          siteInfo,
          input.start,
          input.power,
          input.samplingMin,
          "shortest",
        )
      : null;
  return {
    mission: "drive-walk",
    plan,
    shortest,
    boulders: siteGrid.boulders,
    driveCellM,
    comparison: driveWalkComparison({ driveGrid, driveSlope, siteGrid, plan, shortest }),
  };
}

function noGoOnRange(plan: DriveWalkPlan): boolean {
  return plan.verdict?.verdict === "NO_GO" && plan.verdict.limiting_factor === "range";
}

/**
 * The trip's NO-GO when the site is so far that no plan could pass the rover range rule, or null.
 * The rule measures base → staging point in a straight line, and the staging point lies within the
 * walk-back limit of the POI, so a POI farther than both limits together is beyond the range for
 * every staging point. Answering here skips the drive A*, which takes ~18 s for a 424 km site.
 */
export function beyondRoverRange(site: SiteInfo, base: LngLat): DriveWalkPlan | null {
  const straightKm = marsDistanceM(base, site.poi) / 1000;
  const limitKm = ROVER_RULES.range.no_go_above_km;
  if (straightKm <= limitKm + FLIGHT_RULES.walk_back.max_distance_km) return null;
  // Only straight_km is read for the range rule; the rest is neutral so no other rule fires, since
  // none of them was checked. This probe is never returned.
  const rangeCheck = evaluateDrive({
    one_way_km: straightKm,
    odometer_km: 0,
    sols: 0,
    hardest_sol_kwh: 0,
    battery_left_percent: 100,
    reserve_km: Infinity,
    max_slope: 0,
    straight_km: straightKm,
    power: "solar",
    ground_km: { loose_dust: 0, sand_crust: 0, firm: 0, no_data: 0 },
  });
  const notPlanned = `Not planned: the line is straight from base to the site, because no route can pass the ${limitKm} km range rule; drive time, slope, battery and the walk were not calculated.`;
  const verdict = { ...rangeCheck, reasons: [...rangeCheck.reasons, notPlanned] };
  const line = greatCircle(base, site.poi);
  const routeId = `drive-walk-${site.hiriseId}`;
  const leg = (number: 1 | 2, from: string, to: string, coordinates: LngLat[]) => ({
    type: "Feature" as const,
    properties: {
      kind: "route-leg" as const,
      route_id: routeId,
      leg: number,
      mode: "drive" as const,
      from,
      to,
      start_offset_min: 0,
      est_time_min: 0,
      stop_min: 0,
      time_to_shelter_min: 0,
      distance_km: straightKm,
      max_slope: 0,
      verdict: verdict.verdict,
      limiting_factor: verdict.limiting_factor,
      reasons: verdict.reasons,
      simulated: true, // not computed from terrain
    },
    geometry: { type: "LineString" as const, coordinates },
  });
  const collection: RouteCollection = {
    type: "FeatureCollection",
    features: [leg(1, "base", site.id, line), leg(2, site.id, "base", [...line].reverse())],
    route: {
      route_id: routeId,
      title: `Base → ${site.hiriseId} (not planned: beyond rover range)`,
      destination_id: site.id,
      distance_km: 2 * straightKm,
      est_time_min: 0,
      max_slope: 0,
      verdict: verdict.verdict,
      limiting_factor: verdict.limiting_factor,
      reasons: verdict.reasons,
      margin: { resource: "rover_range", value: straightKm, limit: limitKm, unit: "km" },
      time_to_shelter_min: 0,
      simulated: true,
      source: "Straight line on the Mars sphere; route not planned (beyond the rover range)",
    },
  };
  return {
    status: "ok",
    collection,
    drive: null,
    walk: null,
    staging: null,
    parking: null,
    verdict,
  };
}

/**
 * Points along the great circle from `from` to `to`, about every 10 km. Longitudes run on from the
 * start's without jumping at ±180°, as the planned drive lines do.
 */
export function greatCircle(from: LngLat, to: LngLat, stepKm = 10): LngLat[] {
  const toVector = ([lng, lat]: LngLat) => {
    const [l, p] = [(lng * Math.PI) / 180, (lat * Math.PI) / 180];
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  };
  const a = toVector(from);
  const b = toVector(to);
  const angle = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const steps = Math.max(1, Math.ceil(marsDistanceM(from, to) / 1000 / stepKm));
  const points: LngLat[] = [from];
  let previousLng = from[0];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
    const wb = Math.sin(t * angle) / Math.sin(angle);
    const [x, y, z] = [0, 1, 2].map((k) => wa * a[k] + wb * b[k]);
    const lng = (Math.atan2(y, x) * 180) / Math.PI;
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    previousLng += ((lng - previousLng + 540) % 360) - 180;
    points.push([previousLng, lat]);
  }
  // The destination itself, shifted by whole turns only, so its longitude stays exact.
  points.push([to[0] + 360 * Math.round((previousLng - to[0]) / 360), to[1]]);
  return points;
}
