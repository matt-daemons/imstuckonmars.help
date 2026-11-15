import type { Fetcher } from "@cloudflare/workers-types";
import { z } from "zod";
import { planDriveWalk, gentleWalkCost } from "../../lib/mars/drive-walk";
import { cellSize, toGridLng } from "../../lib/mars/route-grid";
import { planWalk, slopeDegrees, wallMask } from "../../lib/mars/routing";
import { withZones } from "../../lib/mars/site-grid";
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
  const shortest = input.compare
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
    driveCellM: cellSize(driveGrid, 0).dy,
    comparison: driveWalkComparison({ driveGrid, driveSlope, siteGrid, plan, shortest }),
  };
}
