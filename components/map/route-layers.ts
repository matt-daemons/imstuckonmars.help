import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";

import type { NoGoZone, PlannedPath, planWalk } from "@/lib/mars/routing";
import type { Boulder } from "@/lib/mars/site-grid";
import type { LngLat, RouteCollection } from "@/lib/mars/types";
import { unwrapZoneRing } from "@/lib/mars/route-zones";

export type Plan = ReturnType<typeof planWalk>;
// Just the GeoJSON this panel draws (@types/geojson is not a direct dependency).
type Geometry =
  | { type: "Point"; coordinates: LngLat }
  | { type: "LineString"; coordinates: LngLat[] }
  | { type: "Polygon"; coordinates: LngLat[][] };
export type Feature<Properties extends object = Record<string, string>> = {
  type: "Feature";
  properties: Properties;
  geometry: Geometry;
};

export const SOURCES = [
  "planned-route",
  "no-go-zones",
  "zone-draft",
  "route-ends",
  "journey",
  "boulders",
  "shortest-route",
] as const;

// Where each mode's return leg ends: the drive back at the base, the walk back at the parked
// rover. The drive out also ends at "staging", so the mode decides which end means "return".
const RETURNS_TO = { drive: "base", walk: "staging" } as const;

/** Layer specs for the route, journey, zones, draft and end points, coloured from theme tokens. */
export function routeLayers(token: (name: string) => string): LayerSpecification[] {
  const danger = token("--destructive");
  const background = token("--background");
  // A wider background-coloured line under a coloured line keeps it readable over bright
  // terrain. The casing is solid, so a dashed line reads as dark-edged dashes on a dark track.
  const casing = (line: LineLayerSpecification, width: number): LineLayerSpecification => ({
    ...line,
    id: `${line.id}-casing`,
    paint: { "line-color": background, "line-width": width },
  });
  const zoneOutline: LineLayerSpecification = {
    id: "no-go-zones-outline",
    type: "line",
    source: "no-go-zones",
    paint: { "line-color": danger, "line-width": 2 },
  };
  const draftLine: LineLayerSpecification = {
    id: "zone-draft-line",
    type: "line",
    source: "zone-draft",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": danger, "line-width": 2, "line-dasharray": [1, 1] },
  };
  const outbound: LineLayerSpecification = {
    id: "planned-route",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "outbound"],
    paint: { "line-color": token("--primary"), "line-width": 3 },
  };
  const back: LineLayerSpecification = {
    id: "planned-route-back",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "back"],
    paint: { "line-color": token("--foreground"), "line-width": 2, "line-dasharray": [2, 2] },
  };
  // Drive + walk journey: one colour per travel mode, solid out and dashed on the way back,
  // the same widths as the walking route's two legs.
  const journeyLeg = (mode: "drive" | "walk", color: string, returning: boolean) => {
    const isReturn: ExpressionSpecification = ["==", ["get", "to"], RETURNS_TO[mode]];
    const line: LineLayerSpecification = {
      id: `journey-${mode}${returning ? "-return" : ""}`,
      type: "line",
      source: "journey",
      filter: ["all", ["==", ["get", "mode"], mode], returning ? isReturn : ["!", isReturn]],
      paint: returning
        ? { "line-color": color, "line-width": 2, "line-dasharray": [2, 2] }
        : { "line-color": color, "line-width": 3 },
    };
    return { line, casing: casing(line, returning ? 4 : 6) };
  };
  const journey = [
    journeyLeg("drive", token("--primary"), false),
    journeyLeg("drive", token("--primary"), true),
    journeyLeg("walk", token("--route-walk"), false),
    journeyLeg("walk", token("--route-walk"), true),
  ];
  // The shortest route, shown only to compare: thin, dashed and grey, so it never reads as the plan.
  const shortest: LineLayerSpecification = {
    id: "shortest-route",
    type: "line",
    source: "shortest-route",
    paint: {
      "line-color": token("--muted-foreground"),
      "line-width": 1.5,
      "line-dasharray": [2, 2],
    },
  };
  return [
    {
      id: "no-go-zones",
      type: "fill",
      source: "no-go-zones",
      paint: { "fill-color": danger, "fill-opacity": 0.35 },
    },
    casing(zoneOutline, 4),
    zoneOutline,
    casing(draftLine, 4),
    draftLine,
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
    // Under every planned line, so where the two routes agree the plan stays on top.
    casing(shortest, 3.5),
    shortest,
    // The two legs often share a path, so both casings go under both legs; otherwise the
    // return leg's casing would hide the outbound line.
    casing(outbound, 6),
    casing(back, 4),
    outbound,
    back,
    // As above, out and back share a path, so every journey casing goes under every journey line.
    ...journey.map((leg) => leg.casing),
    ...journey.map((leg) => leg.line),
    {
      id: "boulders",
      type: "circle",
      source: "boulders",
      minzoom: 13, // boulders matter only at walking scale, around a site
      paint: {
        "circle-radius": 3,
        "circle-color": danger,
        "circle-stroke-width": 1,
        "circle-stroke-color": background,
      },
    },
    {
      id: "journey-staging",
      type: "circle",
      source: "journey",
      filter: ["==", ["get", "kind"], "staging"],
      // Where the rover parks and the walk starts: a light dot with a dark ring.
      paint: {
        "circle-radius": 5,
        "circle-color": token("--foreground"),
        "circle-stroke-width": 2,
        "circle-stroke-color": background,
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

export function setData(map: MapLibreMap | null, source: string, features: Feature<object>[]) {
  map?.getSource<GeoJSONSource>(source)?.setData(collection(features));
}

export function collection(features: Feature<object>[]) {
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

// MapLibre needs closed polygon rings; NoGoZone rings are stored open.
export function zoneFeature(zone: NoGoZone): Feature {
  const open = unwrapZoneRing(zone.ring);
  const ring = [...open, open[0]];
  return {
    type: "Feature",
    properties: { name: zone.name },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function draftFeatures(draft: LngLat[]): Feature[] {
  const corners = draft.map((corner) => point(corner));
  return draft.length > 1 ? [...corners, line(unwrapZoneRing(draft))] : corners;
}

export function endFeatures(start: LngLat, end: LngLat | null): Feature[] {
  return end
    ? [point(start, { end: "start" }), point(end, { end: "end" })]
    : [point(start, { end: "start" })];
}

/** The legs and staging point of a drive + walk journey, for the "journey" source. */
export function journeyFeatures(journey: RouteCollection): RouteCollection["features"] {
  return journey.features;
}

/** One point per boulder, for the "boulders" source. */
export function boulderFeatures(boulders: Boulder[]): Feature[] {
  return boulders.map((boulder) => point(boulder.center));
}
