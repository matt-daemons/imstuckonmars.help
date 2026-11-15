import { readFileSync } from "node:fs";

import type { Fetcher } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DriveWalkPlan } from "../../lib/mars/drive-walk";
import type { PlannerRequest } from "../../lib/mars/planner-contract";
import { marsDistanceM } from "../../lib/mars/routing";
import type { LngLat } from "../../lib/mars/types";
import { ROVER_RULES } from "../../lib/flight-rules/rover-rules";

import { beyondRoverRange, calculateRoute, greatCircle } from "./planner";

const planDriveWalk = vi.hoisted(() => vi.fn());
vi.mock("../../lib/mars/drive-walk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mars/drive-walk")>()),
  planDriveWalk,
}));

// Terrain stand-ins: the planner's A* is mocked, so only the shapes matter.
vi.mock("./data", async () => {
  const { gridFromEquirect } = await import("../../lib/mars/route-grid");
  const sites = JSON.parse(readFileSync("public/data/processed/sites.geojson", "utf8"));
  return {
    plannerAssets: () => ({ json: async () => sites, signal: new AbortController().signal }),
    loadPlannerDrive: async () => ({
      ...gridFromEquirect(
        { width: 4, height: 4, west: 180, north: 47, degreesPerPixel: 0.5, nodata: null },
        new Int16Array(16),
      ),
      thermalInertia: new Int16Array(16),
    }),
    loadPlannerSite: vi.fn(async () => ({ boulders: [] })),
  };
});

const HABITAT: LngLat = [-176.05, 45.97];
const SITES = {
  // 93, 194, 424 and 468 km from the habitat (CLAUDE.md §9).
  near: {
    id: "DTEEC_033225_2250_033146_2250_A01",
    hiriseId: "ESP_033225_2250",
    poi: [-176.33383, 44.41589],
  },
  edge: {
    id: "DTEEC_034082_2260_033014_2260_A01",
    hiriseId: "ESP_034082_2260",
    poi: [-171.38243, 45.64829],
  },
  far: {
    id: "DTEEC_037352_2245_037418_2245_A01",
    hiriseId: "ESP_037352_2245",
    poi: [-166.14298, 44.39035],
  },
  across: {
    id: "DTEEC_054060_2265_054126_2265_A01",
    hiriseId: "ESP_054060_2265",
    poi: [172.56388, 46.07022],
  },
} satisfies Record<string, { id: string; hiriseId: string; poi: LngLat }>;

const request = (siteId: string): PlannerRequest => ({
  mission: "drive-walk",
  start: HABITAT,
  siteId,
  power: "solar",
  samplingMin: 60,
  zones: [],
  compare: true,
});

const assets = {} as Fetcher;

beforeEach(() => planDriveWalk.mockReset());

describe("beyondRoverRange", () => {
  it("answers NO-GO on the range rule for a site beyond it, with its straight-line distance", () => {
    const plan = beyondRoverRange(SITES.far, HABITAT);

    expect(plan?.verdict).toMatchObject({ verdict: "NO_GO", limiting_factor: "range" });
    expect(plan?.verdict?.reasons[0]).toMatch(/^The site is 424 km from base in a straight line/);
    expect(plan?.verdict?.reasons.at(-1)).toMatch(/^Not planned/);
    const route = plan?.collection?.route;
    expect(route).toMatchObject({
      verdict: "NO_GO",
      limiting_factor: "range",
      simulated: true,
      margin: { resource: "rover_range", limit: ROVER_RULES.range.no_go_above_km, unit: "km" },
    });
    expect(route?.margin.value).toBeCloseTo(424, 0);
    expect(route?.distance_km).toBeCloseTo(2 * 424, -1);
  });

  it("leaves sites within the range, or near its edge, to the planner", () => {
    expect(beyondRoverRange(SITES.near, HABITAT)).toBeNull();
    expect(beyondRoverRange(SITES.edge, HABITAT)).toBeNull();
  });

  it("keeps sites whose staging point could still fall inside the range", () => {
    // A POI 1 km past the limit: a staging point up to the walk-back limit nearer could pass.
    const poi: LngLat = [HABITAT[0], HABITAT[1] + (201 / 3396.19) * (180 / Math.PI)];
    expect(beyondRoverRange({ ...SITES.far, poi }, HABITAT)).toBeNull();
  });

  it("draws the two drive legs as straight lines out and back, labelled not planned", () => {
    const features = beyondRoverRange(SITES.far, HABITAT)?.collection?.features ?? [];

    expect(features.map((feature) => feature.properties)).toMatchObject([
      { leg: 1, mode: "drive", from: "base", to: SITES.far.id, simulated: true },
      { leg: 2, mode: "drive", from: SITES.far.id, to: "base", simulated: true },
    ]);
    const out = features[0].geometry.coordinates as LngLat[];
    expect(out[0]).toEqual(HABITAT);
    expect(out.at(-1)).toEqual(SITES.far.poi);
  });
});

describe("greatCircle", () => {
  it("crosses ±180° without a jump and ends on the destination", () => {
    const line = greatCircle(HABITAT, SITES.across.poi);

    for (let i = 1; i < line.length; i++)
      expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThan(1);
    const end = line.at(-1)!;
    expect(end[0]).toBeCloseTo(SITES.across.poi[0] - 360, 6);
    expect(end[1]).toBe(SITES.across.poi[1]);
  });

  it("steps about 10 km and stays on the straight-line distance", () => {
    const line = greatCircle(HABITAT, SITES.far.poi);
    const steps = line.slice(1).map((point, i) => marsDistanceM(line[i], point) / 1000);
    const total = steps.reduce((sum, km) => sum + km, 0);

    expect(Math.max(...steps)).toBeLessThan(10.5);
    expect(total).toBeCloseTo(marsDistanceM(HABITAT, SITES.far.poi) / 1000, 0);
  });
});

describe("calculateRoute (drive + walk)", () => {
  it("answers a site beyond the rover range without planning a route", async () => {
    const result = await calculateRoute(request(SITES.far.id), assets);

    expect(planDriveWalk).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mission: "drive-walk",
      shortest: null,
      boulders: [],
      comparison: null,
      plan: { status: "ok", verdict: { verdict: "NO_GO", limiting_factor: "range" } },
    });
  });

  it("does not plan the shortest route when the first plan is NO-GO on range", async () => {
    planDriveWalk.mockReturnValue({
      status: "drive_failed",
      collection: null,
      drive: null,
      walk: null,
      staging: null,
      verdict: { verdict: "NO_GO", limiting_factor: "range", reasons: ["too far"] },
    } satisfies DriveWalkPlan);

    const result = await calculateRoute(request(SITES.edge.id), assets);

    expect(planDriveWalk).toHaveBeenCalledTimes(1);
    expect(result.shortest).toBeNull();
  });

  it("still plans the shortest route for comparison otherwise", async () => {
    planDriveWalk.mockReturnValue({
      status: "drive_failed",
      collection: null,
      drive: null,
      walk: null,
      staging: null,
      verdict: { verdict: "CAUTION", limiting_factor: "range", reasons: ["far"] },
    } satisfies DriveWalkPlan);

    await calculateRoute(request(SITES.edge.id), assets);

    expect(planDriveWalk).toHaveBeenCalledTimes(2);
    expect(planDriveWalk.mock.calls[1].at(-1)).toBe("shortest");
  });
});
