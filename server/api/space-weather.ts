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

// CCMC's own DONKI API, which api.nasa.gov passes through. It needs no key, so no rate limit can
// be hit, and its flare endpoint answers while api.nasa.gov's returned 404 (checked 15 Nov 2026).
const DONKI_API = "https://ccmc.gsfc.nasa.gov/DONKI-API/get";
const CACHE_SECONDS = 15 * 60;
// The Cache API keys entries by URL; this one is a name only and is never fetched.
const CACHE_KEY = "https://lara.cache/api/space-weather";
// A DONKI that does not answer must not hold the route check up.
const TIMEOUT_MS = 10_000;
const HOUR_MS = 3_600_000;

export const spaceWeather = new Hono();

/** The solar alert from NASA DONKI's last flares, particle events and storm arrivals at Mars. */
spaceWeather.get("/", async (context) => {
  const cache = await caches.open("space-weather");
  const cached = await cache.match(CACHE_KEY);
  if (cached) return context.json(await cached.json());

  const report = await readDonki(new Date());
  await cache.put(
    CACHE_KEY,
    new Response(JSON.stringify(report), {
      headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` },
    }),
  );
  return context.json(report);
});

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
