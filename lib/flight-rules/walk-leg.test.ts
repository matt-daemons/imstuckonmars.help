import { describe, expect, it } from "vitest";

import { evaluateEva } from "./evaluate";
import { walkLegTiming } from "./walk-leg";

describe("walkLegTiming", () => {
  it("adds distance ÷ pace, sampling time and the 30 min reserve", () => {
    // 3 km at 2 km/h = 90 min, + 45 min sampling = 135 min, + 30 min reserve = 165 min.
    const timing = walkLegTiming({ walk_distance_km: 3, sampling_min: 45 });

    expect(timing.walking_min).toBeCloseTo(90);
    expect(timing.sampling_min).toBe(45);
    expect(timing.est_time_min).toBeCloseTo(135);
    expect(timing.reserve_min).toBe(30);
    expect(timing.suit_time_min).toBeCloseTo(165);
    expect(timing.suit_minutes_left).toBeCloseTo(480 - 165);
  });

  it("is just the reserve when nobody walks or samples", () => {
    const timing = walkLegTiming({ walk_distance_km: 0, sampling_min: 0 });
    expect(timing.suit_time_min).toBe(30);
  });

  it("goes negative on suit time left when the leg is too long for the suit", () => {
    // 14 km = 420 min walking + 60 min sampling + 30 reserve = 510 min, past 480.
    const timing = walkLegTiming({ walk_distance_km: 14, sampling_min: 60 });
    expect(timing.suit_minutes_left).toBeCloseTo(-30);
  });

  it("rejects negative inputs", () => {
    expect(() => walkLegTiming({ walk_distance_km: -1, sampling_min: 0 })).toThrow();
    expect(() => walkLegTiming({ walk_distance_km: 1, sampling_min: -5 })).toThrow();
  });

  it("labels its assumptions", () => {
    const { assumptions } = walkLegTiming({ walk_distance_km: 1, sampling_min: 10 });
    expect(assumptions.join(" ")).toMatch(/2 km\/h/);
    expect(assumptions.join(" ")).toMatch(/30 min/);
  });

  it("feeds evaluateEva without counting the reserve twice", () => {
    // 2 km + 300 min sampling = 360 min; ×1.3 = 468 min > 450 usable → NO_GO on suit supply.
    const timing = walkLegTiming({ walk_distance_km: 2, sampling_min: 300 });
    const verdict = evaluateEva({
      route: { est_time_min: timing.est_time_min, max_slope: 5, farthest_from_base_km: 1 },
      live: { solar_alert_level: "none", radiation_dose_rate: 9, dust_opacity: 0.4 },
      minutes_until_sunset: 900,
    });
    expect(verdict.limiting_factor).toBe("suit_supply");
  });
});
