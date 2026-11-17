import { describe, expect, it } from "vitest";
import { evaluateMission, assessReturn } from "./engine";
import { buildExpeditionConfig, type ExpeditionPlan } from "./expedition";
import { missionOutlook, replanConfig } from "./outlook";
import { parseEvent } from "./validation";
import { weatherRisksAt, equipmentPower } from "./weather-risks";
import type { ScenarioEvent } from "./types";

const plan: ExpeditionPlan = {
  id: "risk-test",
  mode: "walking",
  shelter_lnglat: [-176.05, 45.97],
  outbound: {
    path: [
      [-176.05, 45.97],
      [-176.04, 45.97],
    ],
    duration_s: 1800,
  },
  sampling_s: 1800,
  back: {
    path: [
      [-176.04, 45.97],
      [-176.05, 45.97],
    ],
    duration_s: 1800,
  },
};
const samples = [
  {
    source_row: 1,
    segment_id: 0,
    elapsed_ms: 0,
    utc_ms: null,
    sclk_ms: null,
    oxygen_rate_g_h: 0,
    total_power_w: 0,
  },
];
const config = () => buildExpeditionConfig(plan, "fixture", 1);
const risk = (kind: "dust" | "cold", at: number, active = true): ScenarioEvent => ({
  type: "weather_risk",
  risk: kind,
  active,
  at_s: at,
  id: `${kind}-${at}-${active}`,
});

describe("standalone weather risk drills", () => {
  it("accepts only a known risk and boolean, without a weather release or date", () => {
    expect(parseEvent(risk("dust", 500), 1000)).toEqual(risk("dust", 500));
    expect(() => parseEvent({ ...risk("dust", 500), risk: "hail" }, 1000)).toThrow();
    expect(() => parseEvent({ ...risk("dust", 500), active: "true" }, 1000)).toThrow();
    const state = evaluateMission(config(), samples, [risk("dust", 0)], 1000);
    expect(state.status).toBe("ok");
    expect(state.weather_risks).toEqual({ dust: true, cold: false });
    expect(state).not.toHaveProperty("weather");
  });

  it("replays unordered events, recovery and equal timestamps deterministically", () => {
    const events = [risk("dust", 900, false), risk("dust", 600), risk("cold", 700)];
    expect(weatherRisksAt(events, 650)).toEqual({ dust: true, cold: false });
    expect(weatherRisksAt(events, 1000)).toEqual({ dust: false, cold: true });
    expect(weatherRisksAt([risk("dust", 600), risk("dust", 600, false)], 600).dust).toBe(false);
  });

  it("preserves the original activity power without a drill", () => {
    const c = config();
    for (const activity of ["base", "travel", "return", "science", "rest"] as const)
      expect(equipmentPower(c, activity, 1.8)).toBe(c.profiles[activity].power_w * 1.8);
  });

  it("adds cold heater demand without changing oxygen demand or existing exertion", () => {
    const c = config();
    const effort: ScenarioEvent = {
      id: "effort",
      type: "consumption_change",
      target: "eva",
      value: 1.8,
      at_s: 600,
    };
    const baseline = evaluateMission(c, samples, [effort], 1800);
    const cold = evaluateMission(c, samples, [effort, risk("cold", 600)], 1800);
    expect(cold.oxygen.eva).toEqual(baseline.oxygen.eva);
    expect(baseline.battery.eva.remaining_wh - cold.battery.eva.remaining_wh).toBeCloseTo(
      (70 * 1200) / 3600 / c.battery.eva.discharge_efficiency,
      8,
    );
  });

  it("changes oxygen and energy, but not route timing, position, or base generation", () => {
    const c = config();
    const baseline = evaluateMission(c, samples, [], 1800);
    const drilled = evaluateMission(c, samples, [risk("dust", 600), risk("cold", 600)], 1800);
    expect(drilled.oxygen.eva.remaining_g).toBeLessThan(baseline.oxygen.eva.remaining_g);
    expect(drilled.battery.eva.remaining_wh).toBeLessThan(baseline.battery.eva.remaining_wh);
    expect(drilled.position).toEqual(baseline.position);
    expect(drilled.generation_w).toBe(baseline.generation_w);
    expect(drilled.weather_risk_effects!.dust_drill_s).toBe(1200);
    expect(drilled.weather_risk_effects!.cold_drill_s).toBe(1200);
    expect(drilled.weather_risk_effects!.extra_oxygen_demand_g).toBeCloseTo(10);
  });

  it("accounts for every added watt-hour with fractional event boundaries", () => {
    const c = config();
    const events = [risk("dust", 1000.5), risk("cold", 1050.25)];
    const drilled = evaluateMission(c, samples, events, 1900);
    const base = evaluateMission(c, samples, [], 1900);
    const demand = drilled.weather_risk_effects!;
    expect(base.battery.eva.remaining_wh - drilled.battery.eva.remaining_wh).toBeCloseTo(
      demand.extra_heater_wh + demand.extra_exertion_wh,
      7,
    );
    expect(demand.extra_heater_wh).toBeCloseTo(
      (70 * (1900 - 1050.25)) / 3600 / c.battery.eva.discharge_efficiency,
      8,
    );
    expect(drilled).toEqual(evaluateMission(c, samples, events, 1900));
  });

  it("does not consume suit resources while sheltered", () => {
    const c = config();
    const state = evaluateMission(c, samples, [risk("dust", 0), risk("cold", 0)], 300);
    expect(state.oxygen.eva.remaining_g).toBe(c.oxygen.eva.initial_g);
    expect(state.battery.eva.remaining_wh).toBe(c.battery.eva.initial_wh);
    expect(Object.values(state.weather_risk_effects!).every((value) => value === 0)).toBe(true);
  });

  it("clears a drill independently of other drills and exertion faults", () => {
    const c = config();
    const events: ScenarioEvent[] = [
      { id: "effort", type: "consumption_change", target: "eva", value: 1.8, at_s: 600 },
      risk("dust", 600),
      risk("cold", 600),
      risk("dust", 1200, false),
    ];
    const state = evaluateMission(c, samples, events, 1500);
    expect(state.demand_factor.eva).toBe(1.8);
    expect(state.weather_risks).toEqual({ dust: false, cold: true });
    expect(state.weather_risk_effects!.dust_drill_s).toBe(600);
  });

  it("projects the same risk loads through continuing, replanning and external returns", () => {
    const c = config();
    const events = [risk("dust", 600), risk("cold", 700)];
    const forecast = missionOutlook(c, samples, events, 1200);
    const arrival = forecast.options[0].arrival_s!;
    const arrived = evaluateMission(c, samples, events, arrival);
    expect(forecast.options[0].at_arrival!.energy_wh).toBeCloseTo(
      arrived.battery.eva.remaining_wh,
      9,
    );
    const next = replanConfig(c, samples, events, 1200, "turn_back");
    if (typeof next === "string") throw new Error(next);
    expect(evaluateMission(next, samples, events, next.duration_s).weather_risks).toEqual({
      dust: true,
      cold: true,
    });
    const now = evaluateMission(c, samples, events, 1200);
    const after = evaluateMission(c, samples, events, 1800);
    const external = assessReturn(
      c,
      now,
      {
        id: "return",
        revision: "1",
        mission_revision: 1,
        base_id: c.base.id,
        evaluated_at_s: 1200,
        status: "ok",
        legs: [{ activity: "return", duration_s: 600 }],
        warnings: [],
      },
      1,
      events,
    );
    expect(external.requirements.energy_wh).toBeCloseTo(
      now.battery.eva.remaining_wh - after.battery.eva.remaining_wh,
      8,
    );
    expect(external.requirements.oxygen_g).toBeCloseTo(
      now.oxygen.eva.remaining_g - after.oxygen.eva.remaining_g,
      8,
    );
  });

  it("distinguishes a discharge-power failure from a reserve shortfall", () => {
    const c = buildExpeditionConfig(
      {
        ...plan,
        outbound: { ...plan.outbound, duration_s: 60 },
        back: { ...plan.back, duration_s: 60 },
      },
      "fixture",
      1,
    );
    const events: ScenarioEvent[] = [
      { id: "effort", type: "consumption_change", target: "eva", value: 1.8, at_s: 780 },
      {
        id: "cells",
        type: "battery_failure",
        target: "eva",
        value: Math.round(c.battery.eva.capacity_wh * 0.45),
        at_s: 780,
      },
      risk("dust", 780),
      risk("cold", 780),
    ];
    const forecast = missionOutlook(c, samples, events, 790);
    for (const option of forecast.options.filter((o) => o.available)) {
      expect(option.status).toBe("modeled_constraint_violation");
      expect(option.margins!.oxygen_g).toBeGreaterThan(0);
      expect(option.margins!.energy_wh).toBeGreaterThan(0);
      expect(option.reasons).toContain("eva_power_demand_unmet");
    }
    expect(forecast.options[2].summary).not.toContain("already keeps its reserves");
    expect(forecast.rationale).toContain("constraint");
  });
});
