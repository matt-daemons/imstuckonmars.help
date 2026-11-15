import { describe, expect, it } from "vitest";
import { evaluateMission } from "@/lib/mission/engine";
import { buildExpeditionConfig, type ExpeditionPlan } from "@/lib/mission/expedition";
import { replanConfig } from "@/lib/mission/outlook";
import type { MissionReport } from "@/lib/mission/client";
import { summarize } from "./report-model";

const plan: ExpeditionPlan = {
  id: "report-test",
  mode: "walking",
  shelter_lnglat: [-176.05, 45.97],
  outbound: {
    path: [
      [-176.05, 45.97],
      [-176.04, 45.97],
    ],
    duration_s: 1800,
  },
  sampling_s: 3600,
  back: {
    path: [
      [-176.04, 45.97],
      [-176.05, 45.97],
    ],
    duration_s: 1800,
  },
};
const trace = [
  {
    source_row: 1,
    segment_id: 0,
    elapsed_ms: 0,
    sclk_ms: null,
    utc_ms: null,
    oxygen_rate_g_h: 0,
    total_power_w: 0,
  },
];

function report(
  config = buildExpeditionConfig(plan, "fixture", 1),
  at = config.duration_s,
): MissionReport {
  return {
    mission_id: "report-test",
    revision: 0,
    at_s: at,
    status: "ok",
    ended_by_operator: false,
    config,
    events: [],
    final: evaluateMission(config, trace, [], at),
    series: [],
    provenance: "Synthetic test fixture, not NASA measurements",
  };
}

describe("mission report", () => {
  it("distinguishes pre-departure, active and returned missions", () => {
    expect(summarize(report(undefined, 0)).departed).toBe(false);
    expect(summarize(report(undefined, 1200)).returned).toBe(false);
    expect(summarize(report()).returned).toBe(true);
  });

  it("keeps the original sampling target after a turn back", () => {
    const original = buildExpeditionConfig(plan, "fixture", 1);
    const next = replanConfig(original, trace, [], 1500, "turn_back");
    if (typeof next === "string") throw new Error(next);
    const facts = summarize(report(next));
    expect(facts.plannedScience).toBe(3600);
    expect(facts.science).toBe(0);
    expect(facts.returned).toBe(true);
  });

  it("counts only sampling already performed", () => {
    expect(summarize(report(undefined, 2700)).science).toBe(300);
  });

  it("does not count an operator-ended outbound run as a return", () => {
    const ended = { ...report(undefined, 1200), ended_by_operator: true };
    const facts = summarize(ended);
    expect(facts.departed).toBe(true);
    expect(facts.returned).toBe(false);
    expect(facts.science).toBe(0);
  });

  it("retains a recorded low margin even if the final inventory was restored", () => {
    const value = report();
    value.series = [
      {
        t: 1500,
        activity: "travel",
        phase: "outbound",
        distance_m: 500,
        travelled_m: 500,
        suit_oxygen_g: 10,
        suit_energy_wh: 20,
        shelter_oxygen_g: 0,
        shelter_energy_wh: 0,
        reasons: [],
      },
    ];
    value.final.oxygen.eva.first_reserve_crossing_s = 1400;
    const facts = summarize(value);
    expect(facts.breached).toBe(true);
    expect(facts.o2Margin).toBe(10 - value.config.oxygen.eva.reserve_g);
    expect(facts.farthest).toBe(500);
  });
});
