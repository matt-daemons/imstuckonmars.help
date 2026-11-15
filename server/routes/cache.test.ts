import { describe, expect, it, vi } from "vitest";
import { plannerRequestSchema } from "../../lib/mars/planner-contract";
import type { PlannerResult } from "../../lib/mars/planner-contract";
import { cachedRoute, routeCacheKey } from "./cache";

const input = plannerRequestSchema.parse({
  mission: "walking",
  start: [-176.05, 45.97],
  end: [-176.04, 45.97],
  samplingMin: 60,
  compare: false,
  zones: [],
});

describe("backend route caching", () => {
  it("keys every route input and the planner revision without rounding coordinates", async () => {
    const key = await routeCacheKey(input);
    for (const changed of [
      { ...input, start: [-176.05000001, 45.97] },
      { ...input, samplingMin: 61 },
      { ...input, compare: true },
      {
        ...input,
        zones: [
          {
            id: "a",
            name: "A",
            ring: [
              [1, 1],
              [2, 1],
              [2, 2],
            ],
          },
        ],
      },
    ])
      expect(await routeCacheKey(plannerRequestSchema.parse(changed))).not.toBe(key);
    expect(await routeCacheKey(input, "new-terrain")).not.toBe(key);
  });

  it("computes once and serves the identical result on a hit", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: async (request: RequestInfo | URL) =>
        stored.get(String(request instanceof Request ? request.url : request))?.clone(),
      put: async (request: RequestInfo | URL, response: Response) => {
        stored.set(String(request instanceof Request ? request.url : request), response.clone());
      },
    };
    const result: PlannerResult = {
      mission: "walking",
      plan: {
        outbound: {
          status: "no_path",
          path: [],
          distance_m: 0,
          cost: 0,
          max_slope_deg: 0,
          time_min: 0,
          expanded: 2,
        },
        back: {
          status: "no_path",
          path: [],
          distance_m: 0,
          cost: 0,
          max_slope_deg: 0,
          time_min: 0,
          expanded: 2,
        },
        summary: null,
      },
      shortest: null,
      comparison: null,
    };
    const calculate = vi.fn(async () => result);
    const first = await cachedRoute(input, cache, calculate);
    const second = await cachedRoute(input, cache, calculate);
    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(second.response).toEqual(first.response);
    expect(calculate).toHaveBeenCalledOnce();
  });

  it("rejects arbitrary URLs, huge zones and unsupported coordinates", () => {
    expect(plannerRequestSchema.safeParse({ ...input, url: "https://example.com" }).success).toBe(
      false,
    );
    expect(plannerRequestSchema.safeParse({ ...input, start: [181, 45] }).success).toBe(false);
    expect(plannerRequestSchema.safeParse({ ...input, samplingMin: 10000 }).success).toBe(false);
  });

  it("includes power and destination in drive cache keys", async () => {
    const drive = plannerRequestSchema.parse({
      mission: "drive-walk",
      start: input.start,
      siteId: "first",
      power: "fission",
      samplingMin: 60,
      compare: true,
      zones: [],
    });
    const key = await routeCacheKey(drive);
    expect(await routeCacheKey(plannerRequestSchema.parse({ ...drive, power: "solar" }))).not.toBe(
      key,
    );
    expect(
      await routeCacheKey(plannerRequestSchema.parse({ ...drive, siteId: "second" })),
    ).not.toBe(key);
  });

  it("canonicalizes object-key ordering through the request schema", async () => {
    const reordered = {
      zones: input.zones,
      compare: input.compare,
      samplingMin: input.samplingMin,
      end: input.mission === "walking" ? input.end : [0, 0],
      start: input.start,
      mission: input.mission,
    };
    expect(await routeCacheKey(plannerRequestSchema.parse(reordered))).toBe(
      await routeCacheKey(input),
    );
  });

  it("never caches failed computations", async () => {
    const put = vi.fn();
    await expect(
      cachedRoute(input, { match: async () => undefined, put }, async () => {
        throw new Error("Terrain unavailable");
      }),
    ).rejects.toThrow("Terrain unavailable");
    expect(put).not.toHaveBeenCalled();
  });
});
