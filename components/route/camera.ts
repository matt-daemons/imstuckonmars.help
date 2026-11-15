import type { Map as MapLibreMap } from "maplibre-gl";

import type { LngLat } from "@/lib/mars/types";

// MapLibre adds fit margins to the live sidebar/HUD padding by default.
const FIT_PADDING_PX = { top: 96, right: 64, bottom: 64, left: 64 };

/** Fits the map to the points. Called only from the operator's own choices, so it never fights their panning. */
export function fitPoints(map: MapLibreMap | null, points: LngLat[]) {
  map?.fitBounds(bounds(points), { padding: FIT_PADDING_PX });
}

/** South-west and north-east corners around the points, the short way round across ±180°. */
function bounds(points: LngLat[]): [LngLat, LngLat] {
  const [firstLng] = points[0];
  // Shift each point by whole turns to within 180° of the first; MapLibre accepts longitudes past ±180.
  const lngs = points.map(([lng]) => lng + 360 * Math.round((firstLng - lng) / 360));
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
