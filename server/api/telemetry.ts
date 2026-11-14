import { Hono } from "hono";
import { MissionError } from "../../lib/mission/types";
import { integer, number } from "../../lib/mission/validation";
import { getProduct, getRun, MEDA_TABLES, requireRelease } from "../telemetry/repository";
import { database, type ApiBindings } from "./bindings";

export const telemetry = new Hono<{ Bindings: ApiBindings }>();

function queryInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  return value === undefined ? fallback : integer(Number(value), name, 0, max);
}

telemetry.get("/releases", async (c) => {
  const { results } = await database(c.env)
    .prepare(
      "SELECT * FROM data_releases WHERE status='published' ORDER BY created_at DESC LIMIT 20",
    )
    .all();
  return c.json({ releases: results, selected_release: c.env.TELEMETRY_RELEASE });
});

telemetry.get("/products", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  const { results } = await db
    .prepare(
      "SELECT * FROM source_products WHERE release_id=? ORDER BY instrument,sol,sensor,processing_level LIMIT 200",
    )
    .bind(release)
    .all();
  return c.json({
    release_id: release,
    products: results,
    availability: {
      weather: "historical sol 816 only",
      wind: "not_acquired",
      radiation_exposure: "unsupported",
      rems: "not_in_release",
    },
  });
});

telemetry.get("/products/:id/quality", async (c) => {
  const db = database(c.env);
  const product = await getProduct(db, c.env.TELEMETRY_RELEASE ?? "nasa-v1", c.req.param("id"));
  const afterRow = queryInteger(c.req.query("after_row"), "after_row", 0);
  const [fields, issues] = await db.batch([
    db
      .prepare("SELECT * FROM field_definitions WHERE product_id=? ORDER BY field")
      .bind(product.id),
    db
      .prepare(
        "SELECT * FROM quality_issues WHERE product_id=? AND end_row>=? ORDER BY start_row,field LIMIT 500",
      )
      .bind(product.id, afterRow),
  ]);
  return c.json({
    product,
    fields: fields.results,
    issues: issues.results,
    issues_truncated: issues.results.length === 500,
    note: "Missing flags are unknown; finite values and zero issue counts do not establish scientific validity",
  });
});

telemetry.get("/environment", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  let productId = c.req.query("product_id");
  if (!productId) {
    const sensor = c.req.query("sensor") ?? "ats";
    if (!Object.hasOwn(MEDA_TABLES, sensor))
      throw new MissionError("invalid_sensor", "Unknown MEDA sensor", 400);
    const level = ["ps", "rhs", "ancillary"].includes(sensor) ? "derived" : "calibrated";
    const product = await db
      .prepare(
        "SELECT p.id FROM source_products p JOIN data_releases r ON r.id=p.release_id WHERE p.release_id=? AND p.sensor=? AND p.instrument='meda' AND p.sol=816 AND p.processing_level=? AND r.status='published'",
      )
      .bind(release, sensor, level)
      .first<{ id: string }>();
    if (!product)
      throw new MissionError(
        "source_unavailable",
        "Preferred environmental product is unavailable; no automatic calibrated fallback",
        503,
      );
    productId = product.id;
  }
  const product = await getProduct(db, release, productId);
  if (product.instrument !== "meda" || !Object.hasOwn(MEDA_TABLES, product.sensor))
    throw new MissionError("invalid_product", "Select a MEDA environmental product", 400);
  const table = MEDA_TABLES[product.sensor as keyof typeof MEDA_TABLES];
  const { results: definitions } = await db
    .prepare(
      "SELECT field,unit,description,provenance,rules_json FROM field_definitions WHERE product_id=? ORDER BY field",
    )
    .bind(product.id)
    .all<{
      field: string;
      unit: string | null;
      description: string;
      provenance: string;
      rules_json: string;
    }>();
  const requested =
    c.req.query("fields")?.split(",") ?? definitions.slice(0, 8).map((field) => field.field);
  if (
    requested.length === 0 ||
    requested.length > 8 ||
    requested.some(
      (name) =>
        !/^[a-z][a-z0-9_]*$/.test(name) || !definitions.some((field) => field.field === name),
    )
  ) {
    throw new MissionError("invalid_fields", "Select one to eight known fields", 400);
  }
  const from = queryInteger(c.req.query("from_ms"), "from_ms", product.first_sclk_ms ?? 0);
  const to = queryInteger(c.req.query("to_ms"), "to_ms", from + 600000);
  number(to - from, "time window in milliseconds", 1, 3600000);
  const limit = queryInteger(c.req.query("limit"), "limit", 1000, 5000);
  if (limit === 0) throw new MissionError("invalid_limit", "Limit must be positive", 400);
  const after = queryInteger(c.req.query("after_row"), "after_row", 0);
  if (c.req.query("resolution") === "60s") {
    if (requested.length !== 1)
      throw new MissionError("invalid_fields", "Rollups require exactly one field", 400);
    const { results } = await db
      .prepare(
        "SELECT * FROM metric_rollups WHERE product_id=? AND field=? AND bucket_sclk_ms>=? AND bucket_sclk_ms<? ORDER BY bucket_sclk_ms LIMIT ?",
      )
      .bind(product.id, requested[0], from, to, limit)
      .all();
    return c.json({
      product,
      fields: definitions.filter((field) => requested.includes(field.field)),
      resolution: "60s",
      samples: results,
      note: "Counts describe acquired usable samples; never integrate chart averages across gaps",
    });
  }
  const { results } = await db
    .prepare(
      `SELECT source_row,sclk_ms,utc_ms,lmst,ltst,${requested.join(",")} FROM ${table} WHERE product_id=? AND sclk_ms>=? AND sclk_ms<? AND source_row>? ORDER BY sclk_ms,source_row LIMIT ?`,
    )
    .bind(product.id, from, to, after, limit)
    .all<Record<string, number | string | null>>();
  const first = results[0]?.source_row ?? after;
  const last = results[results.length - 1]?.source_row ?? after;
  const { results: issues } = await db
    .prepare(
      "SELECT * FROM quality_issues WHERE product_id=? AND start_row<=? AND end_row>=? ORDER BY start_row,field LIMIT 500",
    )
    .bind(product.id, last, first)
    .all();
  return c.json({
    product,
    fields: definitions.filter((field) => requested.includes(field.field)),
    samples: results,
    quality_issues: issues,
    next_after_row: results.length === limit ? last : null,
    clock:
      "SCLK milliseconds; UTC is an approximate label-anchor derivative, not a new measurement",
    geometry:
      product.sensor === "ancillary"
        ? "M2020_TOPO meters relative to landing; not latitude/longitude"
        : undefined,
  });
});

telemetry.get("/moxie/runs", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  const { results } = await db
    .prepare("SELECT * FROM moxie_runs WHERE release_id=? ORDER BY directory_sol LIMIT 100")
    .bind(release)
    .all();
  return c.json({ release_id: release, runs: results });
});

telemetry.get("/moxie/comparison", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  const { results } = await db
    .prepare(
      "SELECT m.directory_sol,m.time_quality,m.warnings_json,s.* FROM experiment_summaries s JOIN moxie_runs m ON m.id=s.run_id WHERE m.release_id=? ORDER BY m.directory_sol LIMIT 100",
    )
    .bind(release)
    .all();
  return c.json({
    release_id: release,
    experiments: results,
    provenance: "ARES mathematical summaries of NASA archived telemetry",
    warnings: [
      "Whole-run energy includes warmup and diagnostics",
      "Zero production differs from missing derived output",
      "Oxygen rate is current-derived, not independently measured flow or purity",
    ],
  });
});

telemetry.get("/moxie/runs/:id/samples", async (c) => {
  const db = database(c.env);
  const run = await getRun(db, c.env.TELEMETRY_RELEASE ?? "nasa-v1", c.req.param("id"));
  const after = queryInteger(c.req.query("after_row"), "after_row", 0);
  const limit = queryInteger(c.req.query("limit"), "limit", 1000, 5000);
  if (limit === 0) throw new MissionError("invalid_limit", "Limit must be positive", 400);
  const { results } = await db
    .prepare(
      "SELECT * FROM moxie_samples WHERE run_id=? AND source_row>? ORDER BY source_row LIMIT ?",
    )
    .bind(run.id, after, limit)
    .all<{ source_row: number }>();
  const { results: fields } = await db
    .prepare("SELECT * FROM field_definitions WHERE product_id IN (?,?) ORDER BY product_id,field")
    .bind(run.calibrated_product_id, run.derived_product_id)
    .all();
  return c.json({
    run,
    fields,
    samples: results,
    next_after_row: results.length === limit ? results[results.length - 1].source_row : null,
  });
});
