import { describe, expect, it } from "vitest";

import type { PlannedPath } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import { draftFeatures, routeFeatures, zoneFeature } from "./route-layers";

const a: LngLat = [-176, 46];
const b: LngLat = [-175.99, 46.01];
const c: LngLat = [-175.98, 46];

function leg(status: PlannedPath["status"], path: LngLat[]): PlannedPath {
  return { status, path, distance_m: 0, max_slope_deg: 0, time_min: 0, expanded: 0 };
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
