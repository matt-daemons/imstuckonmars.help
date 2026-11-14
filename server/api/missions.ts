import { Hono } from "hono";
import {
  command,
  createSession,
  returnAssessment,
  sessionFor,
  snapshot,
  requireWriteKey,
} from "../mission/service";
import { database, type ApiBindings } from "./bindings";
import { number, object, parseRoute, text } from "../../lib/mission/validation";
import { MissionError } from "../../lib/mission/types";
import { aiExplanation, diagnosticTools, explain } from "../mission/diagnostics";

export const missions = new Hono<{ Bindings: ApiBindings }>();

missions.get("/presets", async (c) => {
  const { results } = await database(c.env)
    .prepare("SELECT * FROM scenario_presets ORDER BY id LIMIT 20")
    .all();
  return c.json({
    presets: results.map((row) => ({
      ...row,
      config: JSON.parse(String(row.config_json)) as unknown,
    })),
    warning:
      "Illustrative equipment and crew assumptions, not NASA capacities or safety thresholds",
  });
});

missions.post("/", async (c) => {
  await requireWriteKey(c.req.header("Authorization"), c.env.MISSION_WRITE_KEY);
  const body = object(await c.req.json<unknown>());
  const result = await createSession(
    database(c.env),
    c.env.TELEMETRY_RELEASE ?? "nasa-v1",
    body.config,
  );
  return c.json(result, 201);
});

missions.get("/:id", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const at = c.req.query("at_s");
  return c.json(
    await snapshot(
      db,
      session,
      Date.now(),
      at === undefined ? undefined : number(Number(at), "at_s", 0, 21600),
    ),
  );
});

missions.post("/:id/commands", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  return c.json(await command(db, session, await c.req.json<unknown>()));
});

missions.get("/:id/events", async (c) => {
  const session = await sessionFor(
    database(c.env),
    c.req.param("id"),
    c.req.header("Authorization"),
  );
  return c.json({
    mission_id: session.id,
    revision: session.revision,
    events: JSON.parse(session.events_json) as unknown,
  });
});

missions.post("/:id/assess-return", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const body = object(await c.req.json<unknown>());
  return c.json(
    await returnAssessment(
      db,
      session,
      parseRoute(body.route),
      body.at_s === undefined ? undefined : number(body.at_s, "at_s", 0, 21600),
    ),
  );
});

missions.delete("/:id", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  await db.prepare("DELETE FROM mission_sessions WHERE id=?").bind(session.id).run();
  return c.json({ deleted: session.id });
});

missions.post("/:id/diagnostics", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const body = object(await c.req.json<unknown>());
  if (body.mode !== "deterministic" && body.mode !== "ai")
    throw new MissionError("invalid_mode", "Select deterministic or ai diagnostics", 400);
  const atS = body.at_s === undefined ? undefined : number(body.at_s, "at_s", 0, 21600);
  const result = await snapshot(db, session, Date.now(), atS);
  if (body.mode === "deterministic") return c.json(explain(result));
  await requireWriteKey(c.req.header("X-Diagnostics-Authorization"), c.env.MISSION_WRITE_KEY);
  const explanation = await aiExplanation({
    key: c.env.DIAGNOSTICS_API_KEY,
    model: c.env.DIAGNOSTICS_MODEL,
    question: text(body.question, "question", 2000),
    read: diagnosticTools(db, result),
  });
  return c.json({
    ...explanation,
    mission_id: session.id,
    revision: session.revision,
    evaluated_at_s: result.state.elapsed_s,
    deterministic: explain(result),
  });
});
