import type { SpaceWeatherReport } from "@/lib/flight-rules/donki";
import { evaluateDrive } from "@/lib/flight-rules/drive";
import {
  evaluateWithConditions,
  type EvaPlan,
  type EvaVerdict,
  type KnownConditions,
  type StormFactor,
} from "@/lib/flight-rules/evaluate";
import type { RoverFactor } from "@/lib/flight-rules/rover-rules";
import type { Factor } from "@/lib/flight-rules/rules";
import type { SolarAlertLevel } from "@/lib/flight-rules/solar-alert";
import { EARTH_MINUTES_PER_MARS_HOUR, type MarsClockReading } from "@/lib/mars-time/mars-clock";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { Verdict } from "@/lib/mars/types";

export type ConditionSource = "real" | "simulation" | "drill";

/** The storm inputs the walk is checked on, where each came from, and why any is unknown. */
export interface Conditions extends KnownConditions {
  sources: Partial<Record<StormFactor, ConditionSource>>;
  reasons_unknown: Partial<Record<StormFactor, string>>;
  /** Local solar time the walk starts at, "HH:MM", named in the daylight reason. */
  start_time: string;
}

/** Values set by hand for a storm drill; null leaves the real value in place. */
export interface Drill {
  solar_alert_level: SolarAlertLevel | null;
  dust_opacity: number | null;
  /** Local solar hour at the habitat, 0 to 23. */
  start_local_hour: number | null;
}

export const NO_DRILL: Drill = {
  solar_alert_level: null,
  dust_opacity: null,
  start_local_hour: null,
};

export function isDrillSet(drill: Drill): boolean {
  return Object.values(drill).some((value) => value !== null);
}

/** NASA DONKI's last space-weather report, or where fetching it stands. */
export type SpaceWeatherFeed = SpaceWeatherReport | "loading" | "failed";

/** What the app reads for real, before any drill. */
export interface RealReadings {
  /** The Mars clock at the habitat now. */
  clock: Pick<MarsClockReading, "ltst" | "minutes_until_sunset">;
  /** LARA's radiation dose rate in µGy/h, or the reason there is none. */
  doseRate: number | string;
  /** The dust simulation's opacity at the habitat, null while it is not loaded and shown. */
  simulatedDust: number | null;
  spaceWeather: SpaceWeatherFeed;
}

export function realConditions({
  clock,
  doseRate,
  simulatedDust,
  spaceWeather,
}: RealReadings): Conditions {
  const conditions: Conditions = {
    solar_alert_level: null,
    radiation_dose_rate: null,
    dust_opacity: simulatedDust,
    minutes_until_sunset: clock.minutes_until_sunset,
    start_time: clock.ltst.slice(0, 5),
    sources: {},
    reasons_unknown: {},
  };
  if (typeof spaceWeather === "object") {
    conditions.solar_alert_level = spaceWeather.level;
    conditions.sources.radiation = "real";
  } else {
    conditions.reasons_unknown.radiation =
      spaceWeather === "failed" ? "DONKI unavailable" : "DONKI loading";
  }
  if (typeof doseRate === "number") {
    conditions.radiation_dose_rate = doseRate;
    conditions.sources.dose_rate = "real";
  } else {
    conditions.reasons_unknown.dose_rate = doseRate;
  }
  if (simulatedDust === null) conditions.reasons_unknown.dust = "load the dust simulation";
  else conditions.sources.dust = "simulation";
  if (clock.minutes_until_sunset === null) {
    conditions.reasons_unknown.daylight = "no sunrise or sunset this sol";
  } else {
    conditions.sources.daylight = "real";
  }
  return conditions;
}

/**
 * The real conditions with each set drill value in their place. sunsetAtHour gives the minutes
 * until sunset for a walk starting at a local solar hour, or null when the sun does not set.
 */
export function mergeConditions(
  real: Conditions,
  drill: Drill,
  sunsetAtHour: (hour: number) => number | null,
): Conditions {
  const merged: Conditions = {
    ...real,
    sources: { ...real.sources },
    reasons_unknown: { ...real.reasons_unknown },
  };
  function markDrill(factor: StormFactor) {
    merged.sources[factor] = "drill";
    delete merged.reasons_unknown[factor];
  }
  if (drill.solar_alert_level !== null) {
    merged.solar_alert_level = drill.solar_alert_level;
    markDrill("radiation");
  }
  if (drill.dust_opacity !== null) {
    merged.dust_opacity = drill.dust_opacity;
    markDrill("dust");
  }
  const hour = drill.start_local_hour;
  const minutesUntilSunset = hour === null ? null : sunsetAtHour(hour);
  if (hour !== null && minutesUntilSunset !== null) {
    merged.minutes_until_sunset = minutesUntilSunset;
    merged.start_time = `${String(hour).padStart(2, "0")}:00`;
    markDrill("daylight");
  }
  return merged;
}

/**
 * Earth minutes until sunset for a walk starting at startHour local solar time, from a clock
 * reading of the same sol. Like readMarsClock, it is negative after sunset and before sunrise.
 */
export function minutesUntilSunsetAt(
  startHour: number,
  clock: Pick<MarsClockReading, "ltst" | "minutes_until_sunset">,
): number | null {
  if (clock.minutes_until_sunset === null) return null;
  const [hours, minutes, seconds] = clock.ltst.split(":").map(Number);
  const nowHour = hours + minutes / 60 + seconds / 3600;
  const sunsetHour = wrapHour(nowHour + clock.minutes_until_sunset / EARTH_MINUTES_PER_MARS_HOUR);
  // Local true solar time is symmetric about noon, so sunrise is as far before noon as sunset is after.
  const sunriseHour = 24 - sunsetHour;
  // Before sunrise, the sunset that counts is last night's.
  const hoursUntilSunset =
    startHour < sunriseHour ? sunsetHour - startHour - 24 : sunsetHour - startHour;
  return hoursUntilSunset * EARTH_MINUTES_PER_MARS_HOUR;
}

function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

const DRILL_LABEL = "Drill, not real data.";

// Where each real value is measured. DONKI's flares and particle events are seen near Earth.
const REAL_LABELS: Partial<Record<StormFactor, string>> = {
  radiation: "NASA DONKI (measured at Earth).",
  dose_rate: "Curiosity RAD at Gale, proxy for Arcadia.",
};

/** Where a known value came from, added to its rule's reason. */
function sourceLabel(factor: StormFactor, { sources, start_time }: Conditions): string {
  const isDrill = sources[factor] === "drill";
  if (factor === "daylight") {
    return isDrill
      ? `Walk starts at ${start_time} local solar time. ${DRILL_LABEL}`
      : `Walk starts now, at ${start_time} local solar time.`;
  }
  if (isDrill) return DRILL_LABEL;
  if (sources[factor] === "simulation") return "NASA Ames 2018 storm simulation.";
  return REAL_LABELS[factor] ?? "";
}

/** The walk's verdict with each known storm rule, every storm reason saying where its value came from. */
export function walkWithStorms(route: EvaPlan["route"], conditions: Conditions) {
  const factors: StormFactor[] = ["radiation", "dose_rate", "dust", "daylight"];
  const labels = Object.fromEntries(
    factors.map((factor) => [factor, sourceLabel(factor, conditions)]),
  );
  return evaluateWithConditions(route, conditions, labels);
}

export type TripVerdict = EvaVerdict<Factor | RoverFactor> & { not_checked: StormFactor[] };

const SEVERITY: Record<Verdict, number> = { GO: 0, CAUTION: 1, NO_GO: 2 };

/**
 * The trip's verdict with storms: the worse of the drive's and the walk's, the drive on a tie, as
 * planDriveWalk picks. Storms count for the walk only, since the pressurized rover is shelter.
 * Null until the trip has a drive and a walk.
 */
export function tripWithStorms(plan: DriveWalkPlan, conditions: Conditions): TripVerdict | null {
  const driveSummary = plan.drive?.summary;
  const walkRoute = plan.walk?.route;
  if (!driveSummary || !walkRoute) return null;
  const walk = walkWithStorms(walkRoute, conditions);
  const drive = evaluateDrive(driveSummary);
  return SEVERITY[walk.verdict] > SEVERITY[drive.verdict]
    ? walk
    : { ...drive, not_checked: walk.not_checked };
}

// What the reader calls each storm rule: the radiation rule is the solar alert.
const FACTOR_NAMES: Record<StormFactor, string> = {
  radiation: "solar alert",
  dose_rate: "radiation",
  dust: "dust",
  daylight: "daylight",
};

/** "Not checked: …" with the reason for each, or "" when every storm rule was checked. */
export function notCheckedText(notChecked: StormFactor[], conditions: Conditions): string {
  if (notChecked.length === 0) return "";
  const items = notChecked.map((factor) => {
    const reason = conditions.reasons_unknown[factor];
    return reason ? `${FACTOR_NAMES[factor]} (${reason})` : FACTOR_NAMES[factor];
  });
  return `Not checked: ${items.join(", ")}.`;
}

/** Step 03's line on the space-weather feed, such as "Space weather: none · NASA DONKI, updated 10:42 UTC". */
export function spaceWeatherLine(feed: SpaceWeatherFeed): string {
  if (feed === "loading") return "Space weather: loading NASA DONKI…";
  if (feed === "failed") return "Space weather: NASA DONKI unavailable";
  // fetched_at is ISO 8601 UTC, so characters 11 to 16 are the hours and minutes.
  return `Space weather: ${feed.level} · NASA DONKI, updated ${feed.fetched_at.slice(11, 16)} UTC`;
}
