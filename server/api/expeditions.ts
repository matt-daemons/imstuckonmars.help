import { Hono } from "hono";
import { HABITAT_LNGLAT, idleConfig } from "../../lib/mission/expedition";
import { MissionError } from "../../lib/mission/types";
import { createSession, purgeExpiredSessions } from "../mission/service";
import { getRun, requireRelease } from "../telemetry/repository";
import { database, type ApiBindings } from "./bindings";

export const expeditions = new Hono<{ Bindings: ApiBindings }>();

/** A browser expedition lasts a working session, not a day. */
export const EXPEDITION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Open the page's one mission session, idle at the habitat. Browser-safe: callers cannot supply
 * a configuration here; plans arrive later as validated `plan` commands. Admission stays capped
 * by createSession and is rate limited per client address.
 */
expeditions.post("/", async (c) => {
  if (!c.env.EXPEDITION_LIMITER)
    throw new MissionError(
      "access_not_configured",
      "Expeditions are unavailable: configure EXPEDITION_LIMITER on the server",
      503,
    );
  const { success } = await c.env.EXPEDITION_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "local",
  });
  if (!success) {
    c.header("Retry-After", "60");
    throw new MissionError(
      "rate_limited",
      "Too many expeditions opened from this address. Wait a minute, then reload",
      429,
    );
  }
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  await requireRelease(db, release);
  await purgeExpiredSessions(db);
  const run = await getRun(db, release, `${release}-moxie-00816`);
  const session = await createSession(
    db,
    release,
    idleConfig(run.id, run.sample_count, HABITAT_LNGLAT),
    Date.now(),
    EXPEDITION_TTL_MS,
  );
  return c.json({ ...session, trace_rows: run.sample_count }, 201);
});
