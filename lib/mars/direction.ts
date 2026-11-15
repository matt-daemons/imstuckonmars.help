import type { LngLat } from "./types";

export const COMPASS_DIRECTIONS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
] as const;

/** Initial great-circle bearing on the Mars sphere, clockwise from geographic north. */
export function initialBearing(from: LngLat, to: LngLat): number {
  const radians = Math.PI / 180;
  const lat1 = from[1] * radians;
  const lat2 = to[1] * radians;
  const longitude = (to[0] - from[0]) * radians;
  const east = Math.sin(longitude) * Math.cos(lat2);
  const north =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitude);
  return (Math.atan2(east, north) / radians + 360) % 360;
}

export function compassDirection(bearing: number) {
  return COMPASS_DIRECTIONS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}
