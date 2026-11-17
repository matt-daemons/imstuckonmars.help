import { describe, expect, it } from "vitest";
import { FLIGHT_RULES } from "../flight-rules/rules";
import { evaluateMission } from "./engine";
import {
  PREP_S,
  RECOVERY_S,
  buildExpeditionConfig,
  expeditionDuration,
  idleConfig,
  parsePlan,
  type ExpeditionPlan,
} from "./expedition";
import { missionOutlook, replanConfig } from "./outlook";
import { crewPositionAt, marsDistanceM, pathLengthM, pointAlong } from "./position";
import type { MarsLngLat, MoxieSample, ScenarioEvent } from "./types";
import { parseEvent } from "./validation";

const SHELTER: MarsLngLat = [-176.05, 45.97];
const R = 3_396_190;
/** A point `east` metres east and `north` metres north of the shelter on the Mars sphere. */
const offset = (east: number, north = 0): MarsLngLat => [
  SHELTER[0] + (east / (R * Math.cos((SHELTER[1] * Math.PI) / 180))) * (180 / Math.PI),
  SHELTER[1] + (north / R) * (180 / Math.PI),
];
const OUT: MarsLngLat[] = [SHELTER, offset(600), offset(1200, 200)];
const BACK: MarsLngLat[] = [...OUT].reverse();

function plan(overrides: Partial<ExpeditionPlan> = {}): ExpeditionPlan {
  return {
    id: "test-walk",
    mode: "walking",
    shelter_lnglat: SHELTER,
    outbound: { path: OUT, duration_s: 1800 },
    sampling_s: 3600,
    back: { path: BACK, duration_s: 1800 },
    ...overrides,
  };
}

function samples(count: number): MoxieSample[] {
  return Array.from({ length: count }, (_, index) => ({
    source_row: index + 1,
    segment_id: 0,
    elapsed_ms: index * 1000,
    sclk_ms: null,
    utc_ms: null,
    oxygen_rate_g_h: 6,
    total_power_w: 300,
  }));
}

const TRACE = 12_233;
const trace = samples(TRACE);
/** The engine receives the trace slice the server passes for this configuration. */
const slice = (config: ReturnType<typeof buildExpeditionConfig>) =>
  trace.slice(
    config.source_start_row - 1,
    config.source_start_row - 1 + Math.ceil(config.duration_s),
  );
const event = (value: object) => parseEvent(value, 21_600) as ScenarioEvent;

describe("Mars positions", () => {
  it("walks at a constant pace, holds at the site, and is back at the shelter afterwards", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const route = config.route!;
    const length = pathLengthM(OUT);
    expect(crewPositionAt(route, 0).phase).toBe("shelter");
    const mid = crewPositionAt(route, PREP_S + 900);
    expect(mid.phase).toBe("outbound");
    expect(mid.travelled_m).toBeCloseTo(length / 2, 3);
    const site = crewPositionAt(route, PREP_S + 1800 + 100);
    expect(site.phase).toBe("science");
    expect(marsDistanceM(site.lnglat, OUT[2])).toBeLessThan(1e-6);
    const home = crewPositionAt(route, config.duration_s - 1);
    expect(home.phase).toBe("shelter");
    expect(home.travelled_m).toBeCloseTo(2 * length, 3);
  });

  it("interpolates across the ±180° line the short way", () => {
    const point = pointAlong(
      [
        [179.9999, 0],
        [-179.9999, 0],
      ],
      marsDistanceM([179.9999, 0], [-179.9999, 0]) / 2,
    );
    expect(Math.abs(point[0])).toBeCloseTo(180, 6);
  });
});

describe("expedition configuration", () => {
  it("sizes the suits to the flight rules, so suit minutes and grams agree", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const rate = config.profiles.travel.oxygen_g_h_per_person * config.crew_count;
    expect((config.oxygen.eva.capacity_g / rate) * 60).toBeCloseTo(
      FLIGHT_RULES.suit_supply.primary_minutes,
    );
    expect((config.oxygen.eva.reserve_g / rate) * 60).toBeCloseTo(
      FLIGHT_RULES.suit_supply.reserve_minutes,
    );
    expect(config.duration_s).toBe(PREP_S + 1800 + 3600 + 1800 + RECOVERY_S);
    expect(config.schedule.map((e) => e.activity)).toEqual([
      "base",
      "travel",
      "science",
      "return",
      "base",
    ]);
    expect(config.route!.legs.map((l) => l.start_s)).toEqual([600, 2400, 6000]);
  });

  it("rejects expeditions longer than the simulator window", () => {
    expect(() => buildExpeditionConfig(plan({ sampling_s: 6 * 3600 }), "run", TRACE)).toThrow(
      /at most 360 min/,
    );
    expect(expeditionDuration(plan())).toBe(8700);
  });

  it("parses only bounded client plans", () => {
    expect(parsePlan(JSON.parse(JSON.stringify(plan()))).outbound.path).toHaveLength(3);
    expect(() => parsePlan({ ...plan(), mode: "fly" })).toThrow();
    expect(() => parsePlan({ ...plan(), mode: "drive_walk" })).toThrow(/rover/);
    expect(() =>
      parsePlan({ ...plan(), outbound: { path: Array(601).fill(SHELTER), duration_s: 60 } }),
    ).toThrow();
  });

  it("shelters in the rover without crediting habitat MOXIE production", () => {
    const config = buildExpeditionConfig(
      plan({ mode: "drive_walk", rover: { power: "solar", battery_percent: 60 } }),
      "run",
      TRACE,
    );
    expect(config.route!.shelter).toBe("rover");
    expect(config.battery.base.initial_wh).toBe(120_000);
    const state = evaluateMission(config, slice(config), [], config.duration_s);
    expect(state.oxygen.base.produced_g).toBe(0);
    expect(state.effective_generator_power_w).toBe(0);
  });

  it("keeps an idle shelter session within the archived trace", () => {
    const config = idleConfig("run", TRACE, SHELTER);
    expect(config.duration_s).toBe(TRACE);
    expect(config.route).toBeUndefined();
  });
});

describe("engine additions", () => {
  it("couples position, oxygen, battery and time in one evaluation", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const a = evaluateMission(config, slice(config), [], 1200);
    const b = evaluateMission(config, slice(config), [], 2000);
    expect(b.position!.travelled_m).toBeGreaterThan(a.position!.travelled_m);
    expect(b.oxygen.eva.remaining_g).toBeLessThan(a.oxygen.eva.remaining_g);
    expect(b.battery.eva.remaining_wh).toBeLessThan(a.battery.eva.remaining_wh);
  });

  it("multiplies suit demand while exertion is raised", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const nominal = evaluateMission(config, slice(config), [], 1800);
    const heavy = evaluateMission(
      config,
      slice(config),
      [event({ id: "x", type: "consumption_change", target: "eva", value: 2, at_s: 600 })],
      1800,
    );
    expect(heavy.oxygen.eva.consumed_g).toBeCloseTo(2 * nominal.oxygen.eva.consumed_g, 6);
    expect(heavy.battery.eva.discharged_wh).toBeCloseTo(2 * nominal.battery.eva.discharged_wh, 6);
  });

  it("continues after the archive ends with no production credited, and says so", () => {
    const config = buildExpeditionConfig(plan(), "run", 3000);
    expect(config.source_start_row).toBe(1);
    const state = evaluateMission(config, samples(3000), [], config.duration_s);
    expect(state.status).toBe("ok");
    expect(state.reasons).toContain("archive_ended_no_production_credited");
    expect(state.oxygen.base.produced_g).toBeCloseTo(6 * 0.8 * (3000 / 3600), 6);
  });

  it("records checkpoints identical to direct evaluations", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const recorded: Array<{ t: number; o2: number }> = [];
    const leak = event({ id: "leak", type: "oxygen_leak", target: "eva", value: 200, at_s: 1500 });
    evaluateMission(config, slice(config), [leak], 4000, {
      times: [1000, 1500, 3999.5],
      record: (s) => recorded.push({ t: s.elapsed_s, o2: s.oxygen.eva.remaining_g }),
    });
    for (const { t, o2 } of recorded)
      expect(o2).toBeCloseTo(
        evaluateMission(config, slice(config), [leak], t).oxygen.eva.remaining_g,
        9,
      );
    expect(recorded).toHaveLength(3);
  });
});

describe("outlook and replanning", () => {
  it("recommends continuing a nominal plan and offers different predicted outcomes", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const outlook = missionOutlook(config, slice(config), [], 1500);
    const [cont, back, cut] = outlook.options;
    expect(cont.status).toBe("modeled_resource_feasible");
    expect(outlook.recommended).toBe("continue");
    expect(back.available && cut.available).toBe(true);
    expect(back.arrival_s!).toBeLessThan(cut.arrival_s!);
    expect(cut.arrival_s!).toBeLessThan(cont.arrival_s!);
    expect(back.margins!.oxygen_g).toBeGreaterThan(cont.margins!.oxygen_g);
    expect(cont.budget.map((b) => b.activity)).toEqual(["travel", "science", "return"]);
  });

  it("flags a leak that breaks the return reserve and recommends a feasible alternative", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const leak = event({ id: "leak", type: "oxygen_leak", target: "eva", value: 500, at_s: 1500 });
    const outlook = missionOutlook(config, slice(config), [leak], 1500);
    const cont = outlook.options[0];
    expect(cont.status).toBe("modeled_constraint_violation");
    expect(cont.reasons).toContain("oxygen_return_reserve");
    expect(cont.limiting).toBe("suit_oxygen");
    const chosen = outlook.options.find((o) => o.option === outlook.recommended)!;
    expect(chosen.status).toBe("modeled_resource_feasible");
    expect(outlook.rationale).toMatch(/breaks a modeled suit constraint/);
  });

  it("applies a replan without rewriting the past", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const next = replanConfig(config, slice(config), [], 1500, "turn_back");
    if (typeof next === "string") throw new Error(next);
    for (const t of [0, 700, 1499]) {
      const replanned = evaluateMission(next, slice(next), [], t);
      const original = evaluateMission(config, slice(config), [], t);
      expect(replanned.oxygen).toEqual(original.oxygen);
      expect(replanned.battery).toEqual(original.battery);
      expect(replanned.activity).toBe(original.activity);
      expect(marsDistanceM(replanned.position!.lnglat, original.position!.lnglat)).toBeLessThan(
        1e-3,
      );
    }
    expect(crewPositionAt(next.route!, next.duration_s - 1).phase).toBe("shelter");
    expect(next.route!.decisions).toEqual([
      { at_s: 1500, option: "turn_back", title: "Turn back now" },
    ]);
    expect(next.route!.planned_sampling_s).toBe(3600);
    expect(next.duration_s).toBeLessThan(config.duration_s);
    expect(next.duration_s).toBe(next.route!.legs.at(-1)!.end_s + RECOVERY_S);
    const home = evaluateMission(next, slice(next), [], next.duration_s);
    expect(home.position!.phase).toBe("shelter");
  });

  it("explains why an option is unavailable", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const before = missionOutlook(config, slice(config), [], 100);
    expect(before.options[1].unavailable_reason).toMatch(/not left/);
    expect(replanConfig(config, slice(config), [], 100, "turn_back")).toMatch(/not left/);
    const returning = missionOutlook(config, slice(config), [], 6500);
    expect(returning.options[1].available).toBe(false);
    expect(returning.options[2].unavailable_reason).toMatch(/No sampling/);
  });

  it("ends a shortened sampling run after its new return and the same recovery interval", () => {
    const original = buildExpeditionConfig(plan(), "run", TRACE);
    const next = replanConfig(original, slice(original), [], 3000, "turn_back");
    if (typeof next === "string") throw new Error(next);
    expect(next.route!.legs.at(-1)!.end_s).toBe(4800);
    expect(next.duration_s).toBe(4800 + RECOVERY_S);
    expect(next.schedule.at(-1)).toEqual({ start_s: 4800, end_s: 5700, activity: "base" });
    expect(next.source_start_row).toBe(original.source_start_row);
    expect(evaluateMission(next, slice(next), [], next.duration_s).position!.phase).toBe("shelter");
  });
});

describe("expedition semantics", () => {
  it("stops draining suits once the crew is back in the shelter", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const leak = event({ id: "leak", type: "oxygen_leak", target: "eva", value: 300, at_s: 1500 });
    const back = evaluateMission(config, slice(config), [leak], config.duration_s - RECOVERY_S);
    const later = evaluateMission(config, slice(config), [leak], config.duration_s);
    expect(later.oxygen.eva.remaining_g).toBe(back.oxygen.eva.remaining_g);
  });

  it("counts an empty tank's unmet demand in the predicted shortfall", () => {
    const config = buildExpeditionConfig(plan(), "run", TRACE);
    const leak = event({ id: "leak", type: "oxygen_leak", target: "eva", value: 1200, at_s: 1400 });
    const [cont, , cut] = missionOutlook(config, slice(config), [leak], 1400).options;
    expect(cont.margins!.oxygen_g).toBeLessThan(-config.oxygen.eva.reserve_g);
    expect(cut.margins!.oxygen_g).toBeGreaterThan(cont.margins!.oxygen_g);
  });
});
