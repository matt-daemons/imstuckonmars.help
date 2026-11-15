import type { NoGoZone } from "./routing";
import type { LngLat } from "./types";

export const EXAMPLE_ZONE: NoGoZone = {
  id: "example",
  name: "Example boulder field (placeholder)",
  ring: [
    [-176.018, 46.0],
    [-176.0, 46.012],
    [-175.982, 46.0],
    [-176.0, 45.988],
  ],
};

/** Adds a corner to a draft zone, ignoring one identical to the last (the second click of a double-click). */
export function appendCorner(draft: LngLat[], corner: LngLat): LngLat[] {
  const last = draft.at(-1);
  if (last && last[0] === corner[0] && last[1] === corner[1]) return draft;
  return [...draft, corner];
}
