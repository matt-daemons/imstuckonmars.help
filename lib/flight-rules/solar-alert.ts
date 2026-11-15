import { FLIGHT_RULES } from "./rules";

export const SOLAR_ALERT_LEVELS = ["none", "watch", "warning"] as const;

export type SolarAlertLevel = (typeof SOLAR_ALERT_LEVELS)[number];

/** Space weather as NASA DONKI reports it. These levels are measured at Earth, not at Mars. */
export type SpaceWeather = {
  /** Strongest flare of the last 24 hours as a class such as "M5.2", or null for none. */
  strongest_flare_24h: string | null;
  /** True while a solar particle event above 10 MeV is under way. */
  particle_event_above_10_mev: boolean;
  /** True while a solar particle event above 100 MeV is under way. */
  particle_event_above_100_mev: boolean;
  /** Hours until a solar storm is predicted to reach Mars. Negative once it has arrived. */
  hours_until_storm_reaches_mars: number | null;
};

/** How many times stronger a flare of each letter is than an A flare. */
const FLARE_LETTER_STRENGTH: Record<string, number> = {
  A: 1,
  B: 10,
  C: 100,
  M: 1_000,
  X: 10_000,
};

/** A flare class is one letter then a number, such as "M5.2". */
const FLARE_CLASS_PATTERN = /^([ABCMX])(\d+(\.\d+)?)$/;

/** Turns a flare class into a single number, so that two flares can be compared. */
export function flareStrength(flareClass: string): number {
  const match = FLARE_CLASS_PATTERN.exec(flareClass.trim().toUpperCase());
  if (!match) {
    throw new Error(`Cannot read flare class "${flareClass}". Expected a value like "M5.2".`);
  }
  const [, letter, number] = match;
  return Number(number) * FLARE_LETTER_STRENGTH[letter];
}

export function solarAlertLevel(weather: SpaceWeather): SolarAlertLevel {
  if (weather.particle_event_above_100_mev) {
    return "warning";
  }

  const rule = FLIGHT_RULES.radiation;
  const hadStrongFlare =
    weather.strongest_flare_24h !== null &&
    flareStrength(weather.strongest_flare_24h) >= flareStrength(rule.watch_flare_class);
  const stormIsNearMars =
    weather.hours_until_storm_reaches_mars !== null &&
    Math.abs(weather.hours_until_storm_reaches_mars) <= rule.storm_arrival_window_hours;

  if (hadStrongFlare || weather.particle_event_above_10_mev || stormIsNearMars) {
    return "watch";
  }
  return "none";
}
