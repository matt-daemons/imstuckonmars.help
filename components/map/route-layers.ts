import type { GeoJSONSource, LayerSpecification, Map as MapboxMap } from "mapbox-gl";

import type { NoGoZone, planWalk } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

export type Plan = ReturnType<typeof planWalk>;
// Just the GeoJSON this panel draws (@types/geojson is not a direct dependency).
type Geometry =
  | { type: "Point"; coordinates: LngLat }
  | { type: "LineString"; coordinates: LngLat[] }
  | { type: "Polygon"; coordinates: LngLat[][] };
export type Feature = { type: "Feature"; properties: Record<string, string>; geometry: Geometry };

export const SOURCES = ["planned-route", "no-go-zones", "zone-draft", "route-ends"] as const;

export const LAYERS: LayerSpecification[] = [
  {
    id: "no-go-zones",
    type: "fill",
    source: "no-go-zones",
    paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 },
  },
  {
    id: "no-go-zones-outline",
    type: "line",
    source: "no-go-zones",
    paint: { "line-color": "#ef4444", "line-width": 2 },
  },
  {
    id: "zone-draft-line",
    type: "line",
    source: "zone-draft",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [1, 1] },
  },
  {
    id: "zone-draft",
    type: "circle",
    source: "zone-draft",
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 4, "circle-color": "#ef4444" },
  },
  {
    id: "planned-route",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "outbound"],
    paint: { "line-color": "#38bdf8", "line-width": 3 },
  },
  {
    id: "planned-route-back",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "back"],
    paint: { "line-color": "#f8fafc", "line-width": 2, "line-dasharray": [2, 2] },
  },
  {
    id: "route-ends",
    type: "circle",
    source: "route-ends",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "end"], "start", "#7dd3fc", "#fde68a"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#1c0f0a",
    },
  },
];

export function setData(map: MapboxMap | null, source: string, features: Feature[]) {
  map?.getSource<GeoJSONSource>(source)?.setData(collection(features));
}

export function collection(features: Feature[]) {
  return { type: "FeatureCollection" as const, features };
}

function point(coordinates: LngLat, properties: Record<string, string> = {}): Feature {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

function line(coordinates: LngLat[], properties: Record<string, string> = {}): Feature {
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
}

export function routeFeatures({ outbound, back }: Plan): Feature[] {
  const features: Feature[] = [];
  if (outbound.status === "ok") features.push(line(outbound.path, { leg: "outbound" }));
  if (back.status === "ok") features.push(line(back.path, { leg: "back" }));
  return features;
}

// Mapbox needs closed polygon rings; NoGoZone rings are stored open.
export function zoneFeature(zone: NoGoZone): Feature {
  const ring = [...zone.ring, zone.ring[0]];
  return {
    type: "Feature",
    properties: { name: zone.name },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function draftFeatures(draft: LngLat[]): Feature[] {
  const corners = draft.map((corner) => point(corner));
  return draft.length > 1 ? [...corners, line(draft)] : corners;
}

export function endFeatures(start: LngLat, end: LngLat): Feature[] {
  return [point(start, { end: "start" }), point(end, { end: "end" })];
}
