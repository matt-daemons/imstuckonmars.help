import { evaluateMission } from "../mission/engine";
import type { MissionConfig, MoxieSample, ScenarioEvent } from "../mission/types";

/** Trailing window of ingested samples that sets the projected production rate. */
export const TREND_WINDOW_S = 600;

export type Confidence = "high" | "medium" | "low";

export interface ResourceProjection {
  unit: "g" | "Wh";
  reserve: number;
  now: number;
  projected: { low: number; nominal: number; high: number };
  first_reserve_crossing_s: number | null;
}

export interface Projection {
  method: string;
  now_s: number;
  target_s: number;
  horizon_s: number;
  confidence: Confidence;
  confidence_rule: string;
  trend: {
    window_s: number;
    samples: number;
    oxygen_rate_g_h: { mean: number; std: number } | null;
    total_power_w: number | null;
  };
  activity_at_target: string;
  oxygen: Record<"base" | "eva", ResourceProjection>;
  battery: Record<"base" | "eva", ResourceProjection>;
  reasons_at_target: string[];
  status: "ok" | "source_unavailable";
}

function trend(samples: MoxieSample[], nowIndex: number) {
  const window = samples
    .slice(Math.max(0, nowIndex - TREND_WINDOW_S), nowIndex)
    .filter((s) => s.oxygen_rate_g_h !== null && s.total_power_w !== null);
  if (window.length === 0) return null;
  const rates = window.map((s) => s.oxygen_rate_g_h as number);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const std = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length);
  const power = window.reduce((a, s) => a + (s.total_power_w as number), 0) / window.length;
  return { samples: window.length, mean, std, power };
}

/** Archived rows up to `nowIndex`, then synthetic rows that repeat the trailing trend. */
function withSyntheticFuture(
  config: MissionConfig,
  samples: MoxieSample[],
  nowIndex: number,
  rate: number,
  power: number,
): MoxieSample[] {
  const first = samples[0];
  const length = Math.ceil(config.duration_s);
  const out = samples.slice(0, nowIndex);
  for (let i = nowIndex; i < length; i++) {
    out.push({
      source_row: config.source_start_row + i,
      segment_id: first.segment_id,
      elapsed_ms: first.elapsed_ms + i * 1000,
      sclk_ms: null,
      utc_ms: null,
      oxygen_rate_g_h: rate,
      total_power_w: power,
    });
  }
  return out;
}

/**
 * Projects modeled inventories from `nowS` to `nowS + horizonS` using only data already
 * ingested: archived rows before `nowS`, events that have already happened, and the
 * trailing production trend in place of rows that have not arrived yet.
 */
export function projectResources(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  nowS: number,
  horizonS: number,
): Projection {
  const nowIndex = Math.min(Math.floor(nowS), samples.length);
  const target = Math.min(config.duration_s, nowS + Math.max(0, horizonS));
  const pastEvents = events.filter((event) => event.at_s <= nowS);
  const t = trend(samples, nowIndex);
  const nominalRate = t?.mean ?? 0;
  const std = t?.std ?? 0;
  const power = t?.power ?? 0;
  const run = (rate: number) =>
    evaluateMission(
      config,
      withSyntheticFuture(config, samples, nowIndex, rate, power),
      pastEvents,
      target,
    );
  const current = evaluateMission(config, samples, pastEvents, nowS);
  const nominal = run(nominalRate);
  const low = run(Math.max(0, nominalRate - std));
  const high = run(nominalRate + std);

  const windowS = t?.samples ?? 0;
  const horizon = target - nowS;
  const cv = nominalRate > 0 ? std / nominalRate : 0;
  const confidence: Confidence =
    windowS > 0 && horizon <= windowS && cv < 0.1
      ? "high"
      : windowS > 0 && horizon <= 4 * windowS
        ? "medium"
        : "low";

  const resource = (kind: "oxygen" | "battery", location: "base" | "eva"): ResourceProjection => {
    const pick = (state: typeof nominal) =>
      kind === "oxygen" ? state.oxygen[location].remaining_g : state.battery[location].remaining_wh;
    return {
      unit: kind === "oxygen" ? "g" : "Wh",
      reserve:
        kind === "oxygen" ? config.oxygen[location].reserve_g : config.battery[location].reserve_wh,
      now: pick(current),
      projected: { low: pick(low), nominal: pick(nominal), high: pick(high) },
      first_reserve_crossing_s:
        kind === "oxygen"
          ? nominal.oxygen[location].first_reserve_crossing_s
          : nominal.battery[location].first_reserve_crossing_s,
    };
  };

  return {
    method:
      "Deterministic resource model. Archived MOXIE rows before now, then the mean of the last ingested window repeated forward (low/high = mean ∓ one standard deviation). Future scenario events are not known and are excluded.",
    now_s: nowS,
    target_s: target,
    horizon_s: horizon,
    confidence,
    confidence_rule:
      "high: horizon within the trend window and variation under 10%; medium: horizon within 4× the window; otherwise low",
    trend: {
      window_s: windowS,
      samples: windowS,
      oxygen_rate_g_h: t ? { mean: t.mean, std: t.std } : null,
      total_power_w: t ? t.power : null,
    },
    activity_at_target: nominal.activity,
    oxygen: { base: resource("oxygen", "base"), eva: resource("oxygen", "eva") },
    battery: { base: resource("battery", "base"), eva: resource("battery", "eva") },
    reasons_at_target: nominal.reasons,
    status: nominal.status,
  };
}
