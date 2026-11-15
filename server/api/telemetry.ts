import { Hono } from "hono";
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, lt, lte } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { MissionError } from "../../lib/mission/types";
import { integer, number } from "../../lib/mission/validation";
import {
  experimentComparison,
  getProduct,
  getRun,
  MEDA_TABLES,
  requireRelease,
} from "../telemetry/repository";
import {
  dataReleases,
  fieldDefinitions,
  metricRollups,
  moxieRuns,
  moxieSamples,
  qualityIssues,
  sourceProducts,
} from "../db/schema";
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
  const releases = await database(c.env)
    .select()
    .from(dataReleases)
    .where(eq(dataReleases.status, "published"))
    .orderBy(desc(dataReleases.created_at))
    .limit(20)
    .all();
  return c.json({ releases, selected_release: c.env.TELEMETRY_RELEASE });
});

telemetry.get("/products", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  const products = await db
    .select()
    .from(sourceProducts)
    .where(eq(sourceProducts.release_id, release))
    .orderBy(
      asc(sourceProducts.instrument),
      asc(sourceProducts.sol),
      asc(sourceProducts.sensor),
      asc(sourceProducts.processing_level),
    )
    .limit(200)
    .all();
  return c.json({
    release_id: release,
    products,
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
      .select()
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.product_id, product.id))
      .orderBy(asc(fieldDefinitions.field)),
    db
      .select()
      .from(qualityIssues)
      .where(and(eq(qualityIssues.product_id, product.id), gte(qualityIssues.end_row, afterRow)))
      .orderBy(asc(qualityIssues.start_row), asc(qualityIssues.field))
      .limit(500),
  ]);
  return c.json({
    product,
    fields,
    issues,
    issues_truncated: issues.length === 500,
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
      .select({ id: sourceProducts.id })
      .from(sourceProducts)
      .innerJoin(dataReleases, eq(dataReleases.id, sourceProducts.release_id))
      .where(
        and(
          eq(sourceProducts.release_id, release),
          eq(sourceProducts.sensor, sensor),
          eq(sourceProducts.instrument, "meda"),
          eq(sourceProducts.sol, 816),
          eq(sourceProducts.processing_level, level),
          eq(dataReleases.status, "published"),
        ),
      )
      .get();
    if (!product)
      throw new MissionError(
        "source_unavailable",
        "Preferred environmental product is unavailable; no automatic calibrated fallback",
        503,
      );
    productId = product.id;
  }
  const product = await getProduct(db, release, productId);
  if (product.instrument !== "meda" || !Object.hasOwn(MEDA_TABLES, product.sensor)) {
    throw new MissionError("invalid_product", "Select a MEDA environmental product", 400);
  }
  const table = MEDA_TABLES[product.sensor as keyof typeof MEDA_TABLES];
  const columns: Record<string, AnySQLiteColumn> = getTableColumns(table);
  const definitions = await db
    .select({
      field: fieldDefinitions.field,
      unit: fieldDefinitions.unit,
      description: fieldDefinitions.description,
      provenance: fieldDefinitions.provenance,
      rules_json: fieldDefinitions.rules_json,
    })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.product_id, product.id))
    .orderBy(asc(fieldDefinitions.field))
    .all();
  const requested =
    c.req.query("fields")?.split(",") ?? definitions.slice(0, 8).map((field) => field.field);
  if (
    requested.length === 0 ||
    requested.length > 8 ||
    requested.some(
      (name) => !Object.hasOwn(columns, name) || !definitions.some((field) => field.field === name),
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
  const fields = definitions.filter((field) => requested.includes(field.field));
  if (c.req.query("resolution") === "60s") {
    if (requested.length !== 1)
      throw new MissionError("invalid_fields", "Rollups require exactly one field", 400);
    const samples = await db
      .select()
      .from(metricRollups)
      .where(
        and(
          eq(metricRollups.product_id, product.id),
          eq(metricRollups.field, requested[0]),
          gte(metricRollups.bucket_sclk_ms, from),
          lt(metricRollups.bucket_sclk_ms, to),
        ),
      )
      .orderBy(asc(metricRollups.bucket_sclk_ms))
      .limit(limit)
      .all();
    return c.json({
      product,
      fields,
      resolution: "60s",
      samples,
      note: "Counts describe acquired usable samples; never integrate chart averages across gaps",
    });
  }
  // Only schema-owned columns can enter a projection. Client strings never become SQL identifiers.
  const selectedMetrics = Object.fromEntries(requested.map((name) => [name, columns[name]]));
  const samples = await db
    .select({
      source_row: table.source_row,
      sclk_ms: table.sclk_ms,
      utc_ms: table.utc_ms,
      lmst: table.lmst,
      ltst: table.ltst,
      ...selectedMetrics,
    })
    .from(table)
    .where(
      and(
        eq(table.product_id, product.id),
        gte(table.sclk_ms, from),
        lt(table.sclk_ms, to),
        gt(table.source_row, after),
      ),
    )
    .orderBy(asc(table.sclk_ms), asc(table.source_row))
    .limit(limit)
    .all();
  const first = samples[0]?.source_row ?? after;
  const last = samples[samples.length - 1]?.source_row ?? after;
  const issues = await db
    .select()
    .from(qualityIssues)
    .where(
      and(
        eq(qualityIssues.product_id, product.id),
        lte(qualityIssues.start_row, last),
        gte(qualityIssues.end_row, first),
      ),
    )
    .orderBy(asc(qualityIssues.start_row), asc(qualityIssues.field))
    .limit(500)
    .all();
  return c.json({
    product,
    fields,
    samples,
    quality_issues: issues,
    next_after_row: samples.length === limit ? last : null,
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
  const runs = await db
    .select()
    .from(moxieRuns)
    .where(eq(moxieRuns.release_id, release))
    .orderBy(asc(moxieRuns.directory_sol))
    .limit(100)
    .all();
  return c.json({ release_id: release, runs });
});

telemetry.get("/moxie/comparison", async (c) => {
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  const experiments = await experimentComparison(db, release);
  return c.json({
    release_id: release,
    experiments,
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
  const samples = await db
    .select()
    .from(moxieSamples)
    .where(and(eq(moxieSamples.run_id, run.id), gt(moxieSamples.source_row, after)))
    .orderBy(asc(moxieSamples.source_row))
    .limit(limit)
    .all();
  const ids = [
    run.calibrated_product_id,
    ...(run.derived_product_id ? [run.derived_product_id] : []),
  ];
  const fields = await db
    .select()
    .from(fieldDefinitions)
    .where(inArray(fieldDefinitions.product_id, ids))
    .orderBy(asc(fieldDefinitions.product_id), asc(fieldDefinitions.field))
    .all();
  return c.json({
    run,
    fields,
    samples,
    next_after_row: samples.length === limit ? samples[samples.length - 1].source_row : null,
  });
});
