import { Hono } from "hono";
import type * as zod from "zod";

import {
  DONKI_SCHEMAS,
  FLARE_WINDOW_HOURS,
  PARTICLE_EVENT_HOURS,
  SIMULATION_LOOKBACK_HOURS,
  spaceWeatherFromDonki,
  type SpaceWeatherReport,
} from "@/lib/flight-rules/donki";
import { solarAlertLevel } from "@/lib/flight-rules/solar-alert";

import { MissionError } from "../../lib/mission/types";

// CCMC's own DONKI API needs no key. Its flare endpoint answered while api.nasa.gov's
// returned 404 (checked 15 Nov 2026); keyless access does not guarantee availability.
const DONKI_API = "https://ccmc.gsfc.nasa.gov/DONKI-API/get";
const CACHE_SECONDS = 15 * 60;
// The last report DONKI gave, kept for a day to answer while DONKI does not.
const LAST_GOOD_SECONDS = 24 * 60 * 60;
// A failure is kept briefly, so later requests answer at once instead of waiting on DONKI again.
const FAILURE_SECONDS = 60;
// The Cache API keys entries by URL; these are names only and are never fetched.
const CACHE_KEY = "https://lara.cache/api/space-weather";
const LAST_GOOD_KEY = "https://lara.cache/api/space-weather/last-good";
const FAILURE_KEY = "https://lara.cache/api/space-weather/failure";
// A DONKI that does not answer must not hold the route check up.
const TIMEOUT_MS = 3_000;
const HOUR_MS = 3_600_000;

/**
 * A report as this route answers it. `stale` is set when DONKI did not answer and the report is
 * the last one it gave, still carrying its original `fetched_at`. (Kept here rather than in
 * `SpaceWeatherReport`, which lib/flight-rules owns; the field is optional, so clients that read
 * a `SpaceWeatherReport` still type-check.)
 */
export type SpaceWeatherAnswer = SpaceWeatherReport & { stale?: true };

export const spaceWeather = new Hono();

/** The solar alert from NASA DONKI's last flares, particle events and storm arrivals at Mars. */
spaceWeather.get("/", async (context) => {
  const cache = await caches.open("space-weather");
  const cached = await cache.match(CACHE_KEY);
  if (cached) return context.json(await cached.json());

  const failed = await cache.match(FAILURE_KEY);
  if (failed) {
    const { message } = (await failed.json()) as { message: string };
    return context.json(
      await lastGoodOr(cache, new MissionError("donki_unavailable", message, 503)),
    );
  }

  let report: SpaceWeatherReport;
  try {
    report = await readDonki(new Date());
  } catch (error) {
    if (!(error instanceof MissionError)) throw error;
    await cache.put(FAILURE_KEY, cachedJson({ message: error.message }, FAILURE_SECONDS));
    return context.json(await lastGoodOr(cache, error));
  }
  await cache.put(CACHE_KEY, cachedJson(report, CACHE_SECONDS));
  await cache.put(LAST_GOOD_KEY, cachedJson(report, LAST_GOOD_SECONDS));
  return context.json(report);
});

/** DONKI's last good report, marked stale, or `failure` thrown when there is none. */
async function lastGoodOr(cache: Cache, failure: MissionError): Promise<SpaceWeatherAnswer> {
  const lastGood = await cache.match(LAST_GOOD_KEY);
  if (!lastGood) throw failure;
  return { ...((await lastGood.json()) as SpaceWeatherReport), stale: true };
}

function cachedJson(body: unknown, seconds: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Cache-Control": `max-age=${seconds}` },
  });
}

async function readDonki(now: Date): Promise<SpaceWeatherReport> {
  const [flares, particleEvents, simulations] = await Promise.all([
    getDonki("FLR", DONKI_SCHEMAS.FLR, FLARE_WINDOW_HOURS, now),
    getDonki("SEP", DONKI_SCHEMAS.SEP, PARTICLE_EVENT_HOURS, now),
    getDonki(
      "WSAEnlilSimulations",
      DONKI_SCHEMAS.WSAEnlilSimulations,
      SIMULATION_LOOKBACK_HOURS,
      now,
    ),
  ]);
  const weather = spaceWeatherFromDonki({ flares, particleEvents, simulations }, now);
  return {
    level: solarAlertLevel(weather),
    weather,
    fetched_at: now.toISOString(),
    source: "NASA DONKI",
    measured_at: "Earth (GOES) / model arrival at Mars",
  };
}

/** One DONKI endpoint's entries from the last `hours`, checked against its schema. */
async function getDonki<T>(
  endpoint: keyof typeof DONKI_SCHEMAS,
  schema: zod.ZodType<T>,
  hours: number,
  now: Date,
): Promise<T> {
  // DONKI filters by whole UTC days, so the mapping trims to the exact hours afterwards.
  const since = new Date(now.getTime() - hours * HOUR_MS);
  const url = `${DONKI_API}/${endpoint}?startDate=${utcDay(since)}&endDate=${utcDay(now)}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw donkiUnavailable(`${endpoint} did not answer`);
  }
  if (!response.ok) throw donkiUnavailable(`${endpoint} answered ${response.status}`);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw donkiUnavailable(`${endpoint} answered in an unexpected shape`);
  return parsed.data;
}

function donkiUnavailable(detail: string) {
  return new MissionError("donki_unavailable", `NASA DONKI is unavailable: ${detail}`, 503);
}

/** "yyyy-MM-dd" in UTC, the date format DONKI takes. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
