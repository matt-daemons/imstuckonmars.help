import { mapAsset, ARCADIA_IMAGERY_BOUNDS } from "@/lib/mars/map-data";

export const HOMEBASE = { latitude_deg: 45.97, longitude_deg: -176.05 };

/** Tile placement only, using the published XYZ display geometry. No Earth distances. */
export function orbitalContext(latitude: number, longitude: number) {
  const [west, south, east, north] = ARCADIA_IMAGERY_BOUNDS;
  const zoom = 12,
    size = 2 ** zoom;
  const x = ((longitude + 180) / 360) * size;
  const radians = (latitude * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * size;
  const left = Math.floor(x) - 1,
    top = Math.floor(y);
  const supported =
    longitude >= west && longitude <= east && latitude >= south && latitude <= north;
  return {
    supported,
    marker: { left: `${((x - left) / 3) * 100}%`, top: `${((y - top) / 2) * 100}%` },
    tiles: Array.from({ length: 6 }, (_, i) =>
      mapAsset(`arcadia/${zoom}/${left + (i % 3)}/${top + Math.floor(i / 3)}.png`),
    ),
  };
}
