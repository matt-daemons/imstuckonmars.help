import { describe, expect, it } from "vitest";

import type { EvaPlan } from "@/lib/flight-rules/evaluate";
import type { SpaceWeatherReport } from "@/lib/flight-rules/donki";
import { EARTH_MINUTES_PER_MARS_HOUR } from "@/lib/mars-time/mars-clock";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { DriveSummary } from "@/lib/mars/driving";

import {
  formatLocalHour,
  mergeConditions,
  minutesUntilSunsetAt,
  NO_DRILL,
  notCheckedText,
  realConditions,
  simLocalHour,
  spaceWeatherLine,
  sunTimes,
  tripWithStorms,
  walkWithStorms,
  withSimTime,
} from "./conditions";

// A short, flat walk: 234 min with the terrain margin.
const route: EvaPlan["route"] = { est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 };

// Midday at the habitat, sunset at 18:00 local solar time.
const midday = { ltst: "12:00:00", minutes_until_sunset: 6 * EARTH_MINUTES_PER_MARS_HOUR };

const quietSun: SpaceWeatherReport = {
  level: "none",
  weather: {
    strongest_flare_24h: "C2.8",
    particle_event_above_10_mev: false,
    particle_event_above_100_mev: false,
    hours_until_storm_reaches_mars: null,
  },
  fetched_at: "2026-11-15T10:42:31.000Z",
  source: "NASA DONKI",
  measured_at: "Earth (GOES) / model arrival at Mars",
};
const solarWatch: SpaceWeatherReport = { ...quietSun, level: "watch" };

const real = realConditions({
  clock: midday,
  doseRate: 9,
  simulatedDust: 0.4,
  spaceWeather: quietSun,
});
const nothingReal = realConditions({
  clock: { ltst: "12:00:00", minutes_until_sunset: null },
  doseRate: "LARA unavailable",
  simulatedDust: null,
  spaceWeather: "failed",
});

describe("realConditions", () => {
  it("marks each known value with its source", () => {
    expect(real).toMatchObject({
      solar_alert_level: "none",
      radiation_dose_rate: 9,
      dust_opacity: 0.4,
      minutes_until_sunset: midday.minutes_until_sunset,
      start_time: "12:00",
      sources: { radiation: "real", dose_rate: "real", dust: "simulation", daylight: "real" },
      reasons_unknown: {},
    });
  });

  it("gives the reason for each unknown value", () => {
    expect(nothingReal.reasons_unknown).toEqual({
      radiation: "DONKI unavailable",
      dose_rate: "LARA unavailable",
      dust: "load the dust simulation",
      daylight: "no sunrise or sunset this sol",
    });
    expect(nothingReal.sources).toEqual({});
  });

  it("leaves the solar alert unknown while NASA DONKI loads", () => {
    const loading = realConditions({
      clock: midday,
      doseRate: 9,
      simulatedDust: null,
      spaceWeather: "loading",
    });
    expect(loading.solar_alert_level).toBeNull();
    expect(loading.reasons_unknown.radiation).toBe("DONKI loading");
  });
});

describe("mergeConditions", () => {
  const drill = { solar_alert_level: "watch" as const, dust_opacity: 2.5 };

  it("lets a drill value win over a real one and marks its source as drill", () => {
    const merged = mergeConditions(real, drill);
    expect(merged).toMatchObject({
      solar_alert_level: "watch",
      dust_opacity: 2.5,
      sources: { radiation: "drill", dust: "drill", daylight: "real", dose_rate: "real" },
    });
    expect(merged.reasons_unknown).toEqual({});
  });

  it("restores the real values once the drill is cleared", () => {
    expect(mergeConditions(real, NO_DRILL)).toEqual(real);
  });
});

describe("withSimTime", () => {
  it("starts the walk at the simulated hour and marks daylight as simulation", () => {
    const simulated = withSimTime(real, 10, midday);
    expect(simulated).toMatchObject({
      minutes_until_sunset: 8 * EARTH_MINUTES_PER_MARS_HOUR,
      start_time: "10:00",
      sources: { daylight: "simulation" },
    });
  });

  it("keeps the real values when the sun neither rises nor sets this sol", () => {
    const clock = { ltst: "12:00:00", minutes_until_sunset: null };
    expect(withSimTime(nothingReal, 10, clock)).toEqual(nothingReal);
  });

  it("names the simulated start time in the daylight reason", () => {
    // Three hours before sunset is too short for the 234 min walk, so the daylight rule fires.
    const { reasons } = walkWithStorms(route, withSimTime(real, 15, midday));
    expect(reasons.join(" ")).toContain("Walk starts at 15:00 simulated local solar time.");
    expect(reasons.join(" ")).not.toContain("Drill");
  });
});

describe("simLocalHour", () => {
  const marsHourMs = EARTH_MINUTES_PER_MARS_HOUR * 60_000;

  it("runs on with real time from the hour it was set", () => {
    expect(simLocalHour({ hour: 10, set_at_ms: 0 }, 2.5 * marsHourMs)).toBeCloseTo(12.5);
  });

  it("wraps past midnight", () => {
    expect(simLocalHour({ hour: 23, set_at_ms: 0 }, 2 * marsHourMs)).toBeCloseTo(1);
  });

  it("does not run backwards before the moment it was set", () => {
    expect(simLocalHour({ hour: 10, set_at_ms: 5000 }, 0)).toBe(10);
  });
});

describe("sunTimes", () => {
  it("finds sunrise and sunset from a midday reading", () => {
    const sun = sunTimes(midday);
    expect(sun?.sunset).toBeCloseTo(18);
    expect(sun?.sunrise).toBeCloseTo(6);
  });

  it("is null when the sun neither rises nor sets this sol", () => {
    expect(sunTimes({ ltst: "12:00:00", minutes_until_sunset: null })).toBeNull();
  });
});

describe("formatLocalHour", () => {
  it("formats a fractional hour as HH:MM", () => {
    expect(formatLocalHour(13.5)).toBe("13:30");
    expect(formatLocalHour(6.01)).toBe("06:00");
  });
});

describe("minutesUntilSunsetAt", () => {
  const hours = (minutes: number | null) => minutes && minutes / EARTH_MINUTES_PER_MARS_HOUR;

  it("counts from the start hour to today's sunset", () => {
    expect(hours(minutesUntilSunsetAt(10, midday))).toBeCloseTo(8);
  });

  it("is negative after sunset, and before sunrise counts from last night's sunset", () => {
    expect(hours(minutesUntilSunsetAt(20, midday))).toBeCloseTo(-2);
    // Sunset at 18:00 puts sunrise at 06:00, as local solar time is symmetric about noon.
    expect(hours(minutesUntilSunsetAt(3, midday))).toBeCloseTo(-9);
  });

  it("finds today's sunset from a reading taken at night", () => {
    const night = { ltst: "21:00:00", minutes_until_sunset: -3 * EARTH_MINUTES_PER_MARS_HOUR };
    expect(hours(minutesUntilSunsetAt(10, night))).toBeCloseTo(8);
  });

  it("is null when the sun neither rises nor sets this sol", () => {
    expect(minutesUntilSunsetAt(10, { ltst: "12:00:00", minutes_until_sunset: null })).toBeNull();
  });
});

describe("walkWithStorms", () => {
  it("labels a drill reason as drill, not real data", () => {
    const merged = mergeConditions(real, { ...NO_DRILL, dust_opacity: 2.5 });
    const check = walkWithStorms(route, merged);
    expect(check.verdict).toBe("NO_GO");
    expect(check.limiting_factor).toBe("dust");
    expect(check.reasons[0]).toContain("Drill, not real data");
  });

  it("names the simulation and the radiation proxy in their reasons", () => {
    const stormy = realConditions({
      clock: midday,
      doseRate: 20,
      simulatedDust: 1.5,
      spaceWeather: quietSun,
    });
    const reasons = walkWithStorms(route, stormy).reasons.join(" ");
    expect(reasons).toContain("NASA Ames 2018 storm simulation");
    expect(reasons).toContain("Curiosity RAD at Gale, proxy for Arcadia");
  });

  it("says a real solar alert comes from NASA DONKI, measured at Earth", () => {
    const watch = realConditions({
      clock: midday,
      doseRate: 9,
      simulatedDust: 0.4,
      spaceWeather: solarWatch,
    });
    const check = walkWithStorms(route, watch);
    expect(check).toMatchObject({ verdict: "CAUTION", limiting_factor: "radiation" });
    expect(check.reasons[0]).toContain("NASA DONKI (measured at Earth)");
  });

  it("lets a drill solar alert override NASA DONKI's, labelled as drill", () => {
    const watch = realConditions({
      clock: midday,
      doseRate: 9,
      simulatedDust: 0.4,
      spaceWeather: solarWatch,
    });
    const merged = mergeConditions(watch, { ...NO_DRILL, solar_alert_level: "warning" });
    const check = walkWithStorms(route, merged);
    expect(check.verdict).toBe("NO_GO");
    expect(check.reasons[0]).toContain("Drill, not real data");
    expect(check.reasons[0]).not.toContain("DONKI");
  });

  it("names the local time the walk starts at in the daylight reason", () => {
    const night = realConditions({
      clock: { ltst: "21:14:05", minutes_until_sunset: -200 },
      doseRate: 9,
      simulatedDust: null,
      spaceWeather: quietSun,
    });
    const check = walkWithStorms(route, night);
    expect(check.limiting_factor).toBe("daylight");
    expect(check.reasons[0]).toContain("21:14 local solar time");
  });

  it("lists an unknown value as not checked, with its reason", () => {
    const check = walkWithStorms(route, nothingReal);
    expect(check.verdict).toBe("GO");
    expect(check.not_checked).toContain("dust");
    expect(notCheckedText(check.not_checked, nothingReal)).toBe(
      "Not checked: solar alert (DONKI unavailable), radiation (LARA unavailable), dust (load the dust simulation), daylight (no sunrise or sunset this sol).",
    );
  });

  it("says nothing when every value is known", () => {
    expect(notCheckedText(walkWithStorms(route, real).not_checked, real)).toBe("");
  });
});

describe("spaceWeatherLine", () => {
  it.each([
    { feed: quietSun, line: "Solar alert: none · NASA DONKI, read 10:42 UTC" },
    { feed: "loading" as const, line: "Solar alert: loading NASA DONKI…" },
    { feed: "failed" as const, line: "Solar alert: NASA DONKI unavailable" },
  ])("reads $line", ({ feed, line }) => {
    expect(spaceWeatherLine(feed)).toBe(line);
  });
});

describe("tripWithStorms", () => {
  // A short fission trip on gentle ground: GO for the drive.
  const drive: DriveSummary = {
    one_way_km: 60,
    odometer_km: 156,
    sols: 4,
    hardest_sol_kwh: 65,
    battery_left_percent: 67.5,
    reserve_km: 36,
    max_slope: 3,
    straight_km: 55,
    power: "fission",
    ground_km: { loose_dust: 0, sand_crust: 0, firm: 0, no_data: 120 },
  };
  // Only the drive summary and the walk route are read, so the rest of the plan is left out.
  const plan = { drive: { summary: drive }, walk: { route } } as unknown as DriveWalkPlan;

  it("gives NO_GO on radiation for a solar warning, even when the drive is GO", () => {
    const merged = mergeConditions(real, { ...NO_DRILL, solar_alert_level: "warning" });
    const check = tripWithStorms(plan, merged);
    expect(check).toMatchObject({ verdict: "NO_GO", limiting_factor: "radiation" });
  });

  it("keeps the drive's verdict when the walk is no worse", () => {
    const battery = { ...drive, battery_left_percent: 25 };
    const cautious = { ...plan, drive: { summary: battery } } as unknown as DriveWalkPlan;
    const merged = mergeConditions(real, { ...NO_DRILL, solar_alert_level: "watch" });
    expect(tripWithStorms(cautious, merged)).toMatchObject({
      verdict: "CAUTION",
      limiting_factor: "battery",
    });
  });

  it("is null until the trip has a drive and a walk", () => {
    const unplanned = { drive: null, walk: null } as unknown as DriveWalkPlan;
    expect(tripWithStorms(unplanned, real)).toBeNull();
  });
});
