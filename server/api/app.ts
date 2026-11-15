import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { MissionError } from "../../lib/mission/types";
import type { ApiBindings } from "./bindings";
import { telemetry } from "./telemetry";
import { missions } from "./missions";
import { expeditions } from "./expeditions";
import { verdict } from "./verdict";
import { copilot } from "./copilot";
import { spaceWeather } from "./space-weather";
import type { LiveSnapshot } from "@/lib/mars/types";
import { missingDatabaseSchema } from "../db/errors";

export const api = new Hono<{ Bindings: ApiBindings }>().basePath("/api");

const jsonLimit = bodyLimit({ maxSize: 65536 });
// Speech audio uploads carry their own, larger limit on the transcribe route.
api.use("*", (c, next) =>
  /^\/api\/copilot\/[^/]+\/transcribe$/.test(c.req.path) ? next() : jsonLimit(c, next),
);
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
  if (missingDatabaseSchema(error))
    return c.json(
      {
        error: {
          code: "database_not_initialized",
          message:
            "Mission database is not initialized. Apply the database migrations and import a published telemetry release; see docs/BACKEND.md.",
        },
      },
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
api.route("/expeditions", expeditions);
api.route("/verdict", verdict);
api.route("/copilot", copilot);
api.route("/space-weather", spaceWeather);

// Stub until team role D's replay.ts output lands in data/processed/live/.
api.get("/live", (c) => {
  const snapshot: LiveSnapshot = {
    timestamp: new Date().toISOString(),
    sol: 0,
    lmst: "12:00:00",
    radiation_dose_rate: 0,
    solar_alert_level: "none",
    dust_opacity: 0,
    temp: 0,
    wind: 0,
    sun_elevation: 0,
    proxy_source: "Stub — not real data",
  };
  return c.json(snapshot);
});

api.notFound((c) => c.json({ error: "Not found" }, 404));

export type Api = typeof api;
