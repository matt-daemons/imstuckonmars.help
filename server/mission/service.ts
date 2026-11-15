import type { D1Database } from "@cloudflare/workers-types";
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
  db: D1Database,
  id: string,
  authorization: string | undefined,
  now = Date.now(),
) {
  const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new MissionError("unauthorized", "A mission capability is required", 401);
  const session = await db
    .prepare(
      "SELECT id,release_id,revision,config_json,events_json,clock_json,created_ms,expires_ms FROM mission_sessions WHERE id=? AND token_hash=? AND expires_ms>?",
    )
    .bind(id, await hash(token), now)
    .first<Session>();
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

async function inputs(db: D1Database, session: Session) {
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
  db: D1Database,
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
  const response = await db
    .prepare(
      "INSERT INTO mission_sessions (id,token_hash,release_id,revision,config_json,events_json,clock_json,created_ms,expires_ms) SELECT ?,?,?,0,?,'[]',?,?,? WHERE (SELECT count(*) FROM mission_sessions WHERE expires_ms>?)<100",
    )
    .bind(
      id,
      await hash(token),
      release,
      JSON.stringify(config),
      JSON.stringify(clock),
      now,
      now + 86400000,
      now,
    )
    .run();
  if (response.meta.changes !== 1)
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

export async function snapshot(db: D1Database, session: Session, now = Date.now(), atS?: number) {
  const input = await inputs(db, session);
  const target = atS ?? clockPosition(input.clock, now, input.config.duration_s);
  const state = evaluateMission(input.config, input.samples, input.events, target);
  const currentSample =
    input.samples[Math.min(Math.floor(state.elapsed_s), input.samples.length - 1)] ?? null;
  const environment = await environmentAt(
    db,
    session.release_id,
    currentSample?.sclk_ms ?? null,
    input.run.directory_sol,
  );
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

export async function command(db: D1Database, session: Session, raw: unknown, now = Date.now()) {
  const body = object(raw);
  const commandId = text(body.command_id, "command_id");
  const expectedRevision = integer(body.expected_revision, "expected_revision");
  const fingerprint = await hash(JSON.stringify(canonical(body)));
  const receipt = await db
    .prepare(
      "SELECT request_hash,applied_revision FROM mission_commands WHERE session_id=? AND command_id=?",
    )
    .bind(session.id, commandId)
    .first<{ request_hash: string; applied_revision: number }>();
  if (receipt) {
    if (receipt.request_hash !== fingerprint)
      throw new MissionError(
        "command_id_reused",
        "Command ID was used for a different request",
        409,
      );
    return {
      ...(await snapshot(db, session, now)),
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
  const count = await db
    .prepare("SELECT count(*) AS n FROM mission_commands WHERE session_id=?")
    .bind(session.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 500)
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
      .prepare(
        "UPDATE mission_sessions SET revision=revision+1,config_json=?,events_json=?,clock_json=?,last_command_id=?,last_command_hash=? WHERE id=? AND revision=? AND expires_ms>?",
      )
      .bind(
        updated.config_json,
        updated.events_json,
        updated.clock_json,
        commandId,
        fingerprint,
        session.id,
        expectedRevision,
        now,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO mission_commands SELECT id,?,?,revision FROM mission_sessions WHERE id=? AND last_command_id=? AND last_command_hash=?",
      )
      .bind(commandId, fingerprint, session.id, commandId, fingerprint),
  ]);
  if (results[0].meta.changes !== 1)
    throw new MissionError(
      "stale_revision",
      "Mission changed concurrently; reload its current revision",
      409,
    );
  return {
    ...(await snapshot(db, updated, now)),
    idempotent_replay: false,
    applied_revision: updated.revision,
  };
}

export async function returnAssessment(
  db: D1Database,
  session: Session,
  route: ReturnRoute,
  atS?: number,
) {
  const result = await snapshot(db, session, Date.now(), atS);
  return assessReturn(result.config, result.state, route, session.revision, result.events);
}
