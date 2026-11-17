import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

import { buildExpeditionConfig, RECOVERY_S } from "../../lib/mission/expedition";
import { replanConfig } from "../../lib/mission/outlook";
import type { MissionClock } from "../../lib/mission/clock";
import type { MoxieSample } from "../../lib/mission/types";
import type { Database } from "../db";

vi.mock("../telemetry/repository", () => ({
  getRun: vi.fn(async () => ({
    id: "run",
    directory_sol: 0,
    sample_count: 2400,
    warnings_json: "[]",
  })),
  loadTrace: vi.fn(async () => trace),
  environmentAt: vi.fn(async () => null),
}));
vi.mock("../telemetry/radiation", () => ({
  radiationContext: vi.fn(async () => null),
}));

import { command, outlook, report, snapshot, samplesFor } from "./service";

const trace: MoxieSample[] = Array.from({ length: 2400 }, (_, index) => ({
  source_row: index + 1,
  segment_id: 0,
  elapsed_ms: index * 1000,
  sclk_ms: null,
  utc_ms: null,
  oxygen_rate_g_h: 6,
  total_power_w: 300,
}));

function fixture() {
  const config = buildExpeditionConfig(
    {
      id: "arrival-test",
      mode: "walking",
      shelter_lnglat: [-176.05, 45.97],
      outbound: {
        path: [
          [-176.05, 45.97],
          [-176.04, 45.97],
        ],
        duration_s: 60,
      },
      sampling_s: 60,
      back: {
        path: [
          [-176.04, 45.97],
          [-176.05, 45.97],
        ],
        duration_s: 60,
      },
    },
    "run",
    trace.length,
  );
  const arrival = config.duration_s - RECOVERY_S;
  const clock: MissionClock = {
    mode: "playing",
    position_s: arrival - 5,
    speed: 60,
    anchor_ms: 1000,
  };
  const session = {
    id: "mission",
    revision: 0,
    release_id: "test",
    config_json: JSON.stringify(config),
    events_json: "[]",
    clock_json: JSON.stringify(clock),
    created_ms: 0,
    expires_ms: 10_000_000,
  };
  const receipts = new Map<string, { request_hash: string; applied_revision: number }>();
  const dialect = new SQLiteSyncDialect();
  let writes = 0;
  // Model only the existing revision/receipt batch. Telemetry is synthetic and mocked above.
  const db = {
    select(fields: Record<string, unknown>) {
      let commandId = "";
      const query = {
        from: () => query,
        where(condition: SQL) {
          commandId = String(dialect.sqlToQuery(condition).params.at(-1));
          return query;
        },
        get: async () =>
          "request_hash" in fields ? receipts.get(commandId) : { n: receipts.size },
      };
      return query;
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          return { where: () => ({ returning: () => values }) };
        },
      };
    },
    insert: () => ({ select: () => ({ onConflictDoNothing: () => ({}) }) }),
    async batch(queries: Record<string, unknown>[]) {
      const values = queries[0];
      session.revision += 1;
      session.clock_json = values.clock_json as string;
      session.config_json = values.config_json as string;
      session.events_json = values.events_json as string;
      receipts.set(values.last_command_id as string, {
        request_hash: values.last_command_hash as string,
        applied_revision: session.revision,
      });
      writes += 1;
      return [[{ revision: session.revision }], []];
    },
  } as unknown as Database;
  return { db, session, config, arrival, writes: () => writes };
}

describe("server-owned shelter arrival", () => {
  it("freezes snapshot, outlook and report at arrival without writes or deleting recovery", async () => {
    const { db, session, config, arrival, writes } = fixture();
    for (const now of [2000, 1_000_000]) {
      const result = await snapshot(db, session, now);
      expect(result.clock).toMatchObject({ mode: "paused", position_s: arrival });
      expect(result.state.position?.phase).toBe("shelter");
      expect(result.config).toEqual(config);
      expect(result.revision).toBe(0);
      expect((await outlook(db, session, now)).at_s).toBe(arrival);
      const currentReport = await report(db, session, now);
      expect(currentReport.at_s).toBe(arrival);
      expect(currentReport.ended_by_operator).toBe(false);
    }
    expect(writes()).toBe(0);
    expect(config.schedule.at(-1)).toMatchObject({
      activity: "base",
      start_s: arrival,
      end_s: arrival + RECOVERY_S,
    });
  });

  it("resumes recovery once through Play and preserves receipt idempotency", async () => {
    const { db, session, arrival, writes } = fixture();
    const raw = { command_id: "resume", expected_revision: 0, type: "play" };
    const accepted = await command(db, { ...session }, raw, 2000);
    expect(accepted.clock).toMatchObject({ mode: "playing", position_s: arrival });
    expect(accepted.applied_revision).toBe(1);
    const retried = await command(db, { ...session }, raw, 3000);
    expect(retried.idempotent_replay).toBe(true);
    expect(retried.applied_revision).toBe(1);
    expect(retried.state.elapsed_s).toBe(arrival + 60);
    expect(writes()).toBe(1);
    const completed = await snapshot(db, session, 20000);
    expect(completed.clock.mode).toBe("paused");
    expect(completed.state.elapsed_s).toBe(arrival + RECOVERY_S);
    expect((await report(db, session, 20000)).ended_by_operator).toBe(false);
  });

  it("does not resume arrival by retrying a Play receipt accepted before the return", async () => {
    const { db, session, arrival, writes } = fixture();
    const raw = { command_id: "outbound-play", expected_revision: 0, type: "play" };
    await command(db, { ...session }, raw, 1000);
    for (const now of [2000, 1_000_000]) {
      const result = await command(db, { ...session }, raw, now);
      expect(result.idempotent_replay).toBe(true);
      expect(result.clock).toMatchObject({ mode: "paused", position_s: arrival });
    }
    expect(writes()).toBe(1);
  });

  it("does not treat speed changes at arrival as permission to run recovery", async () => {
    const { db, session, arrival } = fixture();
    const result = await command(
      db,
      { ...session },
      { command_id: "speed", expected_revision: 0, type: "speed", speed: 10 },
      2000,
    );
    expect(result.clock).toMatchObject({ mode: "paused", position_s: arrival, speed: 10 });
    expect((await snapshot(db, session, 100000)).state.elapsed_s).toBe(arrival);
  });

  it("keeps historical inspection pure and seeks explicit, re-arming only before arrival", async () => {
    const { db, session, arrival } = fixture();
    const inspected = await snapshot(db, session, 2000, arrival + 100);
    expect(inspected.state.elapsed_s).toBe(arrival + 100);
    expect((await snapshot(db, session, 2000)).state.elapsed_s).toBe(arrival);
    for (const target of [arrival - 10, arrival, arrival + 100]) {
      const f = fixture();
      await command(
        f.db,
        { ...f.session },
        {
          command_id: "seek",
          expected_revision: 0,
          type: "seek",
          at_s: target,
        },
        2000,
      );
      await command(
        f.db,
        { ...f.session },
        {
          command_id: "play",
          expected_revision: 1,
          type: "play",
        },
        3000,
      );
      const later = await snapshot(f.db, f.session, 4000);
      expect(later.state.elapsed_s).toBe(target < arrival ? arrival : target + 60);
      expect(later.clock.mode).toBe(target < arrival ? "paused" : "playing");
    }
  });

  it("uses the shortened replan's return boundary while retaining all configured recovery", async () => {
    const { db, session, config } = fixture();
    const next = replanConfig(config, samplesFor(trace, config), [], 630, "turn_back");
    if (typeof next === "string") throw new Error(next);
    const arrival = next.route!.legs.at(-1)!.end_s;
    session.config_json = JSON.stringify(next);
    session.clock_json = JSON.stringify({
      mode: "playing",
      position_s: 630,
      speed: 60,
      anchor_ms: 1000,
    });
    const result = await snapshot(db, session, 1_000_000);
    expect(result.clock).toMatchObject({ mode: "paused", position_s: arrival });
    expect(result.config.duration_s - arrival).toBe(RECOVERY_S);
    expect(result.config.duration_s).toBeLessThan(config.duration_s);
  });
});
