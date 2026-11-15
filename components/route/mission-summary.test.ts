import { describe, expect, it } from "vitest";

import { SOL_MINUTES } from "@/lib/mars/drive-walk";
import type { PlannedPath } from "@/lib/mars/routing";
import type { LngLat, RouteCollection, RouteLegProperties } from "@/lib/mars/types";

import {
  afterDeparture,
  formatKm,
  hoursMinutes,
  objectiveText,
  routeFileName,
  timelineRows,
  titleRows,
  walkingCollection,
} from "./mission-summary";

const SITE = { id: "DTEEC_033225", hiriseId: "ESP_033225_2250", title: "Terraced crater" };

function leg(props: Partial<RouteLegProperties>): RouteCollection["features"][number] {
  return {
    type: "Feature",
    properties: {
      kind: "route-leg",
      route_id: "drive-walk-ESP_033225_2250",
      leg: 1,
      mode: "drive",
      from: "base",
      to: "staging",
      start_offset_min: 0,
      est_time_min: 60,
      stop_min: 0,
      distance_km: 10,
      max_slope: 2,
      verdict: "GO",
      limiting_factor: null,
      reasons: [],
      time_to_shelter_min: 0,
      simulated: false,
      ...props,
    },
    geometry: { type: "LineString", coordinates: [] },
  };
}

function collection(features: RouteCollection["features"]): RouteCollection {
  return {
    type: "FeatureCollection",
    features,
    route: {
      route_id: "drive-walk-ESP_033225_2250",
      title: "Base → ESP_033225_2250 (drive + walk)",
      destination_id: SITE.id,
      distance_km: 0,
      est_time_min: 0,
      max_slope: 0,
      verdict: "GO",
      limiting_factor: null,
      reasons: [],
      margin: { resource: "rover_battery", value: 50, limit: 20, unit: "%" },
      time_to_shelter_min: 0,
      simulated: false,
      source: "test",
    },
  };
}

describe("afterDeparture", () => {
  it("writes sols then hours and minutes since departure", () => {
    expect(afterDeparture(0)).toBe("0/00:00");
    expect(afterDeparture(95)).toBe("0/01:35");
    expect(afterDeparture(2 * SOL_MINUTES + 61)).toBe("2/01:01");
  });
});

describe("hoursMinutes", () => {
  it("writes a duration as hh:mm, past 24 h when a drive runs that long", () => {
    expect(hoursMinutes(42.4)).toBe("00:42");
    expect(hoursMinutes(1510)).toBe("25:10");
  });
});

describe("formatKm", () => {
  it("gives 1 decimal from 10 km up and 2 below", () => {
    expect(formatKm(104.37)).toBe("104.4 km");
    expect(formatKm(10)).toBe("10.0 km");
    expect(formatKm(0.958)).toBe("0.96 km");
  });
});

describe("timelineRows", () => {
  const trip = collection([
    leg({ leg: 1, est_time_min: 600, distance_km: 93.4, max_slope: 4.12 }),
    leg({
      leg: 2,
      mode: "walk",
      from: "staging",
      to: SITE.id,
      start_offset_min: SOL_MINUTES,
      est_time_min: 20,
      stop_min: 60,
      distance_km: 0.65,
      max_slope: 11.04,
      time_to_shelter_min: 21,
    }),
    leg({
      leg: 3,
      mode: "walk",
      from: SITE.id,
      to: "staging",
      start_offset_min: SOL_MINUTES + 80,
      est_time_min: 21,
      distance_km: 0.7,
      time_to_shelter_min: 21,
    }),
  ]);
  const rows = timelineRows(trip, { [SITE.id]: SITE.title });

  it("gives each leg a row, named by its places, with the sampling stop between", () => {
    expect(rows.map((row) => [row.leg, row.mode, row.places])).toEqual([
      ["1", "Drive", "Habitat → Staging point"],
      ["2", "Walk", "Staging point → Terraced crater"],
      ["", "Sampling", "At Terraced crater"],
      ["3", "Walk", "Terraced crater → Staging point"],
    ]);
  });

  it("formats times, distance, slope and time to shelter with their units", () => {
    expect(rows[0]).toMatchObject({
      start: "0/00:00",
      duration: "10:00",
      distance: "93.4 km",
      slope: "4.1°",
      shelter: "0 min",
    });
    // The stop starts when the walk out ends, and its time to shelter is the walk back.
    expect(rows[2]).toMatchObject({
      start: "1/00:20",
      duration: "01:00",
      distance: "—",
      slope: "—",
      shelter: "21 min",
    });
  });
});

describe("titleRows", () => {
  const madeAt = new Date("2026-11-15T14:32:10Z");

  it("names the mission, site, power, sampling time and when the plan was made", () => {
    expect(
      titleRows({ mission: "drive-walk", site: SITE, power: "fission", samplingMin: 60, madeAt }),
    ).toEqual([
      { label: "Mission", value: "Drive + walk" },
      { label: "Destination", value: "Terraced crater · ESP_033225_2250" },
      { label: "Power", value: "Fission" },
      { label: "Sampling time", value: "60 min" },
      { label: "Plan made", value: "2026-11-15 14:32 UTC" },
    ]);
  });

  it("includes walking sampling but leaves out rover power", () => {
    expect(
      titleRows({ mission: "walking", site: null, power: "fission", samplingMin: 60, madeAt }),
    ).toEqual([
      { label: "Mission", value: "Walking" },
      { label: "Destination", value: "Map point" },
      { label: "Sampling time", value: "60 min" },
      { label: "Plan made", value: "2026-11-15 14:32 UTC" },
    ]);
  });
});

describe("objectiveText", () => {
  it("is to sample water ice at the site for the sampling time", () => {
    expect(objectiveText("drive-walk", SITE, 45, true)).toBe(
      "Sample water ice at Terraced crater (ESP_033225_2250), 45 min at the site.",
    );
  });

  it("is the walk out and back, to the habitat or to the start", () => {
    expect(objectiveText("walking", null, 60, true)).toBe(
      "Walk to the map point, sample for 60 min, then return to the habitat.",
    );
    expect(objectiveText("walking", null, 60, false)).toContain("return to the start.");
    expect(objectiveText("walking", null, 0, true)).toBe(
      "Walk to the map point and back to the habitat.",
    );
  });
});

function path(points: LngLat[], distance_m: number, max_slope_deg: number, time_min: number) {
  const planned: PlannedPath = {
    status: "ok",
    path: points,
    distance_m,
    cost: distance_m,
    max_slope_deg,
    time_min,
    expanded: 10,
  };
  return planned;
}

describe("walkingCollection", () => {
  const outbound = path(
    [
      [-176, 46],
      [-175.99, 46],
    ],
    800,
    6,
    12,
  );
  const back = path(
    [
      [-175.99, 46],
      [-176, 46],
    ],
    820,
    7.5,
    14,
  );
  const summary = {
    distance_km: 0.8,
    est_time_min: 26,
    max_slope: 7.5,
    farthest_from_base_km: 0.8,
  };

  it("is null until the walk is planned", () => {
    expect(walkingCollection({ outbound, back, summary: null }, true)).toBeNull();
  });

  it("holds one walk leg out and one back, in the agreed route format", () => {
    const walk = walkingCollection({ outbound, back, summary }, true)!;
    const legs = walk.features.map((feature) => feature.properties as RouteLegProperties);
    expect(legs.map((props) => [props.leg, props.mode, props.from, props.to])).toEqual([
      [1, "walk", "base", "map-point"],
      [2, "walk", "map-point", "base"],
    ]);
    expect(legs[1]).toMatchObject({
      start_offset_min: 12,
      est_time_min: 14,
      stop_min: 0,
      distance_km: 0.82,
      max_slope: 7.5,
      time_to_shelter_min: 14, // the walk back from the farthest point
      verdict: "GO",
      limiting_factor: null,
      simulated: false,
    });
    expect(walk.features[0].geometry.coordinates).toEqual(outbound.path);
  });

  it("sums the legs into the route summary, with the tightest margin when GO", () => {
    const { route } = walkingCollection({ outbound, back, summary }, true)!;
    expect(route).toMatchObject({
      route_id: "walk-map-point",
      title: "Habitat → map point (walking)",
      destination_id: "map-point",
      distance_km: 1.62,
      est_time_min: 26,
      max_slope: 7.5,
      verdict: "GO",
      time_to_shelter_min: 14,
      simulated: false,
    });
    expect(Object.keys(route.margin)).toEqual(["resource", "value", "limit", "unit"]);
  });

  it("includes sampling between outbound and return in the exported timeline", () => {
    const walk = walkingCollection(
      { outbound, back, summary: { ...summary, est_time_min: 56 } },
      true,
      30,
    )!;
    expect(walk.features[0].properties).toMatchObject({ stop_min: 30 });
    expect(walk.features[1].properties).toMatchObject({ start_offset_min: 42 });
    expect(timelineRows(walk, {}).map((row) => row.mode)).toEqual(["Walk", "Sampling", "Walk"]);
    expect(walk.route.est_time_min).toBe(56);
  });

  it("starts at the start point when the walk does not start at the habitat", () => {
    const walk = walkingCollection({ outbound, back, summary }, false)!;
    expect(walk.features[0].properties).toMatchObject({ from: "start" });
    expect(walk.route.title).toBe("Start → map point (walking)");
  });

  it("carries a NO-GO verdict and its limiting rule on every leg", () => {
    const steep = { ...summary, max_slope: 24 };
    const walk = walkingCollection({ outbound, back, summary: steep }, true)!;
    expect(walk.route).toMatchObject({ verdict: "NO_GO", limiting_factor: "slope" });
    expect(walk.features[0].properties).toMatchObject({ verdict: "NO_GO" });
  });
});

describe("routeFileName", () => {
  it("names the file after the route and the day it was saved", () => {
    const trip = collection([]);
    expect(routeFileName(trip, new Date("2026-11-15T23:59:00Z"))).toBe(
      "lara-route-drive-walk-ESP_033225_2250-2026-11-15.geojson",
    );
  });
});
