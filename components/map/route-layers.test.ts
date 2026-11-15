import { describe, expect, it } from "vitest";

import type { PlannedPath } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import { draftFeatures, routeFeatures, routeLayers, zoneFeature } from "./route-layers";

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

  it("uses no hex colour except the two end-point colours", () => {
    const hexes = JSON.stringify(layers).match(/#[0-9a-f]{3,8}/gi) ?? [];
    expect(new Set(hexes)).toEqual(new Set(["#7dd3fc", "#fde68a"]));
  });
});
