import { describe, expect, it, vi } from "vitest";

import { api } from "./app";

describe("public expedition sessions", () => {
  it("fails closed without a rate limiter", async () => {
    const response = await api.request("/api/expeditions", { method: "POST" }, {});
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "access_not_configured" } });
  });

  it("rate limits creation per client address before touching the database", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const response = await api.request(
      "/api/expeditions",
      { method: "POST", headers: { "CF-Connecting-IP": "192.0.2.7" } },
      { EXPEDITION_LIMITER: { limit } },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "192.0.2.7" });
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("reports a missing database instead of failing silently", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    const response = await api.request(
      "/api/expeditions",
      { method: "POST" },
      { EXPEDITION_LIMITER: { limit } },
    );
    expect(response.status).toBe(503);
    expect(limit).toHaveBeenCalledWith({ key: "local" });
  });
});
