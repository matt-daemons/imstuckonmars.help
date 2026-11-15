import { describe, expect, it } from "vitest";

import { projectResources } from "../../lib/copilot/projection";
import preset from "../../lib/mission/demo-preset.json";
import { evaluateMission } from "../../lib/mission/engine";
import type { MoxieSample } from "../../lib/mission/types";
import { parseConfig } from "../../lib/mission/validation";
import { ARCADIA_HABITAT, DEMO_SCENARIOS, demoMissionConfig } from "./demo-mission";

const config = parseConfig(demoMissionConfig(preset));

// The suit inventories do not use MOXIE, so synthetic samples are enough here.
const samples: MoxieSample[] = Array.from({ length: Math.ceil(config.duration_s) }, (_, i) => ({
  source_row: config.source_start_row + i,
  segment_id: 0,
  elapsed_ms: i * 1000,
  sclk_ms: null,
  utc_ms: null,
  oxygen_rate_g_h: 5,
  total_power_w: 200,
}));

const reasonsAt = (
  events: (typeof DEMO_SCENARIOS)[keyof typeof DEMO_SCENARIOS]["events"],
  t: number,
) => evaluateMission(config, samples, events, t).reasons;

describe("demoMissionConfig", () => {
  it("moves only the base coordinates", () => {
    expect(config.base).toEqual({ ...preset.base, ...ARCADIA_HABITAT });
    expect({ ...config, base: preset.base }).toEqual(parseConfig(preset));
  });
});

describe("nominal scenario", () => {
  it("reports no finding through the end of the walk", () => {
    for (const t of [600, 1800, 2400, 3600])
      expect(reasonsAt(DEMO_SCENARIOS.nominal.events, t)).toEqual([]);
  });
});

describe("suit battery failure scenario", () => {
  const events = DEMO_SCENARIOS["suit-battery-failure"].events;

  it("crosses the suit battery reserve during the walk back, and nothing else fires", () => {
    expect(reasonsAt(events, 3100)).toEqual([]);
    expect(reasonsAt(events, 3110)).toEqual(["eva_battery_below_reserve"]);
    expect(reasonsAt(events, 3600)).toEqual(["eva_battery_below_reserve"]);
    const state = evaluateMission(config, samples, events, 3600);
    expect(state.battery.eva.first_reserve_crossing_s).toBeCloseTo(3108, 0);
    expect(state.activity).toBe("base");
  });

  it("lets LARA forecast the crossing 10 seconds after the failure", () => {
    const projection = projectResources(config, samples, events, 1810, 3600 - 1810);
    expect(projection.battery.eva.first_reserve_crossing_s).toBeCloseTo(3108, 0);
  });
});
