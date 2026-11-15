import { describe, expect, it } from "vitest";
import { api } from "./app";
import type { ApiBindings } from "./bindings";

describe("route planning API admission", () => {
  const input = {
    mission: "walking",
    start: [-176.05, 45.97],
    end: [-176.045, 45.965],
    samplingMin: 60,
    compare: true,
    zones: [],
  };
  it("rejects invalid inputs before accessing terrain or cache", async () => {
    const response = await api.request(
      "/api/routes/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, sourceUrl: "https://example.com" }),
      },
      {},
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_plan" } });
  });
  it("requires configured planner bindings", async () => {
    const response = await api.request(
      "/api/routes/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      {},
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "planner_unavailable" } });
  });
  it("rate limits before accessing assets", async () => {
    const env = {
      ROUTE_LIMITER: { limit: async () => ({ success: false }) },
      ASSETS: {
        fetch: async () => {
          throw new Error("Must not fetch");
        },
      },
    } as unknown as ApiBindings;
    const response = await api.request(
      "/api/routes/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      env,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
