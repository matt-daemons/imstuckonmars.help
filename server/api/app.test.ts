import { describe, expect, it } from "vitest";

import { api } from "./app";

describe("api", () => {
  it("reports health", async () => {
    const response = await api.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("labels the live stub as not real data", async () => {
    const response = await api.request("/api/live");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ proxy_source: "Stub — not real data" });
  });

  it("returns JSON for unknown routes", async () => {
    const response = await api.request("/api/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
