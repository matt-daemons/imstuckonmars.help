import { describe, expect, it } from "vitest";

import type { NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import {
  initialRoutePlan,
  routePlanReducer,
  type RoutePlanAction,
  type RoutePlanInputs,
} from "./route-plan";

const base: LngLat = [-176.05, 45.97];
const target: LngLat = [-175.95, 46.03];
const site: LngLat = [-176.33383, 44.41589];
const ring: LngLat[] = [base, target, site];
const zone: NoGoZone = { id: "zone-1", name: "No-go zone 1", ring };
const initial = initialRoutePlan(base, target);

describe("initialRoutePlan", () => {
  it("drives and walks from the base, ending at the target until the sites load", () => {
    expect(initial).toEqual({
      mission: "drive-walk",
      start: base,
      end: target,
      endChosen: false,
      power: "fission",
      samplingMin: 60,
      zones: [],
      zonesDrawn: 0,
      step: "mission",
    });
  });
});

describe("routePlanReducer", () => {
  const cases: { action: RoutePlanAction; changed: Partial<RoutePlanInputs> }[] = [
    { action: { type: "setStart", point: site }, changed: { start: site } },
    { action: { type: "setEnd", point: site }, changed: { end: site, endChosen: true } },
    { action: { type: "setPower", power: "solar" }, changed: { power: "solar" } },
    { action: { type: "setSampling", minutes: 90 }, changed: { samplingMin: 90 } },
    { action: { type: "addZone", ring }, changed: { zones: [zone], zonesDrawn: 1 } },
    { action: { type: "clearZones" }, changed: { zones: [] } },
    { action: { type: "goTo", step: "check" }, changed: { step: "check" } },
  ];
  it.each(cases)("$action.type changes only its own field", ({ action, changed }) => {
    expect(routePlanReducer(initial, action)).toEqual({ ...initial, ...changed });
  });

  it("setMission sets the mission, start and end, and drops an end the operator set", () => {
    const actions: RoutePlanAction[] = [
      { type: "setStart", point: target },
      { type: "setEnd", point: site },
    ];
    const moved = actions.reduce(routePlanReducer, initial);
    const next = routePlanReducer(moved, {
      type: "setMission",
      mission: "walking",
      start: base,
      end: target,
    });
    expect(next).toEqual({ ...initial, mission: "walking", start: base, end: target });
  });

  describe("sitesLoaded", () => {
    const loaded = { type: "sitesLoaded", nearest: site } as const;

    it("moves a drive + walk to the nearest site", () => {
      expect(routePlanReducer(initial, loaded)).toEqual({ ...initial, end: site });
    });

    it("keeps an end the operator set before the sites loaded", () => {
      const placed = routePlanReducer(initial, { type: "setEnd", point: base });
      expect(routePlanReducer(placed, loaded)).toBe(placed);
    });

    it("leaves a walk at its target", () => {
      const walking = routePlanReducer(initial, {
        type: "setMission",
        mission: "walking",
        start: base,
        end: target,
      });
      expect(routePlanReducer(walking, loaded)).toBe(walking);
    });
  });

  it("setSampling clamps to 0–480 min", () => {
    const sampling = (minutes: number) =>
      routePlanReducer(initial, { type: "setSampling", minutes }).samplingMin;
    expect(sampling(-5)).toBe(0);
    expect(sampling(0)).toBe(0);
    expect(sampling(480)).toBe(480);
    expect(sampling(600)).toBe(480);
  });

  it("addZone appends without changing the old list", () => {
    const one = routePlanReducer(initial, { type: "addZone", ring });
    const two = routePlanReducer(one, { type: "addZone", ring });
    expect(two.zones).toEqual([zone, { id: "zone-2", name: "No-go zone 2", ring }]);
    expect(one.zones).toEqual([zone]);
  });

  it("addZone numbers drawn zones in order, without reusing a number after clearing", () => {
    const actions: RoutePlanAction[] = [
      { type: "addZone", ring },
      { type: "addZone", ring },
      { type: "clearZones" },
      { type: "addZone", ring },
    ];
    const next = actions.reduce(routePlanReducer, initial);
    expect(next.zones).toEqual([{ id: "zone-3", name: "No-go zone 3", ring }]);
  });
});
