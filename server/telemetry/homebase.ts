import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../db";
import { MEDA_TABLES, metricRollups, moxieRuns, sourceProducts } from "../db/schema";
import { experimentComparison, requireRelease } from "./repository";
import { loadRadiation, observationAt } from "./radiation";
import { MissionError } from "../../lib/mission/types";
import type {
  HomebaseData,
  HomebaseMetric,
  MetricId,
  ObservationPoint,
} from "../../lib/homebase/types";

export const HOMEBASE_FIELDS = [
  {
    id: "temperature",
    sensor: "ats",
    level: "calibrated",
    field: "ats_local_temp1",
    title: "Air temperature",
    unit: "K",
    decimals: 1,
  },
  {
    id: "pressure",
    sensor: "ps",
    level: "derived",
    field: "pressure",
    title: "Atmospheric pressure",
    unit: "Pa",
    decimals: 1,
  },
  {
    id: "water_vapor",
    sensor: "rhs",
    level: "derived",
    field: "volume_mixing_ratio",
    title: "Water vapor",
    unit: "ppm",
    decimals: 1,
  },
] as const;

/** Pick only from actual acquired days with all three preferred environmental products. */
export function availableDays(
  products: Array<{ sensor: string; processing_level: string; sol: number; sample_count: number }>,
) {
  return [...new Set(products.map((p) => p.sol))]
    .filter((sol) =>
      HOMEBASE_FIELDS.every((s) =>
        products.some(
          (p) =>
            p.sol === sol &&
            p.sensor === s.sensor &&
            p.processing_level === s.level &&
            p.sample_count > 0,
        ),
      ),
    )
    .sort((a, b) => a - b);
}

export function metricRange(points: ObservationPoint[]) {
  const valid = points.flatMap((p) =>
    p.value !== null && Number.isFinite(p.value) ? [p.value] : [],
  );
  return {
    minimum: valid.length ? Math.min(...valid) : null,
    maximum: valid.length ? Math.max(...valid) : null,
  };
}

/** Read-only archive view. Does not create a mission, run a simulation, or write to D1. */
export async function homebaseDashboard(
  db: Database,
  release: string,
  radiationRelease?: string,
): Promise<HomebaseData> {
  await requireRelease(db, release);
  const products = await db
    .select()
    .from(sourceProducts)
    .where(
      and(
        eq(sourceProducts.release_id, release),
        eq(sourceProducts.instrument, "meda"),
        gt(sourceProducts.sample_count, 0),
      ),
    )
    .all();
  const days = availableDays(products);
  if (!days.length)
    throw new MissionError(
      "environment_unavailable",
      "This release has no acquired day with temperature, pressure and humidity. Select a published environmental release",
      503,
    );
  const sol = days[Math.floor(Math.random() * days.length)];
  const chosen = HOMEBASE_FIELDS.map((s) =>
    products.find((p) => p.sol === sol && p.sensor === s.sensor && p.processing_level === s.level)!,
  );
  const [buckets, anchor, experiments, runs, oxygenProducts] = await Promise.all([
    db
      .select()
      .from(metricRollups)
      .where(
        and(
          inArray(
            metricRollups.product_id,
            chosen.map((p) => p.id),
          ),
          inArray(
            metricRollups.field,
            HOMEBASE_FIELDS.map((s) => s.field),
          ),
        ),
      )
      .orderBy(asc(metricRollups.bucket_sclk_ms))
      .limit(6000)
      .all(),
    db
      .select({ sclk_ms: MEDA_TABLES.ats.sclk_ms, utc_ms: MEDA_TABLES.ats.utc_ms })
      .from(MEDA_TABLES.ats)
      .where(and(eq(MEDA_TABLES.ats.product_id, chosen[0].id), isNotNull(MEDA_TABLES.ats.utc_ms)))
      .orderBy(asc(MEDA_TABLES.ats.sclk_ms))
      .get(),
    experimentComparison(db, release),
    db
      .select({
        id: moxieRuns.id,
        calibrated: moxieRuns.calibrated_product_id,
        derived: moxieRuns.derived_product_id,
      })
      .from(moxieRuns)
      .where(eq(moxieRuns.release_id, release))
      .all(),
    db
      .select({ id: sourceProducts.id, url: sourceProducts.source_url })
      .from(sourceProducts)
      .where(and(eq(sourceProducts.release_id, release), eq(sourceProducts.instrument, "moxie")))
      .all(),
  ]);
  if (!anchor?.utc_ms || buckets.length === 6000)
    throw new MissionError(
      "environment_unavailable",
      "The selected day has unresolved timing or exceeds the bounded dashboard window",
      503,
    );
  const rows = HOMEBASE_FIELDS.map((s, i) =>
    buckets.filter((b) => b.product_id === chosen[i].id && b.field === s.field && b.count > 0),
  );
  const otherTimes = rows
    .slice(1)
    .map((series) => new Set(series.filter((b) => b.mean !== null).map((b) => b.bucket_sclk_ms)));
  const common = rows[0].filter(
    (b) => b.mean !== null && otherTimes.every((times) => times.has(b.bucket_sclk_ms)),
  );
  const latest = common[common.length - 1];
  if (!latest)
    throw new MissionError(
      "environment_unavailable",
      "No common valid observation window exists for this archived day",
      503,
    );
  const utc = (sclk: number) => anchor.utc_ms! + sclk - anchor.sclk_ms;
  const at = utc(latest.bucket_sclk_ms);
  const metrics: HomebaseMetric[] = HOMEBASE_FIELDS.map((spec, i) => {
    const points = rows[i]
      .filter((b) => b.bucket_sclk_ms <= latest.bucket_sclk_ms)
      .map((b) => ({ utc_ms: utc(b.bucket_sclk_ms), value: b.mean, count: b.count }));
    const current = points.find((p) => p.utc_ms === at)!;
    return {
      id: spec.id as MetricId,
      title: spec.title,
      unit: spec.unit,
      decimals: spec.decimals,
      value: current.value,
      observed_utc_ms: at,
      status: current.value === null ? "unavailable" : "available",
      ...metricRange(points),
      cadence_s: 60,
      points,
      source: {
        instrument: "MEDA",
        site: "Jezero crater",
        url: chosen[i].source_url,
        product_id: chosen[i].id,
      },
      note:
        spec.id === "water_vapor"
          ? "Water-vapor mixing ratio, not percent relative humidity. Historical Jezero reference data, not a measurement at the homebase."
          : "60-second means of archived Jezero measurements. Historical reference data, not a measurement at the homebase.",
    };
  });
  const from = Math.min(...metrics.flatMap((m) => m.points.map((p) => p.utc_ms)));
  const radiation = radiationRelease
    ? await loadRadiation(db, radiationRelease).catch(() => null)
    : null;
  const current = radiation ? observationAt(radiation.observations, at) : null;
  const radPoints = (radiation?.observations ?? [])
    .filter((p) => p.utc_ms >= from - 1800000 && p.utc_ms <= at)
    .map((p) => ({
      utc_ms: p.utc_ms,
      value: p.dose_rate_e_ugy_day === null ? null : p.dose_rate_e_ugy_day / 24,
      count: p.flag ? 0 : 1,
    }));
  metrics.push({
    id: "radiation",
    title: "Radiation proxy",
    unit: "µGy/h",
    decimals: 2,
    value: current?.dose_rate_e_ugy_day == null ? null : current.dose_rate_e_ugy_day / 24,
    observed_utc_ms: current?.utc_ms ?? null,
    status: current?.flag
      ? "flagged"
      : current?.dose_rate_e_ugy_day != null
        ? "available"
        : "unavailable",
    ...metricRange(radPoints),
    cadence_s: 1800,
    points: radPoints,
    source: {
      instrument: "RAD",
      site: "Gale crater",
      url: radiation?.products.find((p) => p.id === current?.product_id)?.source_url ?? null,
      product_id: current?.product_id ?? null,
    },
    note: "Curiosity detector E absorbed dose rate, converted from µGy/day. A distant Gale crater proxy, not local radiation or crew exposure. Flagged observations are withheld.",
  });
  return {
    release_id: release,
    demo_today: {
      sol,
      date: new Date(at).toISOString().slice(0, 10),
      utc_ms: at,
      eligible_sols: days,
    },
    coverage: {
      from_utc_ms: from,
      to_utc_ms: at,
      description:
        "Available archived observations, not continuous full-day weather. Approximate UTC from the MEDA label clock anchor.",
    },
    metrics,
    experiments: experiments.map((e) => {
      const run = runs.find((r) => r.id === e.run_id);
      return {
        id: e.run_id,
        sol: e.directory_sol,
        oxygen_g: e.oxygen_g,
        peak_rate_g_h: e.peak_oxygen_g_h,
        active_mean_g_h: e.active_mean_oxygen_g_h,
        active_seconds: e.active_seconds,
        energy_wh: e.archive_energy_wh,
        warnings: JSON.parse(e.warnings_json) as string[],
        source_url:
          oxygenProducts.find((p) => p.id === (run?.derived ?? run?.calibrated))?.url ?? null,
      };
    }),
    limitations: [
      "Demo today is an archived observation day, not live Mars weather.",
      "Weather is from Jezero; radiation is from Gale. Neither is relocated to the map's homebase.",
      "Wind, dust and forecasts are not acquired. Missing values are not zero.",
      "Oxygen experiment output is current-derived engineering telemetry, not crew inventory or verified purity.",
    ],
  };
}
