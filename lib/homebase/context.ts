import { mapAsset, ARCADIA_IMAGERY_BOUNDS } from "@/lib/mars/map-data";

export const HOMEBASE = { latitude_deg: 45.97, longitude_deg: -176.05 };

export { ARCADIA_IMAGERY_BOUNDS } from "@/lib/mars/map-data";

export const CONTEXT_TILES = mapAsset("arcadia/{z}/{x}/{y}.png");

/** Minimum zoom that fills the viewport without revealing unacquired imagery. */
export function contextMinZoom(width: number, height: number): number {
  const [west, south, east, north] = ARCADIA_IMAGERY_BOUNDS;
  const mercatorY = (latitude: number) =>
    Math.asinh(Math.tan((latitude * Math.PI) / 180)) / (2 * Math.PI);
  const spanX = (east - west) / 360;
  const spanY = mercatorY(north) - mercatorY(south);
  return Math.max(
    Math.log2(Math.max(1, width) / (512 * spanX)),
    Math.log2(Math.max(1, height) / (512 * spanY)),
  );
}

/** A different base must not silently receive Arcadia imagery. */
export function hasSurfaceContext(latitude: number, longitude: number) {
  const [west, south, east, north] = ARCADIA_IMAGERY_BOUNDS;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}
