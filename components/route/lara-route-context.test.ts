import { describe, expect, it } from "vitest";

import type { SitePoi } from "@/components/map/scene-panel";
import { routePlanContextSchema } from "@/lib/copilot/lara-context";
import { EARTH_MINUTES_PER_MARS_HOUR } from "@/lib/mars-time/mars-clock";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { DriveSummary } from "@/lib/mars/driving";
import type { LngLat, RouteCollection } from "@/lib/mars/types";

import { realConditions } from "./conditions";
import { focusView, routePlanContext, type RoutePlanView } from "./lara-route-context";
import { initialRoutePlan } from "./route-plan";

const base: LngLat = [-176.05, 45.97];
const near: SitePoi = {
  id: "near",
  hiriseId: "ESP_033225_2250",
  title: "Possible Terraced Crater in Arcadia Planitia",
  confirmed: false,
  center: [-176.33, 44.42],
};
const far: SitePoi = {
  id: "far",
  hiriseId: "ESP_054060_2265",
  title: "Ridges in Arcadia Planitia",
  confirmed: false,
  center: [172.56, 46.07],
};
const staging: LngLat = [-176.32, 44.43];

const conditions = realConditions({
  clock: { ltst: "12:00:00", minutes_until_sunset: 6 * EARTH_MINUTES_PER_MARS_HOUR },
  doseRate: 9,
  simulatedDust: 0.4,
  spaceWeather: {
    level: "none",
    weather: {
      strongest_flare_24h: "C2.8",
      particle_event_above_10_mev: false,
      particle_event_above_100_mev: false,
      hours_until_storm_reaches_mars: null,
    },
    fetched_at: "2026-11-15T10:42:31.000Z",
    source: "NASA DONKI",
    measured_at: "Earth (GOES) / model arrival at Mars",
  },
});

const drive: DriveSummary = {
  one_way_km: 93.4,
  odometer_km: 243,
  sols: 3,
  hardest_sol_kwh: 65,
  battery_left_percent: 67.5,
  reserve_km: 36,
  max_slope: 3,
  straight_km: 90,
  power: "fission",
  ground_km: { loose_dust: 12, sand_crust: 40, firm: 60, no_data: 74.8 },
};

function trip(walkKm: number): DriveWalkPlan {
  const collection: RouteCollection = {
    type: "FeatureCollection",
    features: [
      leg("drive", [base, staging], 420),
      leg("walk", [staging, near.center], 30),
      {
        type: "Feature",
        properties: { kind: "staging" },
        geometry: { type: "Point", coordinates: staging },
      },
    ],
    route: {} as RouteCollection["route"],
  };
  const path = { distance_m: (walkKm * 1000) / 2, max_slope_deg: 9, path: [staging, near.center] };
  // Only the fields the context reads are filled in.
  return {
    status: "ok",
    collection,
    drive: { summary: drive },
    walk: {
      outbound: path,
      back: path,
      timing: {
        walking_min: walkKm * 30,
        sampling_min: 60,
        est_time_min: walkKm * 30 + 60,
        reserve_min: 30,
        suit_time_min: walkKm * 30 + 90,
        suit_minutes_left: 480 - (walkKm * 30 + 90),
        assumptions: ["Walking pace 2 km/h (Moon value, assumed for Mars)."],
      },
      route: { est_time_min: walkKm * 30 + 60, max_slope: 9, farthest_from_base_km: 1 },
    },
    staging,
  } as unknown as DriveWalkPlan;
}

function leg(mode: "drive" | "walk", coordinates: LngLat[], minutes: number) {
  return {
    type: "Feature" as const,
    properties: { kind: "route-leg", mode, est_time_min: minutes },
    geometry: { type: "LineString" as const, coordinates },
  } as RouteCollection["features"][number];
}

function view(overrides: Partial<RoutePlanView> = {}): RoutePlanView {
  const inputs = {
    ...initialRoutePlan(base),
    mission: "drive-walk" as const,
    end: near.center,
    power: "fission" as const,
    route: "safest" as const,
    step: "check" as const,
  };
  return {
    inputs,
    base,
    destinations: [near, far],
    destination: near,
    journey: {
      driveGrid: null,
      driveFailed: false,
      driveSlope: null,
      siteGrid: null,
      siteFailed: false,
      plan: trip(1.2),
      shortest: trip(0.9),
    },
    walk: { plan: null, shortest: null, terrain: null, loadFailed: false },
    ...overrides,
  };
}

describe("routePlanContext", () => {
  it("numbers the destinations nearest first, with their distance from the base", () => {
    const context = routePlanContext(view(), conditions);
    expect(context.destinations).toEqual([
      { number: 1, title: near.title, confirmed: false, straight_line_km: expect.any(Number) },
      { number: 2, title: far.title, confirmed: false, straight_line_km: expect.any(Number) },
    ]);
    expect(context.destinations[0].straight_line_km).toBeCloseTo(92.5, 0);
    expect(context.destination_number).toBe(1);
  });

  it("gives both routes' drive and walk numbers and verdicts, in the shape the server accepts", () => {
    const context = routePlanContext(view(), conditions);
    expect(routePlanContextSchema.safeParse(context).success).toBe(true);
    expect(context.status).toBe("ok");
    expect(context.routes.safest).toMatchObject({
      drive: { one_way_km: 93.4, driving_hours: 7, battery_left_percent: 68, loose_dust_km: 12 },
      walk: { out_and_back_km: 1.2, suit_time_min: 126, suit_minutes_left: 354 },
      verdict: { verdict: "GO", limiting_factor: null },
    });
    expect(context.routes.shortest?.walk.out_and_back_km).toBe(0.9);
    expect(context.staging_point).toMatchObject({ lon_east: 183.68, lat: 44.43 });
    expect(context.assumptions).toContain("Walking pace 2 km/h (Moon value, assumed for Mars).");
  });

  it("reports planning and no destination without routes", () => {
    const planning = view({ journey: { ...view().journey, plan: null, shortest: null } });
    expect(routePlanContext(planning, conditions)).toMatchObject({
      status: "planning",
      routes: { safest: null, shortest: null },
    });
    expect(routePlanContext(view({ destination: null }), conditions)).toMatchObject({
      status: "no_destination",
      destination_number: null,
    });
  });

  it("reports what is not chosen yet, in a shape the server accepts", () => {
    const empty = view({ inputs: initialRoutePlan(base), destination: null });
    const context = routePlanContext(empty, conditions);
    expect(context).toMatchObject({ mission: null, route_choice: null, status: "no_mission" });
    expect(routePlanContextSchema.parse(context)).toEqual(context);
  });
});

describe("focusView", () => {
  it("centres on single points and frames the trip's lines", () => {
    expect(focusView("base", view())).toMatchObject({ kind: "center", point: base });
    expect(focusView("destination", view())).toMatchObject({ kind: "center", point: near.center });
    expect(focusView("staging", view())).toMatchObject({ kind: "center", point: staging });
    expect(focusView("route", view())).toEqual({
      kind: "fit",
      points: [base, staging, staging, near.center, staging],
    });
    expect(focusView("walk", view())).toEqual({ kind: "fit", points: [staging, near.center] });
  });

  it("falls back to the base and the destination until a trip is planned, and leaves the rover alone", () => {
    const planning = view({ journey: { ...view().journey, plan: null, shortest: null } });
    expect(focusView("route", planning)).toEqual({ kind: "fit", points: [base, near.center] });
    expect(focusView("staging", planning)).toMatchObject({ kind: "center", point: near.center });
    expect(focusView("rover", view())).toBeNull();
  });
});
