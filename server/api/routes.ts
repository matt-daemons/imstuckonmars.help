import { Hono } from "hono";
import { plannerRequestSchema } from "../../lib/mars/planner-contract";
import { MissionError } from "../../lib/mission/types";
import { cachedRoute } from "../routes/cache";
import { calculateRoute } from "../routes/planner";
import type { ApiBindings } from "./bindings";

export const routes = new Hono<{ Bindings: ApiBindings }>();
routes.post("/plan", async (c) => {
  const parsed = plannerRequestSchema.safeParse(await c.req.json());
  if (!parsed.success)
    throw new MissionError(
      "invalid_plan",
      "Route inputs are invalid or exceed planning limits.",
      400,
    );
  if (!c.env.ROUTE_LIMITER || !c.env.ASSETS)
    throw new MissionError(
      "planner_unavailable",
      "Route planning is not configured. Contact the operator.",
      503,
    );
  const assets = c.env.ASSETS;
  const allowed = await c.env.ROUTE_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "local",
  });
  if (!allowed.success) {
    c.header("Retry-After", "60");
    throw new MissionError(
      "rate_limited",
      "Too many route requests. Wait a minute, then retry.",
      429,
    );
  }
  const cache = await caches.open("ares-route-plans");
  // Vite serves public files outside the ASSETS binding during development.
  const url = new URL(c.req.url);
  const localOrigin =
    import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname)
      ? url.origin
      : undefined;
  const { response, hit } = await cachedRoute(parsed.data, cache, () =>
    calculateRoute(parsed.data, assets, localOrigin),
  );
  c.header("X-Route-Cache", hit ? "HIT" : "MISS");
  return c.json(response);
});
