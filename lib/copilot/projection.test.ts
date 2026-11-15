import { describe, expect, it } from "vitest";
import preset from "../mission/demo-preset.json";
import { parseConfig } from "../mission/validation";
import type { MissionConfig, MoxieSample, ScenarioEvent } from "../mission/types";
import { projectResources } from "./projection";

function config(duration = 100): MissionConfig {
  const result = parseConfig(structuredClone(preset));
  result.duration_s = duration;
  result.crew_count = 1;
  result.capture_efficiency = 1;
  result.generation_w = 1000;
  result.base_load_w = 0;
  result.oxygen.base = { initial_g: 50, capacity_g: 1000, reserve_g: 10, leak_g_h: 0 };
  result.schedule = [{ start_s: 0, end_s: duration, activity: "base" }];
  for (const profile of Object.values(result.profiles)) {
    profile.oxygen_g_h_per_person = 0;
    profile.power_w = 0;
  }
  return result;
}

/** 3600 g/h is 1 g per second, which keeps the arithmetic readable. */
function samples(rates: number[]): MoxieSample[] {
  return rates.map((rate, index) => ({
    source_row: index + 1,
    segment_id: 0,
    elapsed_ms: index * 1000,
    sclk_ms: null,
    utc_ms: null,
    oxygen_rate_g_h: rate,
    total_power_w: 100,
  }));
}

describe("projection from ingested data only", () => {
  it("ignores archived rows after now", () => {
    const c = config();
    const past = Array(50).fill(3600);
    const quietFuture = samples([...past, ...Array(50).fill(0)]);
    const busyFuture = samples([...past, ...Array(50).fill(36000)]);
    const a = projectResources(c, quietFuture, [], 50, 50);
    const b = projectResources(c, busyFuture, [], 50, 50);
    expect(a).toEqual(b);
    expect(a.oxygen.base.now).toBeCloseTo(100);
    expect(a.oxygen.base.projected.nominal).toBeCloseTo(150);
  });

  it("excludes scenario events that have not happened yet", () => {
    const c = config();
    const data = samples(Array(100).fill(3600));
    const future: ScenarioEvent = { id: "late", at_s: 70, type: "generator_failure" };
    const past: ScenarioEvent = { id: "early", at_s: 10, type: "generator_failure" };
    const withFuture = projectResources(c, data, [future], 50, 50);
    const without = projectResources(c, data, [], 50, 50);
    expect(withFuture).toEqual(without);
    expect(projectResources(c, data, [past], 50, 50).oxygen.base.projected.nominal).toBeCloseTo(60);
  });

  it("brackets the nominal projection with the trailing variation", () => {
    const c = config();
    const data = samples(Array.from({ length: 100 }, (_, i) => (i % 2 ? 1800 : 5400)));
    const p = projectResources(c, data, [], 50, 50);
    expect(p.oxygen.base.projected.low).toBeLessThan(p.oxygen.base.projected.nominal);
    expect(p.oxygen.base.projected.high).toBeGreaterThan(p.oxygen.base.projected.nominal);
    expect(p.trend.oxygen_rate_g_h?.mean).toBeCloseTo(3600);
  });

  it("lowers confidence as the horizon outgrows the trend window", () => {
    const c = config(1000);
    const data = samples(Array(1000).fill(3600));
    expect(projectResources(c, data, [], 100, 50).confidence).toBe("high");
    expect(projectResources(c, data, [], 100, 300).confidence).toBe("medium");
    expect(projectResources(c, data, [], 100, 900).confidence).toBe("low");
  });
});
