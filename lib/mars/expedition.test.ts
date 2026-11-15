import { describe, expect, it } from "vitest";

import { ROVER } from "../flight-rules/rover-rules";
import { FLIGHT_RULES } from "../flight-rules/rules";
import { planDriveWalk, SOL_MINUTES } from "./drive-walk";
import { NO_THERMAL_INERTIA, type PowerSource } from "./driving";
import {
  buildTimeline,
  expeditionLegs,
  advancePlayback,
  PLAYBACK_SECONDS_PER_PART,
  stateAt,
  travelledLines,
  type ExpeditionLeg,
  type ExpeditionTimeline,
} from "./expedition";
import { cellCenter, type RouteGrid } from "./route-grid";
import { slopeDegrees } from "./routing";
import type { SiteGrid } from "./site-grid";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const CAPACITY_WH = ROVER.battery_kwh * 1000;
const SUIT_MIN = FLIGHT_RULES.suit_supply.primary_minutes;
const DEG_PER_M = 180 / Math.PI / MARS_RADIUS_M;

const BASE: LngLat = [10, 0];
const MIDWAY: LngLat = [10.05, 0];
const STAGING: LngLat = [10.1, 0];
const POI: LngLat = [10.11, 0];

/** Drive 60 min, walk 30 min, sample 60 min, walk back 30 min, drive back 60 min; 1 kWh per drive step. */
function shortTrip({ samplingMin = 60, stepWh = 1000 } = {}): ExpeditionLeg[] {
  const walkBackStart = 90 + samplingMin;
  return [
    leg("drive_out", "drive", [BASE, MIDWAY, STAGING], 0, 60, 0, 60, [stepWh, stepWh]),
    leg("walk_out", "walk", [STAGING, POI], 60, 30, samplingMin, walkBackStart, []),
    leg("walk_back", "walk", [POI, STAGING], walkBackStart, 30, 0, walkBackStart + 30, []),
    leg(
      "drive_back",
      "drive",
      [STAGING, MIDWAY, BASE],
      walkBackStart + 30,
      60,
      0,
      walkBackStart + 90,
      [stepWh, stepWh],
    ),
  ];
}

function leg(
  phase: ExpeditionLeg["phase"],
  mode: ExpeditionLeg["mode"],
  coordinates: LngLat[],
  startMin: number,
  travelMin: number,
  stopMin: number,
  endMin: number,
  stepWh: number[],
): ExpeditionLeg {
  return { phase, mode, coordinates, distanceKm: 1, startMin, travelMin, stopMin, endMin, stepWh };
}

/** Samples the state every `stepMin` over the whole trip. */
function samples(timeline: ExpeditionTimeline, stepMin: number) {
  const states = [];
  for (let t = 0; t <= timeline.totalMin; t += stepMin) states.push(stateAt(timeline, t));
  states.push(stateAt(timeline, timeline.totalMin));
  return states;
}

function expectSamePlace([lngA, latA]: LngLat, [lngB, latB]: LngLat) {
  expect((((lngA - lngB) % 360) + 360) % 360).toBeCloseTo(0, 9);
  expect(latA).toBeCloseTo(latB, 9);
}

describe("stateAt on a one-sol trip", () => {
  const timeline = buildTimeline(shortTrip(), "fission");

  it("moves through the phases at the legs' boundaries", () => {
    const phaseAt = (t: number) => stateAt(timeline, t).phase;
    expect(phaseAt(0)).toBe("drive_out");
    expect(phaseAt(59.9)).toBe("drive_out");
    expect(phaseAt(60)).toBe("walk_out");
    expect(phaseAt(90)).toBe("sampling");
    expect(phaseAt(150)).toBe("walk_back");
    expect(phaseAt(180)).toBe("drive_back");
    expect(phaseAt(239.9)).toBe("drive_back");
    expect(phaseAt(240)).toBe("done");
    expect(phaseAt(1000)).toBe("done");
    expect(timeline.totalMin).toBe(240);
  });

  it("starts and ends at the base, and walks from the staging point to the POI", () => {
    expectSamePlace(stateAt(timeline, 0).position, BASE);
    expectSamePlace(stateAt(timeline, 30).position, MIDWAY);
    expectSamePlace(stateAt(timeline, 60).position, STAGING);
    expectSamePlace(stateAt(timeline, 120).position, POI);
    expectSamePlace(stateAt(timeline, 240).position, BASE);
    expect(stateAt(timeline, 30).mode).toBe("drive");
    expect(stateAt(timeline, 70).mode).toBe("walk");
  });

  it("drains the battery only while driving, by the legs' step energy", () => {
    expect(stateAt(timeline, 0).batteryWh).toBe(CAPACITY_WH);
    expect(stateAt(timeline, 30).batteryWh).toBeCloseTo(CAPACITY_WH - 1000, 6);
    expect(stateAt(timeline, 60).batteryWh).toBeCloseTo(CAPACITY_WH - 2000, 6);
    expect(stateAt(timeline, 170).batteryWh).toBeCloseTo(CAPACITY_WH - 2000, 6);
    expect(stateAt(timeline, 240).batteryWh).toBeCloseTo(CAPACITY_WH - 4000, 6);
    const states = samples(timeline, 1);
    states.slice(1).forEach((state, i) => {
      expect(state.batteryWh).toBeLessThanOrEqual(states[i].batteryWh + 1e-9);
    });
  });

  it("drains the suit only while walking and sampling", () => {
    const suitAt = (t: number) => stateAt(timeline, t).suitMin;
    expect(suitAt(0)).toBe(SUIT_MIN);
    expect(suitAt(60)).toBe(SUIT_MIN);
    expect(suitAt(90)).toBeCloseTo(SUIT_MIN - 30, 9);
    expect(suitAt(150)).toBeCloseTo(SUIT_MIN - 90, 9);
    expect(suitAt(180)).toBeCloseTo(SUIT_MIN - 120, 9);
    expect(suitAt(240)).toBeCloseTo(SUIT_MIN - 120, 9);
    expect(timeline.suit.lowestMin).toBeCloseTo(SUIT_MIN - 120, 9);
  });

  it("counts the distance done and returns the lines travelled so far", () => {
    expect(stateAt(timeline, 30).distanceDoneKm).toBeCloseTo(0.5, 9);
    expect(stateAt(timeline, 240).distanceDoneKm).toBeCloseTo(timeline.distanceTotalKm, 9);
    const lines = travelledLines(timeline, stateAt(timeline, 75));
    expect(lines.map((line) => line.mode)).toEqual(["drive", "walk"]);
    expect(lines[0].coordinates).toEqual([BASE, MIDWAY, STAGING]);
    expect(lines[1].coordinates[0]).toEqual(STAGING);
    expectSamePlace(lines[1].coordinates.at(-1)!, stateAt(timeline, 75).position);
  });

  it("plays each part, drive out, walk with sampling and drive back, in the same real time", () => {
    const part = PLAYBACK_SECONDS_PER_PART;
    expect(advancePlayback(timeline, 0, part / 2)).toBeCloseTo(30, 9);
    expect(advancePlayback(timeline, 0, part)).toBeCloseTo(60, 9);
    expect(advancePlayback(timeline, 60, part / 2)).toBeCloseTo(120, 9);
    expect(advancePlayback(timeline, 0, 3 * part)).toBe(240);
    expect(advancePlayback(timeline, 0, 10 * part)).toBe(240);
  });

  it("carries a long frame into the next part at that part's pace, so no part is skipped", () => {
    // From 10 min before the walk, half a part's time: 10 drive minutes, then the walk's pace.
    const half = PLAYBACK_SECONDS_PER_PART / 2;
    const secondsToWalk = (10 / 60) * PLAYBACK_SECONDS_PER_PART;
    const after = advancePlayback(timeline, 50, half);
    expect(after).toBeCloseTo(60 + ((half - secondsToWalk) * 120) / PLAYBACK_SECONDS_PER_PART, 9);
    expect(stateAt(timeline, after).phase).toBe("sampling"); // 100 min, inside the walk part
  });

  it("names the resource closest to its reserve", () => {
    // 4 kWh of the battery's 160 usable, against 120 of the suit's 450 usable minutes.
    expect(timeline.limiting).toBe("suit_oxygen");
    // 160 kWh: the drive ends on the battery reserve.
    expect(buildTimeline(shortTrip({ stepWh: 40000 }), "fission").limiting).toBe("rover_battery");
  });
});

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

/** As in drive-walk.test.ts: a flat site around the POI, a base 20 km east and a flat drive strip. */
function plannedTrip(power: PowerSource) {
  const siteGrid = equatorGrid(261, 261, 10);
  const site: SiteGrid = {
    grid: siteGrid,
    slope: new Float32Array(261 * 261),
    walls: new Uint8Array(261 * 261),
    boulders: [],
  };
  const poi = cellCenter(siteGrid, 130 * 261 + 130);
  const base: LngLat = [poi[0] + 20000 * DEG_PER_M, poi[1]];
  const driveGrid = {
    ...equatorGrid(46, 9, 500),
    thermalInertia: new Int16Array(46 * 9).fill(NO_THERMAL_INERTIA),
  };
  const siteInfo = { id: "DTEEC_TEST", hiriseId: "ESP_TEST", poi };
  const plan = planDriveWalk(
    driveGrid,
    slopeDegrees(driveGrid),
    new Uint8Array(46 * 9),
    site,
    siteInfo,
    base,
    power,
    60,
  );
  return { plan, driveGrid, base };
}

describe("expeditionLegs on a planned trip", () => {
  it("follows the plan's timeline and distances, from the base back to the base", () => {
    const { plan, driveGrid, base } = plannedTrip("fission");
    const legs = expeditionLegs(plan, driveGrid)!;
    expect(legs.map((l) => l.phase)).toEqual(["drive_out", "walk_out", "walk_back", "drive_back"]);
    expect(legs[0].stepWh).toHaveLength(legs[0].coordinates.length - 1);
    expect(legs[1].stepWh).toEqual([]);
    const timeline = buildTimeline(legs, "fission");
    const route = plan.collection!.route;
    expect(timeline.totalMin).toBe(route.est_time_min);
    expect(timeline.distanceTotalKm).toBeCloseTo(route.distance_km, 9);
    expectSamePlace(stateAt(timeline, 0).position, base);
    expectSamePlace(stateAt(timeline, timeline.totalMin).position, base);
    expectSamePlace(stateAt(timeline, legs[1].startMin).position, plan.staging!);
  });

  it("parks overnight on a multi-sol drive and starts the next sol's drive full", () => {
    const { plan, driveGrid } = plannedTrip("solar"); // 14 km per sol, ~26 km odometer each way
    const timeline = buildTimeline(expeditionLegs(plan, driveGrid)!, "solar");
    const driveOut = timeline.segments.filter((s) => s.phase === "drive_out");
    expect(driveOut.map((s) => s.activity)).toEqual([
      "driving",
      "parked",
      "parked",
      "driving",
      "parked",
      "parked",
    ]);
    expect(driveOut[3].startMin).toBeCloseTo(SOL_MINUTES, 6);
    expect(driveOut[3].batteryStartWh).toBe(CAPACITY_WH);
    // Overnight life support on solar power drains the battery while parked; then it recharges.
    expect(driveOut[1].batteryEndWh).toBeLessThan(driveOut[1].batteryStartWh);
    expect(driveOut[2].batteryEndWh).toBe(CAPACITY_WH);
    const parked = driveOut[1];
    expect(stateAt(timeline, parked.startMin + 1).position).toEqual(
      stateAt(timeline, parked.endMin - 1).position,
    );
    for (const segment of timeline.segments.filter((s) => s.activity === "driving")) {
      const atStart = stateAt(timeline, segment.startMin).batteryWh;
      const midway = stateAt(timeline, (segment.startMin + segment.endMin) / 2).batteryWh;
      expect(midway).toBeLessThanOrEqual(atStart);
      expect(segment.batteryEndWh).toBeLessThanOrEqual(midway);
    }
    expect(stateAt(timeline, timeline.totalMin).suitMin).toBe(timeline.suit.lowestMin);
  });

  it("is null for a plan that did not work out", () => {
    const { plan, driveGrid } = plannedTrip("fission");
    expect(expeditionLegs({ ...plan, status: "walk_failed", collection: null }, driveGrid)).toBe(
      null,
    );
  });
});
