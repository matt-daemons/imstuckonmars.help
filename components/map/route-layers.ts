import type { GeoJSONSource, LayerSpecification, Map as MapboxMap } from "mapbox-gl";

import type { NoGoZone, PlannedPath, planWalk } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

export type Plan = ReturnType<typeof planWalk>;
// Just the GeoJSON this panel draws (@types/geojson is not a direct dependency).
type Geometry =
  | { type: "Point"; coordinates: LngLat }
  | { type: "LineString"; coordinates: LngLat[] }
  | { type: "Polygon"; coordinates: LngLat[][] };
export type Feature = { type: "Feature"; properties: Record<string, string>; geometry: Geometry };

export const SOURCES = ["planned-route", "no-go-zones", "zone-draft", "route-ends"] as const;

/** Layer specs for the route, zones, draft and end points, coloured from theme tokens. */
export function routeLayers(token: (name: string) => string): LayerSpecification[] {
  const danger = token("--destructive");
  // Background-coloured borders keep lines readable over bright terrain. Mapbox draws a border
  // inside line-width, so each width is the visible core plus two borders.
  const background = token("--background");
  return [
    {
      id: "no-go-zones",
      type: "fill",
      source: "no-go-zones",
      paint: { "fill-color": danger, "fill-opacity": 0.35 },
    },
    {
      id: "no-go-zones-outline",
      type: "line",
      source: "no-go-zones",
      paint: {
        "line-color": danger,
        "line-width": 4,
        "line-border-width": 1,
        "line-border-color": background,
      },
    },
    {
      id: "zone-draft-line",
      type: "line",
      source: "zone-draft",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": danger,
        "line-width": 4,
        "line-dasharray": [0.5, 0.5],
        "line-border-width": 1,
        "line-border-color": background,
      },
    },
    {
      id: "zone-draft",
      type: "circle",
      source: "zone-draft",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": danger,
        "circle-stroke-width": 1,
        "circle-stroke-color": background,
      },
    },
    {
      id: "planned-route",
      type: "line",
      source: "planned-route",
      filter: ["==", ["get", "leg"], "outbound"],
      paint: {
        "line-color": token("--primary"),
        "line-width": 6,
        "line-border-width": 1.5,
        "line-border-color": background,
      },
    },
    {
      id: "planned-route-back",
      type: "line",
      source: "planned-route",
      filter: ["==", ["get", "leg"], "back"],
      paint: {
        "line-color": token("--foreground"),
        "line-width": 4,
        "line-dasharray": [1, 1],
        "line-border-width": 1,
        "line-border-color": background,
      },
    },
    {
      id: "route-ends",
      type: "circle",
      source: "route-ends",
      // Start is a filled dot and end a ring, so they differ by shape as well as colour.
      // The two colours match the stops layer in mars-map.tsx.
      paint: {
        "circle-radius": 6,
        "circle-color": ["match", ["get", "end"], "start", "#7dd3fc", background],
        "circle-stroke-width": ["match", ["get", "end"], "start", 2, 3],
        "circle-stroke-color": ["match", ["get", "end"], "start", background, "#fde68a"],
      },
    },
  ];
}

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

/** The out and back lines of a walk or a drive. */
export function routeFeatures({
  outbound,
  back,
}: {
  outbound: PlannedPath;
  back: PlannedPath;
}): Feature[] {
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
