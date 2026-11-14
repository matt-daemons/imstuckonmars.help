import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { MissionError } from "../../lib/mission/types";
import type { ApiBindings } from "./bindings";
import { telemetry } from "./telemetry";
import { missions } from "./missions";

export const api = new Hono<{ Bindings: ApiBindings }>().basePath("/api");

api.use("*", bodyLimit({ maxSize: 65536 }));
api.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});

api.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: { code: "http_error", message: error.message } }, error.status);
  if (error instanceof MissionError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof SyntaxError)
    return c.json({ error: { code: "invalid_json", message: "Invalid JSON request" } }, 400);
  if (error.message === "D1_BINDING_UNAVAILABLE")
    return c.json(
      { error: { code: "database_unavailable", message: "D1 binding is not configured" } },
      503,
    );
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ request_id: requestId, path: c.req.path, error: error.message }));
  return c.json(
    { error: { code: "internal_error", message: "Request failed", request_id: requestId } },
    500,
  );
});

api.get("/health", (c) => c.json({ status: "ok" }));
api.route("/telemetry", telemetry);
api.route("/missions", missions);

api.notFound((c) => c.json({ error: "Not found" }, 404));

export type Api = typeof api;
