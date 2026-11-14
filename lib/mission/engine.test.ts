import { describe, expect, it } from "vitest";
import preset from "./demo-preset.json";
import { assessReturn, evaluateMission } from "./engine";
import { anchorClock, clockPosition } from "./clock";
import { parseConfig, parseEvent, parseRoute } from "./validation";
import type { MissionConfig, MoxieSample, ReturnRoute } from "./types";

function config(duration = 10): MissionConfig {
  const result = parseConfig(structuredClone(preset));
  result.duration_s = duration;
  result.crew_count = 1;
  result.capture_efficiency = 1;
  result.generation_w = 1000;
  result.base_load_w = 0;
  result.schedule = [{ start_s: 0, end_s: duration, activity: "base" }];
  for (const profile of Object.values(result.profiles)) {
    profile.oxygen_g_h_per_person = 0;
    profile.power_w = 0;
  }
  return result;
}

function samples(count: number, oxygen = 3600, power = 100): MoxieSample[] {
  return Array.from({ length: count }, (_, index) => ({
    source_row: index + 1,
    segment_id: 0,
    elapsed_ms: index * 1000,
    sclk_ms: 739336096000 + index * 1000,
    utc_ms: null,
    oxygen_rate_g_h: oxygen,
    total_power_w: power,
  }));
}

describe("deterministic mission accounting", () => {
  it("integrates each inclusive archive sample exactly once, including fractional seeks", () => {
    const c = config();
    expect(evaluateMission(c, samples(10), [], 0).oxygen.base.produced_g).toBe(0);
    expect(evaluateMission(c, samples(10), [], 0.5).oxygen.base.produced_g).toBeCloseTo(0.5);
    expect(evaluateMission(c, samples(10), [], 10).oxygen.base.produced_g).toBeCloseTo(10);
    expect(evaluateMission(c, samples(10), [], 3)).toEqual(evaluateMission(c, samples(10), [], 3));
  });

  it("accounts for depletion, unmet demand and exact reserve-crossing time", () => {
    const c = config();
    c.oxygen.base = { initial_g: 5, capacity_g: 10, reserve_g: 2, leak_g_h: 0 };
    c.profiles.base.oxygen_g_h_per_person = 3600;
    const result = evaluateMission(c, samples(10, 0), [], 10);
    expect(result.oxygen.base.remaining_g).toBe(0);
    expect(result.oxygen.base.consumed_g).toBeCloseTo(5);
    expect(result.oxygen.base.unmet_g).toBeCloseTo(5);
    expect(result.oxygen.base.first_reserve_crossing_s).toBeCloseTo(3);
  });

  it("reports oxygen overflow rather than creating storage", () => {
    const c = config();
    c.oxygen.base = { initial_g: 5, capacity_g: 6, reserve_g: 0, leak_g_h: 0 };
    const state = evaluateMission(c, samples(10), [], 10).oxygen.base;
    expect(state.remaining_g).toBe(6);
    expect(state.vented_g).toBeCloseTo(9);
    expect(5 + state.produced_g - state.consumed_g - state.leaked_g - state.vented_g).toBeCloseTo(
      state.remaining_g,
    );
  });

  it("never credits base production to a portable EVA inventory", () => {
    const c = config();
    c.schedule[0].activity = "travel";
    c.profiles.travel.oxygen_g_h_per_person = 3600;
    const result = evaluateMission(c, samples(10), [], 10);
    expect(result.oxygen.base.produced_g).toBeCloseTo(10);
    expect(result.oxygen.eva.produced_g).toBe(0);
    expect(result.oxygen.eva.consumed_g).toBeCloseTo(10);
  });

  it("applies discharge efficiency once at the bus boundary", () => {
    const c = config(3600);
    c.generation_w = 0;
    c.base_load_w = 100;
    c.battery.base.discharge_efficiency = 0.8;
    const b = evaluateMission(c, samples(3600, 0, 0), [], 3600).battery.base;
    expect(b.discharged_wh).toBeCloseTo(125, 6);
    expect(b.remaining_wh).toBeCloseTo(c.battery.base.initial_wh - 125, 6);
  });

  it("enforces power limits and prevents unpowered oxygen production", () => {
    const c = config();
    c.generation_w = 0;
    c.battery.base.max_discharge_w = 50;
    const result = evaluateMission(c, samples(10, 3600, 100), [], 10);
    expect(result.oxygen.base.produced_g).toBe(0);
    expect(result.generator_available).toBe(false);
    expect(result.reasons).toContain("generator_power_shutdown_latched_until_restore");
  });

  it("splits at battery depletion and preserves the first interval's supported production", () => {
    const c = config(2);
    c.generation_w = 0;
    c.battery.base.initial_wh = 50 / 3600;
    c.battery.base.discharge_efficiency = 1;
    const result = evaluateMission(c, samples(2, 3600, 100), [], 2);
    expect(result.oxygen.base.produced_g).toBeCloseTo(0.5);
    expect(result.battery.base.remaining_wh).toBeCloseTo(0);
  });

  it("separates recorded readings from timestamped simulated failures", () => {
    const c = config();
    const source = samples(10);
    const result = evaluateMission(
      c,
      source,
      [{ id: "failure", type: "generator_failure", at_s: 2.5 }],
      10,
    );
    expect(result.oxygen.base.produced_g).toBeCloseTo(2.5);
    expect(result.observed_sample?.oxygen_rate_g_h).toBe(3600);
    expect(result.effective_oxygen_rate_g_h).toBe(0);
    expect(source[9].oxygen_rate_g_h).toBe(3600);
  });

  it("conserves transfers and rejects remote refilling", () => {
    const c = config();
    const result = evaluateMission(
      c,
      samples(10),
      [{ id: "transfer", type: "transfer_oxygen", at_s: 0, value: 100 }],
      0,
    );
    expect(result.oxygen.base.remaining_g).toBe(c.oxygen.base.initial_g - 100);
    expect(result.oxygen.eva.remaining_g).toBe(c.oxygen.eva.initial_g + 100);
    c.schedule[0].activity = "travel";
    expect(() =>
      evaluateMission(
        c,
        samples(10),
        [{ id: "transfer", type: "transfer_energy", at_s: 0, value: 1 }],
        0,
      ),
    ).toThrow("require the crew");
  });

  it("stops at missing derived values, source gaps and counter-reset boundaries", () => {
    for (const edit of [
      (s: MoxieSample) => {
        s.oxygen_rate_g_h = null;
      },
      (s: MoxieSample) => {
        s.elapsed_ms = 4000;
      },
      (s: MoxieSample) => {
        s.segment_id = 1;
      },
    ]) {
      const source = samples(10);
      edit(source[1]);
      const result = evaluateMission(config(), source, [], 10);
      expect(result.status).toBe("source_unavailable");
      expect(result.elapsed_s).toBe(1);
    }
  });
});

describe("route resource assessment", () => {
  const route: ReturnRoute = {
    id: "external-planner",
    revision: "r1",
    mission_revision: 0,
    base_id: "hypothetical-base",
    evaluated_at_s: 0,
    status: "ok",
    legs: [{ activity: "return", duration_s: 3600 }],
    warnings: [],
  };

  it("uses the supplied directed return and current leak, not outbound distance", () => {
    const c = config();
    c.profiles.return.oxygen_g_h_per_person = 100;
    const state = evaluateMission(
      c,
      samples(10),
      [{ id: "leak", at_s: 0, type: "oxygen_leak", target: "eva", value: 50 }],
      0,
    );
    expect(assessReturn(c, state, route, 0).requirements.oxygen_g).toBe(150);
    expect(
      assessReturn(c, state, { ...route, legs: [{ activity: "return", duration_s: 7200 }] }, 0)
        .requirements.oxygen_g,
    ).toBe(300);
  });

  it("never reports unknown/no-path/stale estimates as feasible", () => {
    const c = config();
    const state = evaluateMission(c, samples(10), [], 0);
    expect(assessReturn(c, state, { ...route, status: "no_path" }, 0).status).toBe("unknown");
    expect(assessReturn(c, state, route, 1).status).toBe("unknown");
    c.eva_limit_s = null;
    expect(assessReturn(c, state, route, 0).status).toBe("unknown");
  });

  it("withholds feasibility when a scheduled event falls within the supplied return", () => {
    const c = config();
    const state = evaluateMission(c, samples(10), [], 0);
    const result = assessReturn(c, state, route, 0, [
      { id: "failure", at_s: 1, type: "battery_failure", target: "eva", value: 0 },
    ]);
    expect(result.status).toBe("unknown");
    expect(result.reasons).toContain("future_scenario_events_not_projected");
  });

  it("does not erase prior unmet demand when an inventory later recovers", () => {
    const c = config();
    const state = evaluateMission(c, samples(10), [], 0);
    state.oxygen.eva.unmet_g = 1;
    expect(assessReturn(c, state, route, 0).status).toBe("modeled_constraint_violation");
  });
});

describe("clock and boundary validation", () => {
  it("pauses, changes speed without changing physics, and tolerates backward wall-clock adjustments", () => {
    const playing = { mode: "playing" as const, position_s: 10, speed: 2, anchor_ms: 1000 };
    expect(clockPosition(playing, 2000, 100)).toBe(12);
    expect(clockPosition(playing, 500, 100)).toBe(10);
    const paused = { ...anchorClock(playing, 12, 2000), mode: "paused" as const };
    expect(clockPosition(paused, 99999, 100)).toBe(12);
  });

  it("rejects NaN, negative demand, incomplete schedules, unknown events and malformed routes", () => {
    expect(() => parseConfig({ ...preset, generation_w: NaN })).toThrow();
    expect(() => parseConfig({ ...preset, schedule: [] })).toThrow();
    expect(() => parseEvent({ id: "x", type: "invented", at_s: 0 }, 10)).toThrow();
    expect(() =>
      parseRoute({
        id: "route",
        revision: "r1",
        mission_revision: 0,
        base_id: "base",
        evaluated_at_s: 0,
        status: "ok",
        warnings: [],
        legs: [{ activity: "return", duration_s: -1 }],
      }),
    ).toThrow();
  });
});
