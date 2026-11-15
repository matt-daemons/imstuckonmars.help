import type { LngLat } from "./types";

/** Adds a corner to a draft zone, ignoring one identical to the last (the second click of a double-click). */
export function appendCorner(draft: LngLat[], corner: LngLat): LngLat[] {
  const last = draft.at(-1);
  if (last && last[0] === corner[0] && last[1] === corner[1]) return draft;
  return [...draft, corner];
}
