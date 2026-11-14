import { MissionError, type MoxieSample } from "../../lib/mission/types";

export interface Product {
  id: string;
  release_id: string;
  instrument: string;
  sensor: string;
  processing_level: string;
  sol: number;
  sample_count: number;
  first_sclk_ms: number | null;
  last_sclk_ms: number | null;
  source_url: string;
  label_url: string;
  warnings_json: string;
  [key: string]: unknown;
}

export interface Run {
  id: string;
  release_id: string;
  directory_sol: number;
  calibrated_product_id: string;
  derived_product_id: string | null;
  sample_count: number;
  time_quality: string;
  warnings_json: string;
}

export const MEDA_TABLES = {
  ats: "meda_ats_samples",
  ps: "meda_ps_samples",
  rhs: "meda_rhs_samples",
  tirs: "meda_tirs_samples",
  rds: "meda_rds_samples",
  eng: "meda_eng_samples",
  ancillary: "meda_ancillary_samples",
} as const;

export async function requireRelease(db: D1Database, release: string) {
  const row = await db
    .prepare("SELECT * FROM data_releases WHERE id=? AND status='published'")
    .bind(release)
    .first();
  if (!row)
    throw new MissionError(
      "release_unavailable",
      "The selected NASA release is not published",
      503,
    );
  return row;
}

export async function getProduct(db: D1Database, release: string, id: string) {
  const product = await db
    .prepare(
      "SELECT p.* FROM source_products p JOIN data_releases r ON r.id=p.release_id WHERE p.id=? AND p.release_id=? AND r.status='published'",
    )
    .bind(id, release)
    .first<Product>();
  if (!product)
    throw new MissionError("product_not_found", "Unknown product in the published release", 404);
  return product;
}

export async function getRun(db: D1Database, release: string, id: string) {
  const run = await db
    .prepare(
      "SELECT m.* FROM moxie_runs m JOIN data_releases r ON r.id=m.release_id WHERE m.id=? AND m.release_id=? AND r.status='published'",
    )
    .bind(id, release)
    .first<Run>();
  if (!run)
    throw new MissionError("run_not_found", "Unknown experiment in the published release", 404);
  return run;
}

/** Cache only immutable, published source traces, never session state or credentials. */
export async function loadTrace(
  db: D1Database,
  release: string,
  runId: string,
): Promise<MoxieSample[]> {
  const key = new Request(
    `https://ares-telemetry.invalid/trace-v1/${encodeURIComponent(release)}/${encodeURIComponent(runId)}`,
  );
  const cache = typeof caches === "undefined" ? null : await caches.open("ares-source-traces-v1");
  const cached = await cache?.match(key);
  if (cached) return cached.json<MoxieSample[]>();
  const { results } = await db
    .prepare("SELECT * FROM moxie_samples WHERE run_id=? ORDER BY source_row LIMIT 21601")
    .bind(runId)
    .all<MoxieSample>();
  if (cache)
    await cache.put(
      key,
      Response.json(results, { headers: { "Cache-Control": "public,max-age=31536000,immutable" } }),
    );
  return results;
}

export async function environmentAt(
  db: D1Database,
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
  const { results: products } = await db
    .prepare(
      "SELECT id,sensor,processing_level,warnings_json,source_url FROM source_products WHERE release_id=? AND instrument='meda' AND sol=816 AND ((sensor='ats' AND processing_level='calibrated') OR (sensor='ps' AND processing_level='derived') OR (sensor='rhs' AND processing_level='derived'))",
    )
    .bind(release)
    .all<{ id: string; sensor: "ats" | "ps" | "rhs"; warnings_json: string; source_url: string }>();
  const series = await Promise.all(
    products.map(async (product) => {
      const table = MEDA_TABLES[product.sensor];
      const sample = await db
        .prepare(
          `SELECT * FROM ${table} WHERE product_id=? AND sclk_ms>=? AND sclk_ms<? ORDER BY sclk_ms LIMIT 1`,
        )
        .bind(product.id, sclkMs - 500, sclkMs + 501)
        .first();
      return {
        product_id: product.id,
        sensor: product.sensor,
        source_url: product.source_url,
        status: sample ? "sample_available" : "sampling_gap",
        sample,
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
