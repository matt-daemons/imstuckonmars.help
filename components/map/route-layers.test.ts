import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExpressionSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import type { PlannedPath } from "@/lib/mars/routing";
import type { LngLat, RouteCollection } from "@/lib/mars/types";

import {
  boulderFeatures,
  draftFeatures,
  journeyFeatures,
  routeFeatures,
  routeLayers,
  zoneFeature,
} from "./route-layers";

const a: LngLat = [-176, 46];
const b: LngLat = [-175.99, 46.01];
const c: LngLat = [-175.98, 46];

function leg(status: PlannedPath["status"], path: LngLat[]): PlannedPath {
  return { status, path, distance_m: 0, cost: 0, max_slope_deg: 0, time_min: 0, expanded: 0 };
}

describe("zoneFeature", () => {
  it("closes the ring and carries the zone name", () => {
    const feature = zoneFeature({ id: "z", name: "Crater rim", ring: [a, b, c] });
    expect(feature.geometry).toEqual({ type: "Polygon", coordinates: [[a, b, c, a]] });
    expect(feature.properties.name).toBe("Crater rim");
  });
});

describe("routeFeatures", () => {
  it("returns both legs, tagged, when both are ok", () => {
    const plan = { outbound: leg("ok", [a, b]), back: leg("ok", [b, a]), summary: null };
    expect(routeFeatures(plan).map((feature) => feature.properties.leg)).toEqual([
      "outbound",
      "back",
    ]);
  });

  it("leaves out a leg that is not ok", () => {
    const plan = { outbound: leg("ok", [a, b]), back: leg("no_path", []), summary: null };
    expect(routeFeatures(plan).map((feature) => feature.properties.leg)).toEqual(["outbound"]);
  });
});

describe("draftFeatures", () => {
  it("gives one point for one corner", () => {
    expect(draftFeatures([a]).map((feature) => feature.geometry.type)).toEqual(["Point"]);
  });

  it("gives three points and one line for three corners", () => {
    expect(draftFeatures([a, b, c]).map((feature) => feature.geometry.type)).toEqual([
      "Point",
      "Point",
      "Point",
      "LineString",
    ]);
  });
});

describe("routeLayers", () => {
  const layers = routeLayers((name) => `T(${name})`);
  const paint = (id: string) => layers.find((layer) => layer.id === id)?.paint;

  it("colours the route and zones from theme tokens", () => {
    expect(paint("planned-route")).toMatchObject({ "line-color": "T(--primary)" });
    expect(paint("no-go-zones")).toMatchObject({ "fill-color": "T(--destructive)" });
    expect(paint("no-go-zones-outline")).toMatchObject({ "line-color": "T(--destructive)" });
  });

  it("colours the return leg, draft and end ring from theme tokens", () => {
    expect(paint("planned-route-back")).toMatchObject({ "line-color": "T(--foreground)" });
    expect(paint("zone-draft-line")).toMatchObject({ "line-color": "T(--destructive)" });
    expect(paint("zone-draft")).toMatchObject({ "circle-color": "T(--destructive)" });
    // The end is the fallback, the last value of each match expression.
    const ends = paint("route-ends") as Record<string, unknown[]>;
    expect(ends["circle-color"].at(-1)).toBe("T(--background)");
    expect(ends["circle-stroke-color"].at(-1)).toBe("#fde68a");
    expect(ends["circle-stroke-width"].at(-1)).toBe(3);
  });

  const order = (id: string) => layers.findIndex((layer) => layer.id === id);

  it.each([
    ["planned-route", 3, 1.5],
    ["planned-route-back", 2, 1],
    ["no-go-zones-outline", 2, 1],
    ["zone-draft-line", 2, 1],
  ])("%s keeps a %i px core over a background casing %d px wider each side", (id, core, border) => {
    const line = layers[order(id)];
    const casing = layers[order(`${id}-casing`)];
    expect(line.paint).toMatchObject({ "line-width": core });
    // Same type, source and filter as the line, solid, in the background colour.
    expect(casing).toEqual({
      ...line,
      id: `${id}-casing`,
      paint: { "line-color": "T(--background)", "line-width": core + 2 * border },
    });
  });

  it("draws a zone line directly over its casing", () => {
    expect(order("no-go-zones-outline")).toBe(order("no-go-zones-outline-casing") + 1);
    expect(order("zone-draft-line")).toBe(order("zone-draft-line-casing") + 1);
  });

  // The legs often share a path, and the return leg's casing would hide the outbound line.
  it("draws both route casings under both route legs", () => {
    const start = order("planned-route-casing");
    expect(layers.slice(start, start + 4).map((layer) => layer.id)).toEqual([
      "planned-route-casing",
      "planned-route-back-casing",
      "planned-route",
      "planned-route-back",
    ]);
  });

  it.each([
    ["journey-drive", 3, 1.5],
    ["journey-drive-return", 2, 1],
    ["journey-walk", 3, 1.5],
    ["journey-walk-return", 2, 1],
  ])("%s keeps a %i px core over a background casing %d px wider each side", (id, core, border) => {
    const line = layers[order(id)];
    const casing = layers[order(`${id}-casing`)];
    expect(line.paint).toMatchObject({ "line-width": core });
    expect(casing).toEqual({
      ...line,
      id: `${id}-casing`,
      paint: { "line-color": "T(--background)", "line-width": core + 2 * border },
    });
  });

  // Out and back share a path, and a return leg's casing would hide the outbound line.
  it("draws every journey casing under every journey line", () => {
    const ids = layers.map((layer) => layer.id).filter((id) => id.startsWith("journey-"));
    const casings = ids.filter((id) => id.endsWith("-casing"));
    expect(ids.slice(0, casings.length)).toEqual(casings);
    expect(casings).toHaveLength(4);
  });

  it("colours drive legs primary and walk legs route-walk", () => {
    expect(paint("journey-drive")).toMatchObject({ "line-color": "T(--primary)" });
    expect(paint("journey-drive-return")).toMatchObject({ "line-color": "T(--primary)" });
    expect(paint("journey-walk")).toMatchObject({ "line-color": "T(--route-walk)" });
    expect(paint("journey-walk-return")).toMatchObject({ "line-color": "T(--route-walk)" });
  });

  it("dashes the return legs and keeps the outbound legs solid", () => {
    expect(paint("journey-drive-return")).toHaveProperty("line-dasharray");
    expect(paint("journey-walk-return")).toHaveProperty("line-dasharray");
    expect(paint("journey-drive")).not.toHaveProperty("line-dasharray");
    expect(paint("journey-walk")).not.toHaveProperty("line-dasharray");
  });

  it("draws the staging point and the boulders, boulders only at site zoom", () => {
    const layer = (id: string) => layers.find((candidate) => candidate.id === id);
    expect(layer("journey-staging")).toMatchObject({ type: "circle", source: "journey" });
    expect(layer("boulders")).toMatchObject({
      type: "circle",
      source: "boulders",
      minzoom: 13,
      paint: { "circle-color": "T(--destructive)", "circle-stroke-color": "T(--background)" },
    });
  });

  it("uses no hex colour except the two end-point colours", () => {
    const hexes = JSON.stringify(layers).match(/#[0-9a-f]{3,8}/gi) ?? [];
    expect(new Set(hexes)).toEqual(new Set(["#7dd3fc", "#fde68a"]));
  });
});

// The four-leg journey the planner produces, built from a sample route (which has only the
// two outbound legs) by adding each leg reversed as the way back.
type Leg = Extract<RouteCollection["features"][number], { geometry: { type: "LineString" } }>;

function fourLegJourney(): RouteCollection {
  const path = join(process.cwd(), "public/data/samples/routes/route-go.sample.geojson");
  const sample = JSON.parse(readFileSync(path, "utf8")) as RouteCollection;
  const [driveOut, walkOut] = sample.features.filter(
    (feature): feature is Leg => feature.geometry.type === "LineString",
  );
  const reversed = (leg: Leg, number: number): Leg => ({
    ...leg,
    properties: {
      ...leg.properties,
      leg: number,
      from: leg.properties.to,
      to: leg.properties.from,
    },
    geometry: { ...leg.geometry, coordinates: [...leg.geometry.coordinates].reverse() },
  });
  const staging = sample.features.filter((feature) => feature.properties.kind === "staging");
  return {
    ...sample,
    features: [driveOut, walkOut, reversed(walkOut, 3), reversed(driveOut, 4), ...staging],
  };
}

// Just enough of MapLibre's expression language to run the journey filters on a feature.
function evaluate(expression: unknown, properties: Record<string, unknown>): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression as [string, ...unknown[]];
  const value = (arg: unknown) => evaluate(arg, properties);
  switch (operator) {
    case "get":
      return properties[args[0] as string];
    case "==":
      return value(args[0]) === value(args[1]);
    case "!":
      return !value(args[0]);
    case "all":
      return args.every((arg) => value(arg) === true);
    default:
      throw new Error(`Expression ${operator} is not supported by this test`);
  }
}

describe("journey layers", () => {
  const layers = routeLayers((name) => `T(${name})`).filter(
    (layer) => "source" in layer && layer.source === "journey",
  );
  const features = journeyFeatures(fourLegJourney());
  // Which journey layers draw a feature: its own filter must pass.
  const layersFor = (properties: object) =>
    layers
      .filter((layer) => !layer.id.endsWith("-casing"))
      .filter((layer) => {
        const filter = "filter" in layer ? (layer.filter as ExpressionSpecification) : true;
        return evaluate(filter, properties as Record<string, unknown>) === true;
      })
      .map((layer) => layer.id);

  it("puts each leg on the layer for its mode and direction", () => {
    expect(features.map((feature) => layersFor(feature.properties))).toEqual([
      ["journey-drive"],
      ["journey-walk"],
      ["journey-walk-return"],
      ["journey-drive-return"],
      ["journey-staging"],
    ]);
  });
});

describe("boulderFeatures", () => {
  it("gives one point per boulder at its centre", () => {
    expect(
      boulderFeatures([
        { center: a, radius_m: 2 },
        { center: b, radius_m: 1.5 },
      ]),
    ).toEqual([
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: a } },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: b } },
    ]);
  });
});
