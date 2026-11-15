import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerTerrainClient } from "./data";

afterEach(() => vi.unstubAllGlobals());

describe("bounded planner raster reads", () => {
  it("accepts only the requested partial bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 206,
            headers: { "Content-Range": "bytes 0-3/100" },
          }),
      ),
    );
    const response = await new PlannerTerrainClient("https://example.com/terrain.tif").request({
      headers: { Range: "bytes=0-3" },
    });
    expect(new Uint8Array(await response.getData())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("rejects full files, shifted ranges and oversized bodies", async () => {
    for (const response of [
      new Response(new Uint8Array(4)),
      new Response(new Uint8Array(4), {
        status: 206,
        headers: { "Content-Range": "bytes 4-7/100" },
      }),
      new Response(new Uint8Array(5), {
        status: 206,
        headers: { "Content-Range": "bytes 0-3/100" },
      }),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response),
      );
      await expect(
        new PlannerTerrainClient("https://example.com/terrain.tif").request({
          headers: { Range: "bytes=0-3" },
        }),
      ).rejects.toThrow();
    }
  });

  it("rejects excessive ranges before downloading", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new PlannerTerrainClient("https://example.com/terrain.tif").request({
        headers: { Range: "bytes=0-8000000" },
      }),
    ).rejects.toThrow("transfer limit");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
