import type { LngLat } from "./types";

/** Put adjacent vertices on the nearest world copy without changing stored map coordinates. */
export function unwrapZoneRing(ring: LngLat[]): LngLat[] {
  const result: LngLat[] = [];
  for (const [lng, lat] of ring) {
    const previous = result.at(-1)?.[0] ?? lng;
    result.push([lng + 360 * Math.round((previous - lng) / 360), lat]);
  }
  return result;
}

/** Adds a corner to a draft zone, ignoring one identical to the last (the second click of a double-click). */
export function appendCorner(draft: LngLat[], corner: LngLat): LngLat[] {
  const last = draft.at(-1);
  if (last && last[0] === corner[0] && last[1] === corner[1]) return draft;
  return [...draft, corner];
}
