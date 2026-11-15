import { describe, expect, it } from "vitest";

import type { EvaPlan } from "@/lib/flight-rules/evaluate";
import { EARTH_MINUTES_PER_MARS_HOUR } from "@/lib/mars-time/mars-clock";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { DriveSummary } from "@/lib/mars/driving";

import {
  mergeConditions,
  minutesUntilSunsetAt,
  NO_DRILL,
  notCheckedText,
  realConditions,
  tripWithStorms,
  walkWithStorms,
} from "./conditions";

// A short, flat walk: 234 min with the terrain margin.
const route: EvaPlan["route"] = { est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 };

// Midday at the habitat, sunset at 18:00 local solar time.
const midday = { ltst: "12:00:00", minutes_until_sunset: 6 * EARTH_MINUTES_PER_MARS_HOUR };

const real = realConditions({ clock: midday, doseRate: 9, simulatedDust: 0.4 });
const nothingReal = realConditions({
  clock: { ltst: "12:00:00", minutes_until_sunset: null },
  doseRate: "LARA unavailable",
  simulatedDust: null,
});
const noSunset = () => null;

describe("realConditions", () => {
  it("marks each known value with its source, and knows of no solar-alert feed", () => {
    expect(real).toMatchObject({
      solar_alert_level: null,
      radiation_dose_rate: 9,
      dust_opacity: 0.4,
      minutes_until_sunset: midday.minutes_until_sunset,
      start_time: "12:00",
      sources: { dose_rate: "real", dust: "simulation", daylight: "real" },
      reasons_unknown: { radiation: "no solar-alert feed" },
    });
  });

  it("gives the reason for each unknown value", () => {
    expect(nothingReal.reasons_unknown).toEqual({
      radiation: "no solar-alert feed",
      dose_rate: "LARA unavailable",
      dust: "load the dust simulation",
      daylight: "no sunrise or sunset this sol",
    });
    expect(nothingReal.sources).toEqual({});
  });
});

describe("mergeConditions", () => {
  const drill = { solar_alert_level: "watch" as const, dust_opacity: 2.5, start_local_hour: 10 };

  it("lets a drill value win over a real one and marks its source as drill", () => {
    const merged = mergeConditions(real, drill, (hour) => minutesUntilSunsetAt(hour, midday));
    expect(merged).toMatchObject({
      solar_alert_level: "watch",
      dust_opacity: 2.5,
      minutes_until_sunset: 8 * EARTH_MINUTES_PER_MARS_HOUR,
      start_time: "10:00",
      sources: { radiation: "drill", dust: "drill", daylight: "drill", dose_rate: "real" },
    });
    expect(merged.reasons_unknown).toEqual({});
  });

  it("restores the real values once the drill is cleared", () => {
    expect(mergeConditions(real, NO_DRILL, noSunset)).toEqual(real);
  });

  it("leaves daylight unknown when the sun neither rises nor sets this sol", () => {
    const merged = mergeConditions(nothingReal, { ...NO_DRILL, start_local_hour: 10 }, noSunset);
    expect(merged.minutes_until_sunset).toBeNull();
    expect(merged.reasons_unknown.daylight).toBe("no sunrise or sunset this sol");
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
    const merged = mergeConditions(real, { ...NO_DRILL, dust_opacity: 2.5 }, noSunset);
    const check = walkWithStorms(route, merged);
    expect(check.verdict).toBe("NO_GO");
    expect(check.limiting_factor).toBe("dust");
    expect(check.reasons[0]).toContain("Drill, not real data");
  });

  it("names the simulation and the radiation proxy in their reasons", () => {
    const stormy = realConditions({ clock: midday, doseRate: 20, simulatedDust: 1.5 });
    const reasons = walkWithStorms(route, stormy).reasons.join(" ");
    expect(reasons).toContain("NASA Ames 2018 storm simulation");
    expect(reasons).toContain("Curiosity RAD at Gale, proxy for Arcadia");
  });

  it("names the local time the walk starts at in the daylight reason", () => {
    const night = realConditions({
      clock: { ltst: "21:14:05", minutes_until_sunset: -200 },
      doseRate: 9,
      simulatedDust: null,
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
      "Not checked: solar alert (no solar-alert feed), radiation (LARA unavailable), dust (load the dust simulation), daylight (no sunrise or sunset this sol).",
    );
  });

  it("says nothing when every value is known", () => {
    const merged = mergeConditions(real, { ...NO_DRILL, solar_alert_level: "none" }, noSunset);
    expect(notCheckedText(walkWithStorms(route, merged).not_checked, merged)).toBe("");
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
  };
  // Only the drive summary and the walk route are read, so the rest of the plan is left out.
  const plan = { drive: { summary: drive }, walk: { route } } as unknown as DriveWalkPlan;

  it("gives NO_GO on radiation for a solar warning, even when the drive is GO", () => {
    const merged = mergeConditions(real, { ...NO_DRILL, solar_alert_level: "warning" }, noSunset);
    const check = tripWithStorms(plan, merged);
    expect(check).toMatchObject({ verdict: "NO_GO", limiting_factor: "radiation" });
  });

  it("keeps the drive's verdict when the walk is no worse", () => {
    const battery = { ...drive, battery_left_percent: 25 };
    const cautious = { ...plan, drive: { summary: battery } } as unknown as DriveWalkPlan;
    const merged = mergeConditions(real, { ...NO_DRILL, solar_alert_level: "watch" }, noSunset);
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
