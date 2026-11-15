import { describe, expect, it } from "vitest";

import type { NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import {
  initialRoutePlan,
  missingChoice,
  routePlanReducer,
  type RoutePlanAction,
  type RoutePlanInputs,
} from "./route-plan";

const base: LngLat = [-176.05, 45.97];
const target: LngLat = [-175.95, 46.03];
const site: LngLat = [-176.33383, 44.41589];
const ring: LngLat[] = [base, target, site];
const zone: NoGoZone = { id: "zone-1", name: "No-go zone 1", ring };
const initial = initialRoutePlan(base);

describe("initialRoutePlan", () => {
  it("starts at the base with no mission, destination, power or route chosen", () => {
    expect(initial).toEqual({
      mission: null,
      start: base,
      end: null,
      power: null,
      samplingMin: 60,
      zones: [],
      zonesDrawn: 0,
      step: "mission",
      showShortest: false,
      route: null,
    });
  });
});

describe("missingChoice", () => {
  it("names the first choice still to make, in step order", () => {
    expect(missingChoice(initial)).toMatch(/mission type/);
    expect(missingChoice({ mission: "drive-walk", power: null, end: site })).toMatch(/power/);
    expect(missingChoice({ mission: "drive-walk", power: "solar", end: null })).toMatch(
      /destination/,
    );
    expect(missingChoice({ mission: "walking", power: null, end: null })).toMatch(/destination/);
  });

  it("is null once a route can be planned", () => {
    expect(missingChoice({ mission: "walking", power: null, end: target })).toBeNull();
    expect(missingChoice({ mission: "drive-walk", power: "fission", end: site })).toBeNull();
  });
});

describe("routePlanReducer", () => {
  const cases: { action: RoutePlanAction; changed: Partial<RoutePlanInputs> }[] = [
    { action: { type: "setStart", point: site }, changed: { start: site } },
    { action: { type: "setEnd", point: site }, changed: { end: site } },
    { action: { type: "setPower", power: "solar" }, changed: { power: "solar" } },
    { action: { type: "setSampling", minutes: 90 }, changed: { samplingMin: 90 } },
    { action: { type: "addZone", ring }, changed: { zones: [zone], zonesDrawn: 1 } },
    { action: { type: "clearZones" }, changed: { zones: [] } },
    { action: { type: "goTo", step: "check" }, changed: { step: "check" } },
    { action: { type: "showShortest", shown: true }, changed: { showShortest: true } },
    { action: { type: "chooseRoute", route: "shortest" }, changed: { route: "shortest" } },
  ];
  it.each(cases)("$action.type changes only its own field", ({ action, changed }) => {
    expect(routePlanReducer(initial, action)).toEqual({ ...initial, ...changed });
  });

  it("setMission sets the mission and start, and a new mission drops the end", () => {
    const actions: RoutePlanAction[] = [
      { type: "setMission", mission: "drive-walk", start: base },
      { type: "setStart", point: target },
      { type: "setEnd", point: site },
    ];
    const moved = actions.reduce(routePlanReducer, initial);
    const next = routePlanReducer(moved, { type: "setMission", mission: "walking", start: base });
    expect(next).toEqual({ ...initial, mission: "walking", start: base, end: null });
  });

  it("setMission keeps the end when the mission stays the same", () => {
    const actions: RoutePlanAction[] = [
      { type: "setMission", mission: "drive-walk", start: base },
      { type: "setEnd", point: site },
      { type: "setMission", mission: "drive-walk", start: base },
    ];
    expect(actions.reduce(routePlanReducer, initial).end).toEqual(site);
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
