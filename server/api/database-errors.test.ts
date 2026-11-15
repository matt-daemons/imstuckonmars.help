import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  createDatabase: () => {
    throw new Error("Failed query: delete from mission_sessions; params: hidden", {
      cause: new Error("D1_ERROR: no such table: mission_sessions: SQLITE_ERROR"),
    });
  },
}));

import { api } from "./app";

describe("uninitialized local database", () => {
  it("returns an actionable unavailable response without exposing SQL or parameters", async () => {
    const response = await api.request(
      "/api/expeditions",
      { method: "POST" },
      { EXPEDITION_LIMITER: { limit: async () => ({ success: true }) }, DB: {} },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "database_not_initialized" } });
    expect(body.error.message).toContain("migrations");
    expect(body.error.message).not.toContain("delete from");
    expect(body.error.message).not.toContain("hidden");
  });
});
