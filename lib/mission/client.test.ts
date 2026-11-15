import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, missionApi, uuid } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("mission browser API", () => {
  it("opens a public expedition without sending an admission secret", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "test" }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(missionApi.open()).resolves.toEqual({ id: "test" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/expeditions",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {},
      }),
    );
  });

  it("sends the expected revision and stable receipt on commands", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ revision: 8 }));
    vi.stubGlobal("fetch", fetcher);
    await missionApi.command(
      { id: "session", token: "capability" },
      { type: "replan", option: "turn_back" },
      7,
      "receipt",
    );
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe("/api/missions/session/commands");
    expect(init.headers.Authorization).toBe("Bearer capability");
    expect(JSON.parse(init.body)).toEqual({
      type: "replan",
      option: "turn_back",
      expected_revision: 7,
      command_id: "receipt",
    });
  });

  it("retains structured conflicts and sanitizes network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: "stale_revision", message: "Reload" } }, { status: 409 }),
        ),
    );
    await expect(missionApi.snapshot({ id: "s", token: "t" })).rejects.toMatchObject({
      code: "stale_revision",
      status: 409,
      message: "Reload",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private transport details")));
    await expect(missionApi.snapshot({ id: "s", token: "t" })).rejects.toBeInstanceOf(ApiError);
    await expect(missionApi.snapshot({ id: "s", token: "t" })).rejects.toMatchObject({
      code: "network",
      status: 0,
    });
  });

  it("makes distinct UUID receipts even without randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(uuid()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(uuid()).not.toBe(uuid());
  });
});
