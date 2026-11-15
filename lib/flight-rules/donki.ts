import * as zod from "zod";

import { flareStrength, type SolarAlertLevel, type SpaceWeather } from "./solar-alert";

/**
 * The fields LARA reads from NASA DONKI (https://ccmc.gsfc.nasa.gov/DONKI/), by endpoint; the
 * rest are dropped. DONKI gives times in UTC, such as "2026-11-14T21:27Z".
 */
export const DONKI_SCHEMAS = {
  /** Solar flares, classed by the X-ray flux GOES measures near Earth. */
  FLR: zod.array(
    zod.object({
      classType: zod.string().nullable(),
      beginTime: zod.string(),
      peakTime: zod.string().nullable(),
    }),
  ),
  /** Solar particle events: when each began, and the instrument channels that saw it. */
  SEP: zod.array(
    zod.object({
      eventTime: zod.string(),
      instruments: zod.array(zod.object({ displayName: zod.string() })),
    }),
  ),
  /** WSA-Enlil model runs: where and when each modelled solar storm arrives. */
  WSAEnlilSimulations: zod.array(
    zod.object({
      impactList: zod
        .array(zod.object({ location: zod.string(), arrivalTime: zod.string() }))
        .nullable(),
    }),
  ),
};

export interface DonkiData {
  flares: zod.infer<typeof DONKI_SCHEMAS.FLR>;
  particleEvents: zod.infer<typeof DONKI_SCHEMAS.SEP>;
  simulations: zod.infer<typeof DONKI_SCHEMAS.WSAEnlilSimulations>;
}

/** What GET /api/space-weather answers. */
export interface SpaceWeatherReport {
  level: SolarAlertLevel;
  weather: SpaceWeather;
  /** When the server read DONKI, as an ISO 8601 UTC time. */
  fetched_at: string;
  source: "NASA DONKI";
  measured_at: "Earth (GOES) / model arrival at Mars";
}

/** solarAlertLevel reads the strongest flare of the last 24 hours. */
export const FLARE_WINDOW_HOURS = 24;

/**
 * DONKI gives when a particle event began, not when it ended. Our assumption: an event counts as
 * under way for 48 hours after it began, erring long rather than short.
 */
export const PARTICLE_EVENT_HOURS = 48;

/** A solar storm takes days to reach Mars, so a model run from up to a week ago can still be due. */
export const SIMULATION_LOOKBACK_HOURS = 7 * 24;

const HOUR_MS = 3_600_000;

// An energy channel in an instrument's name: ">10 MeV", or a band such as "15.8-39.8 MeV".
const ENERGY_CHANNEL = /(?:>\s*)?(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*MeV/i;

/** The lowest particle energy in MeV an instrument channel counts, or null when its name gives none. */
export function particleEnergyMev(displayName: string): number | null {
  const match = ENERGY_CHANNEL.exec(displayName);
  return match ? Number(match[1]) : null;
}

/** The space weather DONKI reports at a moment, ready for solarAlertLevel. */
export function spaceWeatherFromDonki(data: DonkiData, now: Date): SpaceWeather {
  const recentFlareClasses = data.flares
    .filter((flare) => isInLast(FLARE_WINDOW_HOURS, flare.peakTime ?? flare.beginTime, now))
    .map((flare) => flare.classType)
    .filter((flareClass) => flareClass !== null);
  const strongestFlare = recentFlareClasses.reduce<string | null>(
    (strongest, flareClass) =>
      strongest === null || flareStrength(flareClass) > flareStrength(strongest)
        ? flareClass
        : strongest,
    null,
  );

  const particleEnergies = data.particleEvents
    .filter((event) => isInLast(PARTICLE_EVENT_HOURS, event.eventTime, now))
    .map(eventEnergyMev);

  const hoursToMarsArrivals = data.simulations
    .flatMap((simulation) => simulation.impactList ?? [])
    .filter((impact) => impact.location === "Mars")
    .map((impact) => hoursUntil(impact.arrivalTime, now));
  // Runs disagree on arrival times; the one nearest now is the one that can raise the alert.
  const nearestArrival = hoursToMarsArrivals.reduce<number | null>(
    (nearest, hours) => (nearest === null || Math.abs(hours) < Math.abs(nearest) ? hours : nearest),
    null,
  );

  return {
    strongest_flare_24h: strongestFlare,
    particle_event_above_10_mev: particleEnergies.some((energy) => energy >= 10),
    particle_event_above_100_mev: particleEnergies.some((energy) => energy >= 100),
    hours_until_storm_reaches_mars: nearestArrival,
  };
}

/** The energy in MeV a particle event is known to exceed: the highest channel that saw it. */
function eventEnergyMev(event: DonkiData["particleEvents"][number]): number {
  const energies = event.instruments
    .map((instrument) => particleEnergyMev(instrument.displayName))
    .filter((energy) => energy !== null);
  // No channel names an energy: count it as above 10 MeV to stay safe, never as above 100 MeV.
  return energies.length > 0 ? Math.max(...energies) : 10;
}

/** Hours from now until a DONKI time; negative once it has passed. */
function hoursUntil(time: string, now: Date): number {
  return (Date.parse(time) - now.getTime()) / HOUR_MS;
}

/** True when a DONKI time lies within the last `hours` before now. */
function isInLast(hours: number, time: string, now: Date): boolean {
  const age = -hoursUntil(time, now);
  return age >= 0 && age <= hours;
}
