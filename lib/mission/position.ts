// Crew position along an expedition route at a mission time. Pure and deterministic, so the
// server snapshot and the map marker derive the same point from the same route and clock.
import type { CrewPosition, ExpeditionRoute, MarsLngLat } from "./types";

/** Mars 2000 sphere radius (m). Distances never use Earth defaults. */
export const MARS_RADIUS_M = 3_396_190;
const RAD = Math.PI / 180;

/** Equirectangular Mars distance, the short way across ±180°; fine over walking scales. */
export function marsDistanceM([lng1, lat1]: MarsLngLat, [lng2, lat2]: MarsLngLat): number {
  const meanLat = ((lat1 + lat2) / 2) * RAD;
  const east = (((lng2 - lng1 + 540) % 360) - 180) * RAD * Math.cos(meanLat);
  const north = (lat2 - lat1) * RAD;
  return MARS_RADIUS_M * Math.hypot(east, north);
}

export function pathLengthM(path: MarsLngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += marsDistanceM(path[i - 1], path[i]);
  return total;
}

/** The point `distance` metres along a path, clamped to its ends. */
export function pointAlong(path: MarsLngLat[], distance: number): MarsLngLat {
  if (path.length === 0) throw new Error("Empty path");
  let remaining = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const step = marsDistanceM(path[i - 1], path[i]);
    if (remaining <= step) {
      const t = step === 0 ? 0 : remaining / step;
      const [a, b] = [path[i - 1], path[i]];
      // Interpolate the longitude the short way, so a leg across ±180° stays continuous.
      const dLng = ((b[0] - a[0] + 540) % 360) - 180;
      const lng = ((a[0] + dLng * t + 540) % 360) - 180;
      return [lng, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= step;
  }
  return path[path.length - 1];
}

/** The path up to `distance` metres, ending exactly at the cut point. */
export function cutPath(path: MarsLngLat[], distance: number): MarsLngLat[] {
  const out: MarsLngLat[] = [path[0]];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const step = marsDistanceM(path[i - 1], path[i]);
    if (walked + step >= distance) break;
    walked += step;
    out.push(path[i]);
  }
  out.push(pointAlong(path, distance));
  return out;
}

/** The path from `distance` metres to its end, starting exactly at the cut point. */
export function restPath(path: MarsLngLat[], distance: number): MarsLngLat[] {
  const out: MarsLngLat[] = [pointAlong(path, distance)];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    walked += marsDistanceM(path[i - 1], path[i]);
    if (walked > distance) out.push(path[i]);
  }
  return out.length > 1 ? out : [out[0], path[path.length - 1]];
}

/** Where the crew is at `atS`: walking legs move at a constant pace, science holds still. */
export function crewPositionAt(route: ExpeditionRoute, atS: number): CrewPosition {
  let travelled = 0;
  const at = (
    lnglat: MarsLngLat,
    phase: CrewPosition["phase"],
    leg: number | null,
    progress: number,
  ): CrewPosition => ({
    lnglat,
    phase,
    leg,
    leg_progress: progress,
    distance_from_shelter_m: marsDistanceM(route.shelter_lnglat, lnglat),
    travelled_m: travelled,
  });
  for (let index = 0; index < route.legs.length; index++) {
    const leg = route.legs[index];
    if (atS < leg.start_s) break;
    const length = leg.activity === "science" ? 0 : pathLengthM(leg.path);
    if (atS < leg.end_s) {
      const progress = (atS - leg.start_s) / (leg.end_s - leg.start_s);
      if (leg.activity === "science") return at(leg.path[0], "science", index, progress);
      travelled += length * progress;
      return at(
        pointAlong(leg.path, length * progress),
        leg.activity === "travel" ? "outbound" : "inbound",
        index,
        progress,
      );
    }
    travelled += length;
  }
  // Before the first leg or after the last: at the shelter.
  return at(route.shelter_lnglat, "shelter", null, 0);
}
