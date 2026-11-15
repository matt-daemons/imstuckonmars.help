import { readMarsClock, type SurfaceLocation } from "@/lib/mars-time/mars-clock";

/** Sols count from Perseverance's landing, so they match the sol numbers in MEDA file names. */
export const PERSEVERANCE_LANDING_UTC = new Date("2021-02-18T20:55:00Z");

/** Perseverance's landing site in Jezero crater, where the MEDA weather proxy was measured. */
export const JEZERO_MEDA_SITE: SurfaceLocation = {
  longitude_east_degrees: 77.4509,
  latitude_north_degrees: 18.4446,
};

const EARTH_MILLISECONDS_PER_MARS_HOUR = 1.0274912517 * 3_600_000;
const DEGREES_OF_LONGITUDE_PER_MARS_HOUR = 15;
const MARS_HOURS_PER_SOL = 24;

export type LocalTime = { sol: number; lmst: string; ltst: string };

/** The sol and local clock times at a site on Mars at one UTC moment. */
export function localTimeAt(utc: Date, site: SurfaceLocation): LocalTime {
  const { sol, lmst, ltst } = readMarsClock(utc, site, PERSEVERANCE_LANDING_UTC);
  return { sol, lmst, ltst };
}

/** How many Mars hours `site` is ahead of `reference`, between -12 and 12. */
function marsHoursAhead(site: SurfaceLocation, reference: SurfaceLocation): number {
  const hours =
    (site.longitude_east_degrees - reference.longitude_east_degrees) /
    DEGREES_OF_LONGITUDE_PER_MARS_HOUR;
  const wrapped = ((hours % MARS_HOURS_PER_SOL) + MARS_HOURS_PER_SOL) % MARS_HOURS_PER_SOL;
  return wrapped > MARS_HOURS_PER_SOL / 2 ? wrapped - MARS_HOURS_PER_SOL : wrapped;
}

/**
 * The UTC moment, nearest to `utc`, when the proxy site's local clock reads what the base's
 * clock reads at `utc`. Use it to look up proxy weather at the base's time of day.
 */
export function proxyUtcAtSameLocalTime(
  utc: Date,
  base: SurfaceLocation,
  proxy: SurfaceLocation,
): Date {
  return new Date(utc.getTime() + marsHoursAhead(base, proxy) * EARTH_MILLISECONDS_PER_MARS_HOUR);
}
