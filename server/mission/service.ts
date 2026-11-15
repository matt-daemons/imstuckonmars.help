import { and, count, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import type { Database } from "../db";
import { dataReleases, missionCommands, missionSessions } from "../db/schema";
import { timingSafeEqual } from "node:crypto";
import { anchorClock, clockPosition, type MissionClock } from "../../lib/mission/clock";
import { evaluateMission, assessReturn } from "../../lib/mission/engine";
import { buildExpeditionConfig, parsePlan } from "../../lib/mission/expedition";
import { missionOutlook, replanConfig } from "../../lib/mission/outlook";
import {
  MissionError,
  type Evaluation,
  type MissionConfig,
  type MoxieSample,
  type ScenarioEvent,
  type ReturnRoute,
} from "../../lib/mission/types";
import {
  integer,
  number,
  object,
  parseConfig,
  parseEvent,
  text,
} from "../../lib/mission/validation";
import { environmentAt, environmentRollups, getRun, loadTrace } from "../telemetry/repository";
import {
  loadRadiation,
  MAX_OBSERVATION_AGE_MS,
  RADIATION_PROXY,
  radiationContext,
  type RadiationObservation,
} from "../telemetry/radiation";

/** Read-only observational companions configured per deployment. Not mission state. */
export interface Companions {
  radiationRelease?: string;
}

interface Session {
  id: string;
  release_id: string;
  revision: number;
  config_json: string;
  events_json: string;
  clock_json: string;
  created_ms: number;
  expires_ms: number;
}

export async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireWriteKey(provided: string | undefined, expected: string | undefined) {
  if (!expected)
    throw new MissionError(
      "access_not_configured",
      "Configure the server MISSION_WRITE_KEY before creating missions or using diagnostics",
      503,
    );
  const [a, b] = await Promise.all([hash(provided ?? ""), hash(`Bearer ${expected}`)]);
  if (!timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b))) {
    throw new MissionError(
      "unauthorized",
      "A valid creation/diagnostic access key is required",
      401,
    );
  }
}

export async function sessionFor(
  db: Database,
  id: string,
  authorization: string | undefined,
  now = Date.now(),
) {
  const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new MissionError("unauthorized", "A mission capability is required", 401);
  const session = await db
    .select({
      id: missionSessions.id,
      release_id: missionSessions.release_id,
      revision: missionSessions.revision,
      config_json: missionSessions.config_json,
      events_json: missionSessions.events_json,
      clock_json: missionSessions.clock_json,
      created_ms: missionSessions.created_ms,
      expires_ms: missionSessions.expires_ms,
    })
    .from(missionSessions)
    .where(
      and(
        eq(missionSessions.id, id),
        eq(missionSessions.token_hash, await hash(token)),
        gt(missionSessions.expires_ms, now),
      ),
    )
    .get();
  if (!session)
    throw new MissionError("mission_not_found", "Mission not found, expired or inaccessible", 404);
  return session;
}

function readClock(value: string): MissionClock {
  const clock = object(JSON.parse(value), "clock");
  if (clock.mode !== "paused" && clock.mode !== "playing" && clock.mode !== "ended")
    throw new MissionError("invalid_clock", "Invalid persisted clock");
  return {
    mode: clock.mode,
    position_s: number(clock.position_s, "position_s", 0, 21600),
    speed: number(clock.speed, "speed", 0.1, 100),
    anchor_ms: number(clock.anchor_ms, "anchor_ms", 0, Number.MAX_SAFE_INTEGER),
  };
}

function readEvents(session: Session, config: MissionConfig): ScenarioEvent[] {
  const values: unknown = JSON.parse(session.events_json);
  if (!Array.isArray(values) || values.length > 100)
    throw new MissionError("invalid_events", "Invalid event history");
  return values.map((value) => parseEvent(value, config.duration_s));
}

/** The archived rows a configuration replays, one per mission second. */
export function samplesFor(trace: MoxieSample[], config: MissionConfig) {
  return trace.slice(
    config.source_start_row - 1,
    config.source_start_row - 1 + Math.ceil(config.duration_s),
  );
}

/** A configuration must start inside an acquired, complete derived trace. */
function requireTrace(
  config: MissionConfig,
  run: { derived_product_id: string | null; sample_count: number },
) {
  const lastRow = config.source_start_row + Math.ceil(config.duration_s) - 1;
  const fits =
    config.after_archive === "no_production"
      ? config.source_start_row <= run.sample_count
      : lastRow <= run.sample_count;
  if (!run.derived_product_id || !fits)
    throw new MissionError(
      "source_unavailable",
      "The configured interval requires an acquired, complete derived MOXIE trace",
    );
}

async function inputs(db: Database, session: Session) {
  const config = parseConfig(JSON.parse(session.config_json));
  const run = await getRun(db, session.release_id, config.run_id);
  const trace = await loadTrace(db, session.release_id, config.run_id);
  const samples = samplesFor(trace, config);
  return {
    config,
    run,
    samples,
    events: readEvents(session, config),
    clock: readClock(session.clock_json),
  };
}

export const SESSION_TTL_MS = 86_400_000;

/**
 * Remove a bounded batch of expired sessions; their command receipts cascade. Expired sessions
 * are already unreachable, so this only frees storage and keeps the table small.
 */
export async function purgeExpiredSessions(db: Database, now = Date.now(), batch = 20) {
  await db
    .delete(missionSessions)
    .where(
      inArray(
        missionSessions.id,
        db
          .select({ id: missionSessions.id })
          .from(missionSessions)
          .where(lte(missionSessions.expires_ms, now))
          .limit(batch),
      ),
    )
    .run();
}

export async function createSession(
  db: Database,
  release: string,
  value: unknown,
  now = Date.now(),
  ttlMs = SESSION_TTL_MS,
) {
  const config = parseConfig(value);
  requireTrace(config, await getRun(db, release, config.run_id));
  const id = crypto.randomUUID();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const clock: MissionClock = { mode: "paused", position_s: 0, speed: 1, anchor_ms: now };
  const activeSessions = db
    .select({ n: count() })
    .from(missionSessions)
    .where(gt(missionSessions.expires_ms, now));
  // Keep the admission limit in the INSERT statement, not a racy preflight count.
  const response = await db
    .insert(missionSessions)
    .select(
      db
        .select({
          id: sql<string>`${id}`.as("id"),
          token_hash: sql<string>`${await hash(token)}`.as("token_hash"),
          release_id: sql<string>`${release}`.as("release_id"),
          revision: sql<number>`0`.as("revision"),
          config_json: sql<string>`${JSON.stringify(config)}`.as("config_json"),
          events_json: sql<string>`'[]'`.as("events_json"),
          clock_json: sql<string>`${JSON.stringify(clock)}`.as("clock_json"),
          created_ms: sql<number>`${now}`.as("created_ms"),
          expires_ms: sql<number>`${now + ttlMs}`.as("expires_ms"),
          last_command_id: sql<string | null>`null`.as("last_command_id"),
          last_command_hash: sql<string | null>`null`.as("last_command_hash"),
        })
        .from(dataReleases)
        .where(
          and(
            eq(dataReleases.id, release),
            eq(dataReleases.status, "published"),
            lt(sql`(${activeSessions})`, 100),
          ),
        ),
    )
    .returning({ id: missionSessions.id })
    .all();
  if (response.length !== 1)
    throw new MissionError("session_limit", "Active mission limit reached", 429);
  return {
    id,
    token,
    revision: 0,
    expires_ms: now + ttlMs,
    config,
    clock,
    provenance: "All equipment, crew and reserve parameters are explicit assumptions",
  };
}

export async function snapshot(
  db: Database,
  session: Session,
  now = Date.now(),
  atS?: number,
  companions: Companions = {},
) {
  const input = await inputs(db, session);
  const target = atS ?? clockPosition(input.clock, now, input.config.duration_s);
  const state = evaluateMission(input.config, input.samples, input.events, target);
  const currentSample =
    input.samples[Math.min(Math.floor(state.elapsed_s), input.samples.length - 1)] ?? null;
  const [environment, radiation] = await Promise.all([
    environmentAt(db, session.release_id, currentSample?.sclk_ms ?? null, input.run.directory_sol),
    radiationContext(db, companions.radiationRelease, currentSample?.utc_ms ?? null),
  ]);
  return {
    mission_id: session.id,
    revision: session.revision,
    release_id: session.release_id,
    server_time_ms: now,
    expires_ms: session.expires_ms,
    clock: {
      ...input.clock,
      anchor_ms: now,
      position_s: state.elapsed_s,
      mode:
        input.clock.mode === "ended" && atS === undefined
          ? "ended"
          : atS !== undefined || state.status !== "ok" || state.elapsed_s >= input.config.duration_s
            ? "paused"
            : input.clock.mode,
      basis: "request-driven server wall-clock anchor; no persistent timer",
    },
    config: input.config,
    events: input.events,
    state,
    observed: {
      moxie: currentSample,
      environment,
      radiation,
      run_id: input.run.id,
      calibrated_product_id: input.run.calibrated_product_id,
      derived_product_id: input.run.derived_product_id,
      time_quality: input.run.time_quality,
      warnings: JSON.parse(input.run.warnings_json) as string[],
    },
    limitations: [
      "Historical NASA observations, not live weather",
      "Resources, equipment and EVA profiles are simulated",
      "No physiological or operational safety certification",
    ],
  };
}

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new MissionError("invalid_input", "Request nesting is too deep", 400);
  if (Array.isArray(value)) return value.map((entry) => canonical(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry, depth + 1)]),
    );
  }
  return value;
}

export async function command(
  db: Database,
  session: Session,
  raw: unknown,
  now = Date.now(),
  companions: Companions = {},
) {
  const body = object(raw);
  const commandId = text(body.command_id, "command_id");
  const expectedRevision = integer(body.expected_revision, "expected_revision");
  const fingerprint = await hash(JSON.stringify(canonical(body)));
  const receipt = await db
    .select({
      request_hash: missionCommands.request_hash,
      applied_revision: missionCommands.applied_revision,
    })
    .from(missionCommands)
    .where(
      and(eq(missionCommands.session_id, session.id), eq(missionCommands.command_id, commandId)),
    )
    .get();
  if (receipt) {
    if (receipt.request_hash !== fingerprint)
      throw new MissionError(
        "command_id_reused",
        "Command ID was used for a different request",
        409,
      );
    return {
      ...(await snapshot(db, session, now, undefined, companions)),
      idempotent_replay: true,
      applied_revision: receipt.applied_revision,
    };
  }
  if (expectedRevision !== session.revision)
    throw new MissionError(
      "stale_revision",
      `Expected current mission revision ${session.revision}`,
      409,
    );
  const receiptCount = await db
    .select({ n: count() })
    .from(missionCommands)
    .where(eq(missionCommands.session_id, session.id))
    .get();
  if ((receiptCount?.n ?? 0) >= 500)
    throw new MissionError("command_limit", "Create a new mission after 500 commands", 429);
  const input = await inputs(db, session);
  if (input.clock.mode === "ended" && body.type !== "reset" && body.type !== "plan")
    throw new MissionError(
      "simulation_ended",
      "This simulation has ended. Restart it or launch a new expedition to make changes",
      409,
    );
  let config = input.config;
  let events = input.events;
  const evaluated = evaluateMission(
    config,
    input.samples,
    events,
    clockPosition(input.clock, now, config.duration_s),
  );
  let clock = anchorClock(input.clock, evaluated.elapsed_s, now);
  switch (body.type) {
    case "play":
      if (evaluated.status !== "ok" || evaluated.elapsed_s >= config.duration_s)
        throw new MissionError(
          "playback_boundary",
          "Seek or reset before playing beyond a source boundary",
          409,
        );
      clock.mode = "playing";
      break;
    case "pause":
      clock.mode = "paused";
      break;
    case "end":
      clock.mode = "ended";
      break;
    case "speed":
      clock.speed = number(body.speed, "speed", 0.1, 100);
      break;
    case "seek":
      clock = {
        ...clock,
        mode: "paused",
        position_s: number(body.at_s, "at_s", 0, config.duration_s),
      };
      break;
    case "reset":
      clock = { mode: "paused", position_s: 0, speed: 1, anchor_ms: now };
      events = [];
      break;
    case "configure": {
      if (clock.mode !== "paused" || clock.position_s !== 0 || events.length !== 0)
        throw new MissionError(
          "reset_required",
          "Reset before replacing scenario configuration",
          409,
        );
      config = parseConfig(body.config);
      requireTrace(config, await getRun(db, session.release_id, config.run_id));
      break;
    }
    case "plan": {
      // A new expedition replaces the scenario: events clear and the clock rewinds, paused.
      const run = await getRun(db, session.release_id, config.run_id);
      config = buildExpeditionConfig(parsePlan(body.plan), run.id, run.sample_count);
      requireTrace(config, run);
      events = [];
      clock = { ...clock, mode: "paused", position_s: 0 };
      break;
    }
    case "replan": {
      if (body.option !== "turn_back" && body.option !== "cut_sampling")
        throw new MissionError("invalid_input", "option must be turn_back or cut_sampling", 400);
      if (evaluated.status !== "ok")
        throw new MissionError("source_unavailable", "Seek before replanning past a data gap", 409);
      const next = replanConfig(config, input.samples, events, evaluated.elapsed_s, body.option);
      if (typeof next === "string") throw new MissionError("replan_unavailable", next, 409);
      config = next;
      break;
    }
    case "event": {
      if (events.length >= 100)
        throw new MissionError(
          "event_limit",
          "A mission supports at most 100 scenario events",
          429,
        );
      // "now" is resolved against the server clock, so a playing replay never races the client
      // into rejecting the event as past. Retries replay the receipt, not a new "now".
      const requested = object(body.event, "event");
      const event = parseEvent(
        requested.at_s === "now" ? { ...requested, at_s: evaluated.elapsed_s } : requested,
        config.duration_s,
      );
      if (events.some((existing) => existing.id === event.id))
        throw new MissionError("event_id_reused", "Event IDs must be unique", 409);
      if (event.at_s < evaluated.elapsed_s)
        throw new MissionError(
          "past_event",
          "Pause and seek before inserting a past scenario event",
          409,
        );
      events = [...events, event];
      // Inserting an earlier failure must not silently invalidate an already scheduled refill.
      evaluateMission(config, input.samples, events, config.duration_s);
      break;
    }
    default:
      throw new MissionError("invalid_command", "Unknown mission command", 400);
  }
  const updated = {
    ...session,
    revision: session.revision + 1,
    config_json: JSON.stringify(config),
    events_json: JSON.stringify(events),
    clock_json: JSON.stringify(clock),
  };
  const results = await db.batch([
    db
      .update(missionSessions)
      .set({
        revision: sql`${missionSessions.revision} + 1`,
        config_json: updated.config_json,
        events_json: updated.events_json,
        clock_json: updated.clock_json,
        last_command_id: commandId,
        last_command_hash: fingerprint,
      })
      .where(
        and(
          eq(missionSessions.id, session.id),
          eq(missionSessions.revision, expectedRevision),
          gt(missionSessions.expires_ms, now),
        ),
      )
      .returning({ revision: missionSessions.revision }),
    db
      .insert(missionCommands)
      .select(
        db
          .select({
            session_id: missionSessions.id,
            command_id: sql<string>`${commandId}`.as("command_id"),
            request_hash: sql<string>`${fingerprint}`.as("request_hash"),
            applied_revision: missionSessions.revision,
          })
          .from(missionSessions)
          .where(
            and(
              eq(missionSessions.id, session.id),
              eq(missionSessions.last_command_id, commandId),
              eq(missionSessions.last_command_hash, fingerprint),
            ),
          ),
      )
      .onConflictDoNothing(),
  ]);
  if (results[0].length !== 1)
    throw new MissionError(
      "stale_revision",
      "Mission changed concurrently; reload its current revision",
      409,
    );
  return {
    ...(await snapshot(db, updated, now, undefined, companions)),
    idempotent_replay: false,
    applied_revision: updated.revision,
  };
}

/**
 * Every archived series a replay charts, aligned to mission seconds, in one request. The trace
 * and radiation come from the Workers cache; only three small rollup queries reach D1.
 */
export async function replaySeries(db: Database, session: Session, companions: Companions = {}) {
  const input = await inputs(db, session);
  const first = input.samples[0];
  const last = input.samples[input.samples.length - 1];
  const startSclk = first?.sclk_ms ?? null;
  const startUtc = first?.utc_ms ?? null;
  const environment =
    startSclk !== null && last?.sclk_ms != null && input.run.directory_sol === 816
      ? await environmentRollups(db, session.release_id, startSclk, last.sclk_ms + 1000)
      : [];
  let radiation: {
    status: string;
    release_id?: string;
    observations: RadiationObservation[];
  } = {
    status: companions.radiationRelease ? "time_unresolved" : "not_configured",
    observations: [],
  };
  if (companions.radiationRelease && startUtc !== null && last?.utc_ms != null) {
    const series = await loadRadiation(db, companions.radiationRelease).catch(() => null);
    radiation = series
      ? {
          status: "available",
          release_id: companions.radiationRelease,
          observations: series.observations.filter(
            (row) =>
              row.utc_ms >= startUtc - MAX_OBSERVATION_AGE_MS && row.utc_ms <= (last.utc_ms ?? 0),
          ),
        }
      : { status: "release_unavailable", observations: [] };
  }
  return {
    mission_id: session.id,
    revision: session.revision,
    run_id: input.run.id,
    duration_s: input.config.duration_s,
    start: { source_row: input.config.source_start_row, sclk_ms: startSclk, utc_ms: startUtc },
    moxie: {
      provenance: "NASA MOXIE derived telemetry, one sample per mission second",
      oxygen_rate_g_h: input.samples.map((sample) => sample.oxygen_rate_g_h),
      total_power_w: input.samples.map((sample) => sample.total_power_w),
    },
    environment: environment.map((item) => ({
      ...item,
      buckets: item.buckets.map((bucket) => ({
        ...bucket,
        at_s: startSclk === null ? null : (bucket.bucket_sclk_ms - startSclk) / 1000,
      })),
    })),
    radiation: {
      ...radiation,
      proxy: RADIATION_PROXY,
      units: "uGy/day",
      observations: radiation.observations.map((row) => ({
        ...row,
        at_s: startUtc === null ? null : (row.utc_ms - startUtc) / 1000,
      })),
    },
    alignment:
      "MEDA by SCLK in 60 s rollups; RAD by approximate UTC of observation start. Gaps are gaps, never zero",
  };
}

/** Predicted outcomes of the current plan and its alternatives, at the mission clock. */
export async function outlook(db: Database, session: Session, now = Date.now()) {
  const input = await inputs(db, session);
  if (!input.config.route)
    throw new MissionError("no_route", "Launch an expedition before requesting its outlook", 409);
  const at = clockPosition(input.clock, now, input.config.duration_s);
  return {
    mission_id: session.id,
    revision: session.revision,
    ...missionOutlook(input.config, input.samples, input.events, at),
  };
}

/** The outlook of a plan that has not been launched; nothing is written. */
export async function preview(db: Database, session: Session, plan: unknown) {
  const current = parseConfig(JSON.parse(session.config_json));
  const run = await getRun(db, session.release_id, current.run_id);
  const config = buildExpeditionConfig(parsePlan(plan), run.id, run.sample_count);
  requireTrace(config, run);
  const samples = samplesFor(await loadTrace(db, session.release_id, run.id), config);
  return {
    duration_s: config.duration_s,
    trace_rows: run.sample_count,
    suits: {
      oxygen_g: config.oxygen.eva.capacity_g,
      oxygen_reserve_g: config.oxygen.eva.reserve_g,
      energy_wh: config.battery.eva.capacity_wh,
      energy_reserve_wh: config.battery.eva.reserve_wh,
      eva_limit_s: config.eva_limit_s,
    },
    ...missionOutlook(config, samples, [], 0),
  };
}

export const REPORT_POINTS = 480;

/** The mission so far, sampled for the report: one deterministic pass over the clock. */
export async function report(db: Database, session: Session, now = Date.now()) {
  const input = await inputs(db, session);
  const end = clockPosition(input.clock, now, input.config.duration_s);
  const step = Math.max(15, Math.ceil(end / REPORT_POINTS));
  const times = [
    ...new Set([
      ...Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step),
      ...input.config.schedule.flatMap((entry) => [entry.start_s, entry.end_s]),
      ...input.events.map((event) => event.at_s),
      end,
    ]),
  ]
    .filter((t) => t <= end)
    .sort((a, b) => a - b);
  const rows: Array<ReturnType<typeof reportRow>> = [];
  const state = evaluateMission(input.config, input.samples, input.events, end, {
    times,
    record: (s) => rows.push(reportRow(s)),
  });
  return {
    mission_id: session.id,
    revision: session.revision,
    at_s: state.elapsed_s,
    status: state.status,
    ended_by_operator: input.clock.mode === "ended",
    config: input.config,
    events: input.events,
    final: state,
    series: rows,
    provenance:
      "Assumption-driven simulation. Archived NASA MOXIE rows drive habitat production only; suits, crew and route timing are modeled.",
  };
}

function reportRow(s: Evaluation) {
  return {
    t: s.elapsed_s,
    activity: s.activity,
    phase: s.position?.phase ?? null,
    distance_m: s.position?.distance_from_shelter_m ?? null,
    travelled_m: s.position?.travelled_m ?? null,
    suit_oxygen_g: s.oxygen.eva.remaining_g,
    suit_energy_wh: s.battery.eva.remaining_wh,
    shelter_oxygen_g: s.oxygen.base.remaining_g,
    shelter_energy_wh: s.battery.base.remaining_wh,
    reasons: s.reasons,
  };
}

export async function returnAssessment(
  db: Database,
  session: Session,
  route: ReturnRoute,
  atS?: number,
) {
  const result = await snapshot(db, session, Date.now(), atS);
  return assessReturn(result.config, result.state, route, session.revision, result.events);
}
