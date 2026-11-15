import * as zod from "zod";
import type { Database } from "../db";
import { FLIGHT_RULES, type Factor } from "../../lib/flight-rules/rules";
import { projectResources } from "../../lib/copilot/projection";
import { parseConfig, parseEvent } from "../../lib/mission/validation";
import type { MoxieSample, ScenarioEvent } from "../../lib/mission/types";
import { explain } from "../mission/diagnostics";
import { snapshot, type sessionFor } from "../mission/service";
import { loadTrace } from "../telemetry/repository";
import { loadRadiation, RADIATION_LIMITATIONS, RADIATION_PROXY } from "../telemetry/radiation";

type Session = Awaited<ReturnType<typeof sessionFor>>;
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

const FACTORS = Object.keys(FLIGHT_RULES) as Factor[];
const TREND_METRICS = ["oxygen_rate_g_h", "total_power_w"] as const;
const ATS_FIELDS = [
  "ats_local_temp1",
  "ats_local_temp2",
  "ats_local_temp3",
  "ats_local_temp4",
  "ats_local_temp5",
] as const;

const argSchemas = {
  get_status: zod.object({}).strict(),
  project_resources: zod.object({ minutes_ahead: zod.number().int().min(1).max(360) }).strict(),
  time_to_reserve: zod.object({}).strict(),
  recent_trend: zod
    .object({ metric: zod.enum(TREND_METRICS), minutes: zod.number().int().min(1).max(60) })
    .strict(),
  radiation_status: zod.object({}).strict(),
  flight_rule: zod.object({ factor: zod.enum(FACTORS as [Factor, ...Factor[]]) }).strict(),
  explain_findings: zod.object({}).strict(),
};

export type CopilotTool = keyof typeof argSchemas;

const noArgs = { type: "object", properties: {}, required: [], additionalProperties: false };

/** OpenAI-compatible function definitions. Every tool is read-only. */
export const TOOL_DEFINITIONS = [
  {
    name: "get_status",
    description:
      "Current mission state at the replay cursor: clock, activity, simulated oxygen and battery for base and suit with reserves, active findings, archived MOXIE production, and historical Jezero sol-816 air temperature and pressure.",
    parameters: noArgs,
  },
  {
    name: "project_resources",
    description:
      "Predict simulated oxygen and battery levels some minutes ahead, using only data ingested so far. Returns low/nominal/high and a confidence level.",
    parameters: {
      type: "object",
      properties: { minutes_ahead: { type: "integer", minimum: 1, maximum: 360 } },
      required: ["minutes_ahead"],
      additionalProperties: false,
    },
  },
  {
    name: "time_to_reserve",
    description:
      "Predict when each simulated resource (base and suit oxygen, base and suit battery) would cross its reserve before the mission ends, using only data ingested so far.",
    parameters: noArgs,
  },
  {
    name: "recent_trend",
    description:
      "Trend of an archived MOXIE channel over the last N minutes of ingested data: oxygen production rate (g/h) or instrument power (W).",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: [...TREND_METRICS] },
        minutes: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["metric", "minutes"],
      additionalProperties: false,
    },
  },
  {
    name: "radiation_status",
    description:
      "Latest ingested radiation dose rate (Curiosity RAD at Gale crater, a distant proxy) converted to micrograys per hour, the last 3 hours of ingested readings, and the team's dose-rate flight rule.",
    parameters: noArgs,
  },
  {
    name: "flight_rule",
    description: "Read one flight rule's limits and its cited source.",
    parameters: {
      type: "object",
      properties: { factor: { type: "string", enum: FACTORS } },
      required: ["factor"],
      additionalProperties: false,
    },
  },
  {
    name: "explain_findings",
    description:
      "Deterministic reason codes behind the current mission state, with evidence paths and limitations.",
    parameters: noArgs,
  },
].map((tool) => ({ type: "function" as const, function: { ...tool, strict: true } }));

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.function.name) as CopilotTool[];

const round = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

const minutes = (seconds: number | null) => (seconds === null ? null : round(seconds / 60, 1));

function environmentSummary(result: Snapshot) {
  const env = result.observed.environment;
  const pick = (sensor: string) => env.series.find((item) => item.sensor === sensor)?.sample;
  const ats = pick("ats") as Record<string, number | null> | undefined;
  const temps = ats
    ? ATS_FIELDS.map((field) => ats[field]).filter((v): v is number => typeof v === "number")
    : [];
  const ps = pick("ps") as Record<string, number | null> | undefined;
  return {
    status: env.status,
    source: "Perseverance MEDA, Jezero crater, sol 816 (historical proxy, not the base site)",
    air_temperature_k:
      temps.length > 0 ? { min: round(Math.min(...temps)), max: round(Math.max(...temps)) } : null,
    air_temperature_c:
      temps.length > 0
        ? { min: round(Math.min(...temps) - 273.15), max: round(Math.max(...temps) - 273.15) }
        : null,
    pressure_pa: round(ps?.pressure ?? null),
    humidity: "withheld: the archive does not state the humidity scale",
  };
}

function resourceSummary(result: Snapshot) {
  const { config, state } = result;
  const one = (kind: "oxygen" | "battery", location: "base" | "eva") => {
    const remaining =
      kind === "oxygen" ? state.oxygen[location].remaining_g : state.battery[location].remaining_wh;
    const reserve =
      kind === "oxygen" ? config.oxygen[location].reserve_g : config.battery[location].reserve_wh;
    const capacity =
      kind === "oxygen" ? config.oxygen[location].capacity_g : state.battery[location].capacity_wh;
    return {
      unit: kind === "oxygen" ? "g" : "Wh",
      remaining: round(remaining),
      reserve,
      capacity,
      margin_above_reserve: round(remaining - reserve),
      percent_of_capacity: round((remaining / capacity) * 100, 0),
    };
  };
  return {
    oxygen: { base: one("oxygen", "base"), suit: one("oxygen", "eva") },
    battery: { base: one("battery", "base"), suit: one("battery", "eva") },
  };
}

function rateToHourly(value: number | null) {
  return value === null ? null : round(value / 24, 2);
}

/**
 * Binds the copilot tools to one authorized mission at one instant. The replay cursor is
 * the ingestion split: no tool returns archived rows, events or observations after it.
 */
export async function copilotTools(
  db: Database,
  session: Session,
  radiationRelease: string | undefined,
) {
  const result = await snapshot(db, session, Date.now(), undefined, { radiationRelease });
  const nowS = result.state.elapsed_s;
  let samples: MoxieSample[] | null = null;
  const loadSamples = async () => {
    if (samples) return samples;
    const config = parseConfig(JSON.parse(session.config_json));
    const trace = await loadTrace(db, session.release_id, config.run_id);
    samples = trace.slice(
      config.source_start_row - 1,
      config.source_start_row - 1 + Math.ceil(config.duration_s),
    );
    return samples;
  };
  const events = (JSON.parse(session.events_json) as unknown[]).map((value) =>
    parseEvent(value, result.config.duration_s),
  ) as ScenarioEvent[];

  const run = async (name: CopilotTool, rawArgs: unknown): Promise<unknown> => {
    switch (name) {
      case "get_status": {
        argSchemas.get_status.parse(rawArgs);
        const moxie = result.observed.moxie;
        return {
          mission_time_min: minutes(nowS),
          mission_duration_min: minutes(result.config.duration_s),
          clock: { mode: result.clock.mode, speed: result.clock.speed },
          activity: result.state.activity,
          crew_count: result.config.crew_count,
          eva_elapsed_min: minutes(result.state.eva_elapsed_s),
          eva_limit_min: minutes(result.config.eva_limit_s),
          resources_simulated: resourceSummary(result),
          generator: {
            available: result.state.generator_available,
            captured_oxygen_g_h: round(result.state.effective_oxygen_rate_g_h, 2),
          },
          archived_moxie: moxie
            ? {
                oxygen_rate_g_h: round(moxie.oxygen_rate_g_h, 2),
                total_power_w: round(moxie.total_power_w),
                source: "Perseverance MOXIE archive, replayed as live",
              }
            : null,
          weather: environmentSummary(result),
          findings: result.state.reasons,
          labels: result.limitations,
        };
      }
      case "project_resources": {
        const args = argSchemas.project_resources.parse(rawArgs);
        return projectResources(
          result.config,
          await loadSamples(),
          events,
          nowS,
          args.minutes_ahead * 60,
        );
      }
      case "time_to_reserve": {
        argSchemas.time_to_reserve.parse(rawArgs);
        const p = projectResources(
          result.config,
          await loadSamples(),
          events,
          nowS,
          result.config.duration_s - nowS,
        );
        const crossing = (s: number | null) =>
          s === null
            ? "not before mission end"
            : s <= nowS
              ? "already below reserve"
              : { in_min: minutes(s - nowS), at_mission_min: minutes(s) };
        return {
          method: p.method,
          confidence: p.confidence,
          confidence_rule: p.confidence_rule,
          mission_end_min: minutes(result.config.duration_s),
          oxygen: {
            base: crossing(p.oxygen.base.first_reserve_crossing_s),
            suit: crossing(p.oxygen.eva.first_reserve_crossing_s),
          },
          battery: {
            base: crossing(p.battery.base.first_reserve_crossing_s),
            suit: crossing(p.battery.eva.first_reserve_crossing_s),
          },
        };
      }
      case "recent_trend": {
        const args = argSchemas.recent_trend.parse(rawArgs);
        const all = await loadSamples();
        const end = Math.min(Math.floor(nowS), all.length);
        const window = all
          .slice(Math.max(0, end - args.minutes * 60), end)
          .map((s) => s[args.metric])
          .filter((v): v is number => typeof v === "number");
        if (window.length === 0)
          return { metric: args.metric, status: "no ingested samples in this window" };
        const half = Math.floor(window.length / 2) || 1;
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
        const early = mean(window.slice(0, half));
        const late = mean(window.slice(-half));
        return {
          metric: args.metric,
          unit: args.metric === "oxygen_rate_g_h" ? "g/h" : "W",
          window_min: round(window.length / 60, 1),
          samples: window.length,
          latest: round(window[window.length - 1], 2),
          mean: round(mean(window), 2),
          min: round(Math.min(...window), 2),
          max: round(Math.max(...window), 2),
          change_late_vs_early: round(late - early, 2),
          source: "Perseverance MOXIE archive, replayed as live",
        };
      }
      case "radiation_status": {
        argSchemas.radiation_status.parse(rawArgs);
        const context = result.observed.radiation;
        const rule = FLIGHT_RULES.dose_rate;
        const base = {
          proxy: RADIATION_PROXY,
          limitations: RADIATION_LIMITATIONS,
          rule: {
            caution_at_ugy_h: rule.caution_at_micrograys_per_hour,
            no_go_at_ugy_h: rule.no_go_at_micrograys_per_hour,
            applies_to: rule.applies_to,
            source: rule.source,
          },
        };
        if (!("mission_utc_ms" in context) || context.mission_utc_ms === undefined)
          return { ...base, status: context.status };
        const series = radiationRelease ? await loadRadiation(db, radiationRelease) : null;
        const nowUtc = context.mission_utc_ms;
        const recent = (series?.observations ?? [])
          .filter((row) => row.utc_ms <= nowUtc && row.utc_ms >= nowUtc - 3 * 60 * 60 * 1000)
          .map((row) => ({
            minutes_ago: round((nowUtc - row.utc_ms) / 60000, 0),
            tissue_equivalent_ugy_h: rateToHourly(row.dose_rate_e_ugy_day),
            silicon_ugy_h: rateToHourly(row.dose_rate_b_ugy_day),
            flagged: row.flag ?? null,
          }));
        const current = context.observation;
        const hourly = rateToHourly(current?.dose_rate_e_ugy_day ?? null);
        return {
          ...base,
          status: context.status,
          current: current
            ? {
                tissue_equivalent_ugy_h: hourly,
                silicon_ugy_h: rateToHourly(current.dose_rate_b_ugy_day),
                observation_age_min: round((context.observation_age_s ?? 0) / 60, 0),
              }
            : null,
          rule_check:
            hourly === null
              ? "no usable reading"
              : hourly >= rule.no_go_at_micrograys_per_hour
                ? "NO_GO"
                : hourly >= rule.caution_at_micrograys_per_hour
                  ? "CAUTION"
                  : "below caution",
          rule_check_channel:
            "Detector E (tissue-equivalent plastic). Silicon detector B shown separately, never averaged.",
          recent_ingested: recent,
        };
      }
      case "flight_rule": {
        const args = argSchemas.flight_rule.parse(rawArgs);
        return { factor: args.factor, ...FLIGHT_RULES[args.factor] };
      }
      case "explain_findings": {
        argSchemas.explain_findings.parse(rawArgs);
        const findings = explain(result);
        return {
          findings: findings.findings,
          interpretation: findings.interpretation,
          limitations: findings.limitations,
        };
      }
    }
  };

  return { run, snapshot: result };
}
