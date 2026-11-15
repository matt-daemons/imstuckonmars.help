import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "../db";
import { dataReleases, missionCommands, missionSessions } from "../db/schema";
import { timingSafeEqual } from "node:crypto";
import { anchorClock, clockPosition, type MissionClock } from "../../lib/mission/clock";
import { evaluateMission, assessReturn } from "../../lib/mission/engine";
import {
  MissionError,
  type MissionConfig,
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
import { environmentAt, getRun, loadTrace } from "../telemetry/repository";
import { radiationContext } from "../telemetry/radiation";

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
  if (clock.mode !== "paused" && clock.mode !== "playing")
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

async function inputs(db: Database, session: Session) {
  const config = parseConfig(JSON.parse(session.config_json));
  const run = await getRun(db, session.release_id, config.run_id);
  const trace = await loadTrace(db, session.release_id, config.run_id);
  const samples = trace.slice(
    config.source_start_row - 1,
    config.source_start_row - 1 + Math.ceil(config.duration_s),
  );
  return {
    config,
    run,
    samples,
    events: readEvents(session, config),
    clock: readClock(session.clock_json),
  };
}

export async function createSession(
  db: Database,
  release: string,
  value: unknown,
  now = Date.now(),
) {
  const config = parseConfig(value);
  const run = await getRun(db, release, config.run_id);
  if (
    !run.derived_product_id ||
    config.source_start_row + Math.ceil(config.duration_s) - 1 > run.sample_count
  ) {
    throw new MissionError(
      "source_unavailable",
      "The configured interval requires an acquired, complete derived MOXIE trace",
    );
  }
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
          expires_ms: sql<number>`${now + 86400000}`.as("expires_ms"),
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
    expires_ms: now + 86400000,
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
        atS !== undefined || state.status !== "ok" || state.elapsed_s >= input.config.duration_s
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
      const run = await getRun(db, session.release_id, config.run_id);
      if (
        !run.derived_product_id ||
        config.source_start_row + Math.ceil(config.duration_s) - 1 > run.sample_count
      ) {
        throw new MissionError(
          "source_unavailable",
          "Configuration exceeds available derived samples",
        );
      }
      break;
    }
    case "event": {
      if (events.length >= 100)
        throw new MissionError(
          "event_limit",
          "A mission supports at most 100 scenario events",
          429,
        );
      const event = parseEvent(body.event, config.duration_s);
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

export async function returnAssessment(
  db: Database,
  session: Session,
  route: ReturnRoute,
  atS?: number,
) {
  const result = await snapshot(db, session, Date.now(), atS);
  return assessReturn(result.config, result.state, route, session.revision, result.events);
}
