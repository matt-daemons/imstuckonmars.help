import { and, asc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { dataReleases, fieldDefinitions, radObservations, sourceProducts } from "../db/schema";

export type RadiationObservation = typeof radObservations.$inferSelect;

export interface RadiationSeries {
  release_id: string;
  products: Array<{
    id: string;
    lid: string;
    version: string;
    sol: number;
    source_url: string;
    utc_start: string | null;
    utc_stop: string | null;
    warnings: string[];
  }>;
  fields: Array<typeof fieldDefinitions.$inferSelect>;
  observations: RadiationObservation[];
}

export const RADIATION_PROXY =
  "Curiosity RAD at Gale crater, about 3,800 km from Jezero. Not measured at Jezero or the hypothetical base.";
export const RADIATION_LIMITATIONS = [
  "Absorbed dose rate in the detector material (silicon or tissue-equivalent plastic), not dose equivalent or crew exposure",
  "Historical archive observations aligned by UTC, not live space weather",
  "Flagged observations are withheld (null), not zero",
];
/** RAD observes in nominal 16-minute periods (8 minutes at high count rates). */
export const MAX_OBSERVATION_AGE_MS = 30 * 60 * 1000;

/**
 * Load one published, immutable radiation release. The series is small and immutable, so
 * snapshots polled every second read it from the Workers cache rather than D1.
 */
export async function loadRadiation(
  db: Database,
  release: string,
): Promise<RadiationSeries | null> {
  const key = new Request(
    `https://imstuckonmars-telemetry.invalid/radiation-v1/${encodeURIComponent(release)}`,
  );
  const cache =
    typeof caches === "undefined" ? null : await caches.open("imstuckonmars-radiation-v1");
  const cached = await cache?.match(key);
  if (cached) return (await cached.json()) as RadiationSeries;
  const products = await db
    .select(getTableColumns(sourceProducts))
    .from(sourceProducts)
    .innerJoin(dataReleases, eq(dataReleases.id, sourceProducts.release_id))
    .where(
      and(
        eq(sourceProducts.release_id, release),
        eq(sourceProducts.instrument, "rad"),
        eq(dataReleases.status, "published"),
      ),
    )
    .orderBy(asc(sourceProducts.utc_start))
    .limit(20)
    .all();
  // Unpublished or unknown releases are never cached, so publication takes effect immediately.
  if (products.length === 0) return null;
  const ids = products.map((product) => product.id);
  const [fields, observations] = await db.batch([
    db
      .select()
      .from(fieldDefinitions)
      .where(inArray(fieldDefinitions.product_id, ids))
      .orderBy(asc(fieldDefinitions.product_id), asc(fieldDefinitions.field)),
    db
      .select()
      .from(radObservations)
      .where(inArray(radObservations.product_id, ids))
      .orderBy(asc(radObservations.utc_ms))
      .limit(5000),
  ]);
  const series: RadiationSeries = {
    release_id: release,
    products: products.map((product) => ({
      id: product.id,
      lid: product.lid,
      version: product.version,
      sol: product.sol,
      source_url: product.source_url,
      utc_start: product.utc_start,
      utc_stop: product.utc_stop,
      warnings: JSON.parse(product.warnings_json) as string[],
    })),
    fields,
    observations,
  };
  if (cache)
    await cache.put(
      key,
      Response.json(series, { headers: { "Cache-Control": "public,max-age=31536000,immutable" } }),
    );
  return series;
}

/** The latest observation that started at or before `utcMs`, if it is recent enough to cover it. */
export function observationAt(observations: RadiationObservation[], utcMs: number) {
  let low = 0;
  let high = observations.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (observations[middle].utc_ms <= utcMs) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (found < 0 || utcMs - observations[found].utc_ms > MAX_OBSERVATION_AGE_MS) return null;
  return observations[found];
}

export function radiationCitation(release: string, utcMs: number) {
  const from = utcMs - 3 * 60 * 60 * 1000;
  return `/api/telemetry/radiation?from_ms=${from}&to_ms=${utcMs + 3 * 60 * 60 * 1000}`;
}

/** Radiation context for one mission instant. Never fails the snapshot that asks for it. */
export async function radiationContext(
  db: Database,
  release: string | undefined,
  utcMs: number | null,
) {
  const base = { proxy: RADIATION_PROXY, limitations: RADIATION_LIMITATIONS };
  if (!release) return { ...base, status: "not_configured" as const, observation: null };
  if (utcMs === null)
    return {
      ...base,
      status: "time_unresolved" as const,
      release_id: release,
      observation: null,
      reason:
        "The replayed MOXIE sample has no resolved UTC, so no radiation alignment is possible",
    };
  let series: RadiationSeries | null;
  try {
    series = await loadRadiation(db, release);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "radiation_unavailable", release, error: (error as Error).message }),
    );
    series = null;
  }
  if (!series)
    return {
      ...base,
      status: "release_unavailable" as const,
      release_id: release,
      observation: null,
    };
  const observation = observationAt(series.observations, utcMs);
  const product = observation && series.products.find((item) => item.id === observation.product_id);
  return {
    ...base,
    status: observation
      ? observation.flag
        ? ("observation_flagged" as const)
        : ("observation_available" as const)
      : ("sampling_gap" as const),
    release_id: release,
    mission_utc_ms: utcMs,
    observation,
    observation_age_s: observation ? (utcMs - observation.utc_ms) / 1000 : null,
    source_url: product?.source_url ?? null,
    units: "uGy/day",
    alignment:
      "Latest RAD observation starting at or before the replay's approximate MOXIE UTC, within 30 minutes",
    citation: radiationCitation(release, utcMs),
  };
}
