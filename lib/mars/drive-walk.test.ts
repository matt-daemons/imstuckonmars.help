import { describe, expect, it } from "vitest";

import { walkLegTiming } from "../flight-rules/walk-leg";
import { gentleWalkCost, planDriveWalk, SOL_MINUTES, type RouteChoice } from "./drive-walk";
import { NO_THERMAL_INERTIA, type PowerSource } from "./driving";
import { cellAt, cellCenter, type RouteGrid } from "./route-grid";
import { findPath, slopeDegrees } from "./routing";
import type { SiteGrid, SiteInfo } from "./site-grid";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat, RouteLegProperties, Verdict } from "./types";

const DEG_PER_M = 180 / Math.PI / MARS_RADIUS_M;
const RANK: Record<Verdict, number> = { GO: 0, CAUTION: 1, NO_GO: 2 };

/** A flat grid of square cells starting at 0° E and centred on the equator. */
function equatorGrid(width: number, height: number, cellM: number): RouteGrid {
  const cellDeg = cellM * DEG_PER_M;
  return {
    width,
    height,
    west: 0,
    east: width * cellDeg,
    rowEdges: Float64Array.from({ length: height + 1 }, (_, edge) => (height / 2 - edge) * cellDeg),
    heights: new Float32Array(width * height),
  };
}

/** A flat 2.6 km site of 10 m cells around the POI, a base 20 km east and a flat 23 km drive strip. */
function setup() {
  const siteGrid = equatorGrid(261, 261, 10);
  const site: SiteGrid = {
    grid: siteGrid,
    slope: new Float32Array(261 * 261),
    walls: new Uint8Array(261 * 261),
    boulders: [],
  };
  const poi = cellCenter(siteGrid, 130 * 261 + 130);
  const siteInfo: SiteInfo = { id: "DTEEC_TEST", hiriseId: "ESP_TEST", poi };
  const base: LngLat = [poi[0] + 20000 * DEG_PER_M, poi[1]];
  const driveGrid = {
    ...equatorGrid(46, 9, 500),
    thermalInertia: new Int16Array(46 * 9).fill(NO_THERMAL_INERTIA),
  };
  const driveWalls = new Uint8Array(46 * 9);
  const plan = ({
    power = "fission" as PowerSource,
    samplingMin = 60,
    route = "safest" as RouteChoice,
  } = {}) =>
    planDriveWalk(
      driveGrid,
      slopeDegrees(driveGrid),
      driveWalls,
      site,
      siteInfo,
      base,
      power,
      samplingMin,
      route,
    );
  return { site, siteInfo, driveGrid, driveWalls, plan };
}

function legsOf(
  collection: NonNullable<ReturnType<ReturnType<typeof setup>["plan"]>["collection"]>,
) {
  return collection.features
    .map((feature) => feature.properties)
    .filter((props): props is RouteLegProperties => props.kind === "route-leg");
}

describe("planDriveWalk", () => {
  it("returns drive out, walk out, walk back and drive back in the agreed format", () => {
    const { siteInfo, plan } = setup();
    const trip = plan();
    expect(trip.status).toBe("ok");
    const legs = legsOf(trip.collection!);
    expect(legs.map(({ leg, mode, from, to }) => [leg, mode, from, to])).toEqual([
      [1, "drive", "base", "staging"],
      [2, "walk", "staging", siteInfo.id],
      [3, "walk", siteInfo.id, "staging"],
      [4, "drive", "staging", "base"],
    ]);
    const offsets = legs.map((leg) => leg.start_offset_min);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(legs.map((leg) => leg.stop_min)).toEqual([0, 60, 0, 0]);
    expect(legs.map((leg) => leg.time_to_shelter_min > 0)).toEqual([false, true, true, false]);
    expect(legs.every((leg) => leg.simulated === false)).toBe(true);
    expect(trip.collection!.route.simulated).toBe(false);
    expect(trip.collection!.features).toContainEqual({
      type: "Feature",
      properties: { kind: "staging" },
      geometry: { type: "Point", coordinates: trip.staging },
    });
  });

  it("gives the route the worse leg's verdict and limiting factor", () => {
    const { plan } = setup();
    for (const samplingMin of [60, 400]) {
      const { collection } = plan({ samplingMin });
      const legs = legsOf(collection!);
      const worst = legs.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
      expect(collection!.route.verdict).toBe(worst.verdict);
      expect(collection!.route.limiting_factor).toBe(worst.limiting_factor);
    }
  });

  it("is NO_GO on suit supply when the sampling stop is too long, with its margin", () => {
    const { plan } = setup();
    const { verdict, collection } = plan({ samplingMin: 400 });
    expect(verdict?.verdict).toBe("NO_GO");
    expect(verdict?.limiting_factor).toBe("suit_supply");
    expect(collection!.route.margin).toMatchObject({ resource: "suit_supply", limit: 450 });
  });

  it("times the walk with walkLegTiming for the distance walked", () => {
    const { plan } = setup();
    const { walk } = plan();
    const walkedKm = (walk!.outbound.distance_m + walk!.back.distance_m) / 1000;
    expect(walkedKm).toBeGreaterThan(1);
    expect(walk!.timing).toEqual(walkLegTiming({ walk_distance_km: walkedKm, sampling_min: 60 }));
  });

  it("puts whole sols into the timeline when the drive takes more than one sol", () => {
    const { plan } = setup();
    const legs = legsOf(plan({ power: "solar" }).collection!); // 14 km per sol, ~25 km one way
    expect(legs[1].start_offset_min).toBeCloseTo(2 * SOL_MINUTES, 6);
  });

  it("reports a missing staging point, a failed drive and a failed walk", () => {
    const noStaging = setup();
    noStaging.site.slope.fill(10);
    expect(noStaging.plan().status).toBe("no_staging");

    const noDrive = setup();
    noDrive.driveWalls.fill(1);
    expect(noDrive.plan()).toMatchObject({ status: "drive_failed", collection: null });

    const noWalk = setup();
    noWalk.site.walls[cellAt(noWalk.site.grid, noWalk.siteInfo.poi)!] = 1;
    expect(noWalk.plan()).toMatchObject({ status: "walk_failed", collection: null });
  });
});

describe("planDriveWalk, shortest", () => {
  /** setup() with a 19° patch, 200 × 300 m, across the walk's straight line east of the POI. */
  function steepSite() {
    const trip = setup();
    trip.site.slope.forEach((_, cell) => {
      const row = Math.floor(cell / 261);
      const col = cell % 261;
      if (col >= 140 && col <= 160 && row >= 115 && row <= 145) trip.site.slope[cell] = 19;
    });
    return trip;
  }

  it("parks at the same staging point and is no longer than the safest trip", () => {
    const { plan } = steepSite();
    const safest = plan();
    const shortest = plan({ route: "shortest" });
    expect(shortest.status).toBe("ok");
    expect(shortest.staging).toEqual(safest.staging);
    expect(shortest.drive!.outbound.distance_m).toBeLessThanOrEqual(
      safest.drive!.outbound.distance_m,
    );
    expect(shortest.walk!.outbound.distance_m).toBeLessThan(safest.walk!.outbound.distance_m);
    expect(shortest.walk!.route!.max_slope).toBe(19);
    expect(safest.walk!.route!.max_slope).toBe(0);
  });

  it("keeps the drive out of walls", () => {
    const { plan, driveGrid, driveWalls } = setup();
    // A wall across the strip at column 20, open only in the top row.
    for (let row = 1; row < 9; row++) driveWalls[row * 46 + 20] = 1;
    const { drive } = plan({ route: "shortest" });
    expect(drive!.summary).not.toBeNull();
    for (const point of [...drive!.outbound.path, ...drive!.back.path]) {
      expect(driveWalls[cellAt(driveGrid, point)!]).toBe(0);
    }
  });
});

describe("gentleWalkCost", () => {
  // 41 × 21 cells of 10 m: an 18° band across the middle, open only along the top three rows.
  const grid = equatorGrid(41, 21, 10);
  const slope = new Float32Array(41 * 21).map((_, cell) => {
    const row = Math.floor(cell / 41);
    const col = cell % 41;
    return row >= 3 && col >= 15 && col <= 25 ? 18 : 0;
  });
  const walls = new Uint8Array(41 * 21);
  const start = cellCenter(grid, 10 * 41 + 2);
  const goal = cellCenter(grid, 10 * 41 + 38);

  it("walks a slightly longer flat detour instead of crossing 18° ground", () => {
    const direct = findPath(grid, slope, walls, start, goal);
    const gentle = findPath(grid, slope, walls, start, goal, { cost: gentleWalkCost(slope) });
    expect(direct.max_slope_deg).toBe(18);
    expect(gentle.max_slope_deg).toBe(0);
    expect(gentle.distance_m).toBeGreaterThan(direct.distance_m);
    expect(gentle.distance_m).toBeLessThan(1.25 * direct.distance_m);
  });
});
