import { TERRAIN_MIN_ZOOM } from "@/lib/mars/terrain";

/** Whole-planet views must be level; close-up terrain views may be tilted. */
export function constrainGlobeCamera({ zoom, pitch }: { zoom: number; pitch: number }) {
  const progress = Math.min(1, Math.max(0, (zoom - (TERRAIN_MIN_ZOOM - 2)) / 2));
  const maxPitch = 85 * progress * progress * (3 - 2 * progress);
  return { pitch: Math.min(pitch, maxPitch) };
}
