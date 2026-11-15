import { describe, expect, it } from "vitest";

import { solarAlertLevel, type SpaceWeather } from "./solar-alert";

const quietSun: SpaceWeather = {
  strongest_flare_24h: null,
  particle_event_above_10_mev: false,
  particle_event_above_100_mev: false,
  hours_until_storm_reaches_mars: null,
};

describe("solarAlertLevel", () => {
  it("is none when the Sun is quiet", () => {
    expect(solarAlertLevel(quietSun)).toBe("none");
  });

  it.each([
    { flare: "C9.9", expectedLevel: "none" },
    { flare: "M4.9", expectedLevel: "none" },
    { flare: "M5.0", expectedLevel: "watch" },
    { flare: "M5", expectedLevel: "watch" },
    { flare: "X1.2", expectedLevel: "watch" },
  ])("is $expectedLevel after a $flare flare", ({ flare, expectedLevel }) => {
    expect(solarAlertLevel({ ...quietSun, strongest_flare_24h: flare })).toBe(expectedLevel);
  });

  it("is watch during a particle event above 10 MeV", () => {
    expect(solarAlertLevel({ ...quietSun, particle_event_above_10_mev: true })).toBe("watch");
  });

  it("is warning during a particle event above 100 MeV", () => {
    expect(solarAlertLevel({ ...quietSun, particle_event_above_100_mev: true })).toBe("warning");
  });

  it.each([
    { hours: 5, expectedLevel: "watch" },
    { hours: 7, expectedLevel: "watch" },
    { hours: 8, expectedLevel: "none" },
    { hours: -3, expectedLevel: "watch" },
    { hours: -8, expectedLevel: "none" },
  ])(
    "is $expectedLevel when a solar storm reaches Mars in $hours h",
    ({ hours, expectedLevel }) => {
      expect(solarAlertLevel({ ...quietSun, hours_until_storm_reaches_mars: hours })).toBe(
        expectedLevel,
      );
    },
  );

  it("rejects a flare class it cannot read", () => {
    expect(() => solarAlertLevel({ ...quietSun, strongest_flare_24h: "big" })).toThrow();
  });
});
