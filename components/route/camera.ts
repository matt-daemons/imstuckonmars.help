import type { Map as MapLibreMap } from "maplibre-gl";

import type { LngLat } from "@/lib/mars/types";

// MapLibre adds fit margins to the live sidebar/HUD padding by default.
const FIT_PADDING_PX = { top: 96, right: 64, bottom: 64, left: 64 };

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function focusHomebase(map: MapLibreMap | null, center: LngLat, duration = 1400) {
  map?.flyTo({
    center,
    zoom: 15.2,
    pitch: 52,
    bearing: 25,
    duration: prefersReducedMotion() ? 0 : duration,
  });
}

export function focusTarget(map: MapLibreMap | null, center: LngLat) {
  map?.flyTo({
    center,
    zoom: 15,
    pitch: 55,
    bearing: 0,
    duration: prefersReducedMotion() ? 0 : 1400,
  });
}

/** Fits the map to the points. Called only from the operator's own choices, so it never fights their panning. */
export function fitPoints(
  map: MapLibreMap | null,
  points: LngLat[],
  options: { pitch?: number; maxZoom?: number } = {},
) {
  if (!points.length) return;
  const height = map?.getContainer().clientHeight ?? 600;
  const width = map?.getContainer().clientWidth ?? 800;
  map?.fitBounds(bounds(points), {
    padding: {
      ...FIT_PADDING_PX,
      top: Math.min(96, height / 4),
      bottom: Math.min(64, height / 4),
      left: Math.min(64, width / 5),
      right: Math.min(64, width / 5),
    },
    pitch: options.pitch ?? 35,
    bearing: 0,
    maxZoom: options.maxZoom ?? 16,
    duration: prefersReducedMotion() ? 0 : 1400,
  });
}

/** South-west and north-east corners around the points, the short way round across ±180°. */
export function bounds(points: LngLat[]): [LngLat, LngLat] {
  const [firstLng] = points[0];
  // Shift each point by whole turns to within 180° of the first; MapLibre accepts longitudes past ±180.
  const lngs = points.map(([lng]) => lng + 360 * Math.round((firstLng - lng) / 360));
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
