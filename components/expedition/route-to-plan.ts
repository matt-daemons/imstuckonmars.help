import type { Plan } from "@/components/map/route-layers";
import type { RoutePlanInputs } from "@/components/route/route-plan";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { LngLat, RouteLegProperties } from "@/lib/mars/types";
import { MAX_LEG_POINTS, type ExpeditionPlan } from "@/lib/mission/expedition";
import { MARS_RADIUS_M } from "@/lib/mission/position";

const RAD = Math.PI / 180;

/** Douglas–Peucker in local Mars metres; keeps both ends and every turn above `tolerance`. */
export function simplify(path: LngLat[], tolerance: number): LngLat[] {
  if (path.length <= 2) return path;
  const [lng0, lat0] = path[0];
  const scale = Math.cos(lat0 * RAD);
  const xy = path.map(([lng, lat]) => [
    (((lng - lng0 + 540) % 360) - 180) * RAD * scale * MARS_RADIUS_M,
    (lat - lat0) * RAD * MARS_RADIUS_M,
  ]);
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const length = Math.hypot(bx - ax, by - ay) || 1e-9;
    let worst = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / length;
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

/** Simplifies until the path fits the server's per-leg point budget. */
export function fitPoints(path: LngLat[], max = MAX_LEG_POINTS): LngLat[] {
  let tolerance = 0.5;
  let out = simplify(path, tolerance);
  while (out.length > max) out = simplify(path, (tolerance *= 2));
  return out;
}

export type PlanResult =
  | { plan: ExpeditionPlan; reason?: undefined }
  | { plan: null; reason: string };

/** The expedition a route plan describes, or why it cannot be launched yet. */
export function routeToPlan(
  inputs: RoutePlanInputs,
  base: LngLat,
  walk: Plan | null,
  trip: DriveWalkPlan | null,
): PlanResult {
  const sampling_s = Math.round(inputs.samplingMin * 60);
  if (inputs.mission === "walking") {
    if (!walk?.summary) return { plan: null, reason: "Plan a walk with an end point first." };
    if (inputs.start[0] !== base[0] || inputs.start[1] !== base[1])
      return {
        plan: null,
        reason: "A walking expedition starts at the habitat. Set the start back to it.",
      };
    const end = walk.outbound.path[walk.outbound.path.length - 1];
    return {
      plan: {
        id: `walk-${end[0].toFixed(4)}-${end[1].toFixed(4)}`,
        mode: "walking",
        shelter_lnglat: base,
        outbound: {
          path: fitPoints(walk.outbound.path),
          duration_s: Math.round(walk.outbound.time_min * 60),
        },
        sampling_s,
        back: { path: fitPoints(walk.back.path), duration_s: Math.round(walk.back.time_min * 60) },
      },
    };
  }
  if (!trip) return { plan: null, reason: "Waiting for the drive + walk plan." };
  if (
    trip.status !== "ok" ||
    !trip.walk ||
    !trip.staging ||
    !trip.drive?.summary ||
    !trip.collection
  )
    return { plan: null, reason: "This trip has no complete drive and walk to simulate." };
  const legs = trip.collection.features
    .map((feature) => feature.properties)
    .filter((p): p is RouteLegProperties => p.kind === "route-leg" && p.mode === "walk");
  const out = legs.find((leg) => leg.from === "staging");
  const back = legs.find((leg) => leg.to === "staging");
  if (!out || !back) return { plan: null, reason: "The trip has no walk from the parked rover." };
  return {
    plan: {
      id: out.route_id,
      mode: "drive_walk",
      shelter_lnglat: trip.staging,
      outbound: {
        path: fitPoints(trip.walk.outbound.path),
        duration_s: Math.round(out.est_time_min * 60),
      },
      sampling_s,
      back: {
        path: fitPoints(trip.walk.back.path),
        duration_s: Math.round(back.est_time_min * 60),
      },
      rover: {
        power: inputs.power,
        battery_percent: Math.max(0, Math.min(100, trip.drive.summary.battery_left_percent)),
      },
    },
  };
}
