import { and, asc, eq, getTableColumns, gte, inArray, lt, or } from "drizzle-orm";
import { MissionError, type MoxieSample } from "../../lib/mission/types";
import type { Database } from "../db";
import {
  dataReleases,
  experimentSummaries,
  fieldDefinitions,
  MEDA_TABLES,
  moxieRuns,
  moxieSamples,
  qualityIssues,
  sourceProducts,
} from "../db/schema";

export { MEDA_TABLES } from "../db/schema";
export type Product = typeof sourceProducts.$inferSelect;
export type Run = typeof moxieRuns.$inferSelect;

export async function requireRelease(db: Database, release: string) {
  const row = await db
    .select()
    .from(dataReleases)
    .where(and(eq(dataReleases.id, release), eq(dataReleases.status, "published")))
    .get();
  if (!row)
    throw new MissionError(
      "release_unavailable",
      "The selected NASA release is not published",
      503,
    );
  return row;
}

export async function getProduct(db: Database, release: string | string[], id: string) {
  const releases = typeof release === "string" ? [release] : release;
  const product = await db
    .select(getTableColumns(sourceProducts))
    .from(sourceProducts)
    .innerJoin(dataReleases, eq(dataReleases.id, sourceProducts.release_id))
    .where(
      and(
        eq(sourceProducts.id, id),
        inArray(sourceProducts.release_id, releases),
        eq(dataReleases.status, "published"),
      ),
    )
    .get();
  if (!product)
    throw new MissionError("product_not_found", "Unknown product in the published release", 404);
  return product;
}

export async function getRun(db: Database, release: string, id: string) {
  const run = await db
    .select(getTableColumns(moxieRuns))
    .from(moxieRuns)
    .innerJoin(dataReleases, eq(dataReleases.id, moxieRuns.release_id))
    .where(
      and(
        eq(moxieRuns.id, id),
        eq(moxieRuns.release_id, release),
        eq(dataReleases.status, "published"),
      ),
    )
    .get();
  if (!run)
    throw new MissionError("run_not_found", "Unknown experiment in the published release", 404);
  return run;
}

export function experimentComparison(db: Database, release: string, limit = 100) {
  return db
    .select({
      directory_sol: moxieRuns.directory_sol,
      time_quality: moxieRuns.time_quality,
      warnings_json: moxieRuns.warnings_json,
      ...getTableColumns(experimentSummaries),
    })
    .from(experimentSummaries)
    .innerJoin(moxieRuns, eq(moxieRuns.id, experimentSummaries.run_id))
    .where(eq(moxieRuns.release_id, release))
    .orderBy(asc(moxieRuns.directory_sol))
    .limit(limit)
    .all();
}

export async function sourceQuality(db: Database, ids: string[]) {
  const [products, fields, issues] = await db.batch([
    db.select().from(sourceProducts).where(inArray(sourceProducts.id, ids)),
    db
      .select()
      .from(fieldDefinitions)
      .where(inArray(fieldDefinitions.product_id, ids))
      .orderBy(asc(fieldDefinitions.product_id), asc(fieldDefinitions.field))
      .limit(100),
    db
      .select()
      .from(qualityIssues)
      .where(inArray(qualityIssues.product_id, ids))
      .orderBy(asc(qualityIssues.start_row), asc(qualityIssues.field))
      .limit(100),
  ]);
  return { products, fields, issues };
}

/** Cache only immutable, published source traces, never session state or credentials. */
export async function loadTrace(
  db: Database,
  release: string,
  runId: string,
): Promise<MoxieSample[]> {
  const key = new Request(
    `https://ares-telemetry.invalid/trace-v1/${encodeURIComponent(release)}/${encodeURIComponent(runId)}`,
  );
  const cache = typeof caches === "undefined" ? null : await caches.open("ares-source-traces-v1");
  const cached = await cache?.match(key);
  if (cached) return (await cached.json()) as MoxieSample[];
  const samples = await db
    .select()
    .from(moxieSamples)
    .where(eq(moxieSamples.run_id, runId))
    .orderBy(asc(moxieSamples.source_row))
    .limit(21601)
    .all();
  if (cache)
    await cache.put(
      key,
      Response.json(samples, { headers: { "Cache-Control": "public,max-age=31536000,immutable" } }),
    );
  return samples;
}

export async function environmentAt(
  db: Database,
  release: string,
  sclkMs: number | null,
  directorySol: number,
) {
  if (sclkMs === null || directorySol !== 816) {
    return {
      status: "unavailable",
      reason: "No verified local environmental companion for this experiment",
      series: [],
    };
  }
  const products = await db
    .select({
      id: sourceProducts.id,
      sensor: sourceProducts.sensor,
      processing_level: sourceProducts.processing_level,
      warnings_json: sourceProducts.warnings_json,
      source_url: sourceProducts.source_url,
    })
    .from(sourceProducts)
    .where(
      and(
        eq(sourceProducts.release_id, release),
        eq(sourceProducts.instrument, "meda"),
        eq(sourceProducts.sol, 816),
        or(
          and(eq(sourceProducts.sensor, "ats"), eq(sourceProducts.processing_level, "calibrated")),
          and(
            inArray(sourceProducts.sensor, ["ps", "rhs"]),
            eq(sourceProducts.processing_level, "derived"),
          ),
        ),
      ),
    )
    .all();
  const series = await Promise.all(
    products.map(async (product) => {
      // This query selects only the three explicitly supported environmental sensors.
      const table = MEDA_TABLES[product.sensor as "ats" | "ps" | "rhs"];
      const sample = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.product_id, product.id),
            gte(table.sclk_ms, sclkMs - 500),
            lt(table.sclk_ms, sclkMs + 501),
          ),
        )
        .orderBy(asc(table.sclk_ms))
        .limit(1)
        .get();
      return {
        product_id: product.id,
        sensor: product.sensor,
        source_url: product.source_url,
        status: sample ? "sample_available" : "sampling_gap",
        sample: sample ?? null,
        warnings: JSON.parse(product.warnings_json) as string[],
        clock_alignment: "mission SCLK within 0.5 seconds; MEDA clock is approximate",
      };
    }),
  );
  return {
    status: series.some((item) => item.sample) ? "available_with_quality_limits" : "sampling_gap",
    series,
  };
}
