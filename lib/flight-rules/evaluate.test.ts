import { describe, expect, it } from "vitest";

import { evaluateEva, evaluateRoute, type EvaPlan } from "./evaluate";

// A short, flat walk in clear weather with plenty of daylight.
const safePlan: EvaPlan = {
  route: { est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 },
  live: { solar_alert_level: "none", radiation_dose_rate: 9, dust_opacity: 0.4 },
  minutes_until_sunset: 480,
};

function planWith(changes: {
  route?: Partial<EvaPlan["route"]>;
  live?: Partial<EvaPlan["live"]>;
  minutes_until_sunset?: number;
}): EvaPlan {
  return {
    route: { ...safePlan.route, ...changes.route },
    live: { ...safePlan.live, ...changes.live },
    minutes_until_sunset: changes.minutes_until_sunset ?? safePlan.minutes_until_sunset,
  };
}

describe("evaluateEva", () => {
  it("gives GO with no limiting factor when every rule is met", () => {
    expect(evaluateEva(safePlan)).toEqual({ verdict: "GO", limiting_factor: null, reasons: [] });
  });

  it.each([
    { name: "slope above 20°", changes: { route: { max_slope: 21 } }, factor: "slope" },
    {
      name: "farther than 2 km from base",
      changes: { route: { farthest_from_base_km: 2.5 } },
      factor: "walk_back",
    },
    // 360 min planned x 1.3 margin = 468 min, past the 450 min the suit allows.
    {
      name: "walk longer than the suit supply allows",
      changes: { route: { est_time_min: 360 }, minutes_until_sunset: 900 },
      factor: "suit_supply",
    },
    {
      name: "solar alert at warning",
      changes: { live: { solar_alert_level: "warning" as const } },
      factor: "radiation",
    },
    {
      name: "dose rate of 90 µGy/h",
      changes: { live: { radiation_dose_rate: 90 } },
      factor: "dose_rate",
    },
    { name: "dust opacity of 2", changes: { live: { dust_opacity: 2 } }, factor: "dust" },
    // 180 min x 1.3 = 234 min, but the sun sets in 200.
    {
      name: "return after sunset",
      changes: { minutes_until_sunset: 200 },
      factor: "daylight",
    },
  ])("gives NO_GO for $name", ({ changes, factor }) => {
    const result = evaluateEva(planWith(changes));

    expect(result.verdict).toBe("NO_GO");
    expect(result.limiting_factor).toBe(factor);
    expect(result.reasons).toHaveLength(1);
  });

  it.each([
    { name: "slope between 15° and 20°", changes: { route: { max_slope: 17 } }, factor: "slope" },
    { name: "slope of exactly 20°", changes: { route: { max_slope: 20 } }, factor: "slope" },
    // 300 min x 1.3 = 390 min, past the 360 min planned length but within supply.
    {
      name: "walk longer than the planned 6 hours",
      changes: { route: { est_time_min: 300 }, minutes_until_sunset: 900 },
      factor: "suit_supply",
    },
    {
      name: "solar alert at watch",
      changes: { live: { solar_alert_level: "watch" as const } },
      factor: "radiation",
    },
    {
      name: "dose rate of 18 µGy/h",
      changes: { live: { radiation_dose_rate: 18 } },
      factor: "dose_rate",
    },
    {
      name: "dose rate between 18 and 90 µGy/h",
      changes: { live: { radiation_dose_rate: 50 } },
      factor: "dose_rate",
    },
    {
      name: "dust opacity between 1 and 2",
      changes: { live: { dust_opacity: 1.2 } },
      factor: "dust",
    },
    // 180 min x 1.3 = 234 min, only 16 min before a sunset in 250.
    {
      name: "return less than an hour before sunset",
      changes: { minutes_until_sunset: 250 },
      factor: "daylight",
    },
  ])("gives CAUTION for $name", ({ changes, factor }) => {
    const result = evaluateEva(planWith(changes));

    expect(result.verdict).toBe("CAUTION");
    expect(result.limiting_factor).toBe(factor);
    expect(result.reasons).toHaveLength(1);
  });

  it.each([
    { name: "slope of exactly 15°", changes: { route: { max_slope: 15 } } },
    { name: "exactly 2 km from base", changes: { route: { farthest_from_base_km: 2 } } },
    {
      name: "dose rate just under 18 µGy/h",
      changes: { live: { radiation_dose_rate: 17.9 } },
    },
    { name: "dust opacity just under 1", changes: { live: { dust_opacity: 0.99 } } },
    // 180 min x 1.3 = 234 min, exactly 60 min before a sunset in 294.
    { name: "return exactly an hour before sunset", changes: { minutes_until_sunset: 294 } },
  ])("stays GO at the limit: $name", ({ changes }) => {
    expect(evaluateEva(planWith(changes)).verdict).toBe("GO");
  });

  it("reports times in whole minutes", () => {
    // 278 min x 1.3 = 361.4 min, which floating point stores as 361.40000000000003.
    // That is past the planned 360 min and only 38.6 min before a sunset in 400.
    const result = evaluateEva(
      planWith({ route: { est_time_min: 278 }, minutes_until_sunset: 400 }),
    );

    expect(result.reasons).toHaveLength(2);
    for (const reason of result.reasons) {
      expect(reason).not.toMatch(/\d\.\d/);
    }
  });

  it("reports the NO_GO factor as limiting when a CAUTION is also present", () => {
    const result = evaluateEva(planWith({ route: { max_slope: 17 }, live: { dust_opacity: 3 } }));

    expect(result.verdict).toBe("NO_GO");
    expect(result.limiting_factor).toBe("dust");
    expect(result.reasons).toHaveLength(2);
  });
});

describe("evaluateRoute", () => {
  it("gives GO when the route meets every route rule", () => {
    const route = { est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 };
    expect(evaluateRoute(route)).toEqual({ verdict: "GO", limiting_factor: null, reasons: [] });
  });

  it("gives NO_GO beyond the walk-back limit and prints the distance to 2 decimals", () => {
    const result = evaluateRoute({ ...safePlan.route, farthest_from_base_km: 5.440856262495297 });
    expect(result.verdict).toBe("NO_GO");
    expect(result.limiting_factor).toBe("walk_back");
    expect(result.reasons[0]).toContain("5.44 km");
    expect(result.reasons[0]).not.toContain("5.4408");
  });

  // 300 min x 1.3 margin = 390 min: over the planned 360, under the 450 the suit allows.
  it("gives CAUTION when the walk with margin is longer than planned", () => {
    const result = evaluateRoute({ ...safePlan.route, est_time_min: 300 });
    expect(result.verdict).toBe("CAUTION");
    expect(result.limiting_factor).toBe("suit_supply");
  });

  it("prints the slope to 1 decimal", () => {
    const result = evaluateRoute({ ...safePlan.route, max_slope: 20.4567 });
    expect(result.verdict).toBe("NO_GO");
    expect(result.limiting_factor).toBe("slope");
    expect(result.reasons[0]).toContain("20.5°");
  });

  it("agrees with evaluateEva when the live readings are safe", () => {
    const route = { ...safePlan.route, farthest_from_base_km: 5.440856262495297 };
    expect(evaluateRoute(route)).toEqual(evaluateEva(planWith({ route })));
  });
});
