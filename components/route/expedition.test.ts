import { describe, expect, it } from "vitest";

import { SOL_MINUTES, type DriveWalkPlan } from "@/lib/mars/drive-walk";
import { buildTimeline, stateAt, type ExpeditionLeg } from "@/lib/mars/expedition";
import type { LngLat } from "@/lib/mars/types";

import { followedRoute, formatElapsed, simulationSummary } from "./expedition";

const safest = { status: "ok" } as DriveWalkPlan;
const shortest = { status: "ok" } as DriveWalkPlan;
const failed = { status: "walk_failed" } as DriveWalkPlan;

describe("followedRoute", () => {
  it("plays the route the operator chose", () => {
    expect(followedRoute({ plan: safest, shortest }, "safest")).toEqual({
      plan: safest,
      following: "safest",
      isFallback: false,
    });
    expect(followedRoute({ plan: safest, shortest }, "shortest")).toEqual({
      plan: shortest,
      following: "shortest",
      isFallback: false,
    });
  });

  it("waits while the shortest route is planned, and falls back to the safest when it fails", () => {
    expect(followedRoute({ plan: safest, shortest: null }, "shortest")).toEqual({
      plan: null,
      following: "shortest",
      isFallback: false,
    });
    expect(followedRoute({ plan: safest, shortest: failed }, "shortest")).toEqual({
      plan: safest,
      following: "safest",
      isFallback: true,
    });
  });
});

describe("formatElapsed", () => {
  it("writes sols/h:min with a sol count", () => {
    expect(formatElapsed(0)).toBe("0/00:00");
    expect(formatElapsed(245.9)).toBe("0/04:05");
    expect(formatElapsed(2 * SOL_MINUTES + 61)).toBe("2/01:01");
  });
});

describe("simulationSummary", () => {
  const a: LngLat = [10, 0];
  const b: LngLat = [10.1, 0];
  const legs: ExpeditionLeg[] = [
    {
      phase: "drive_out",
      mode: "drive",
      coordinates: [a, b],
      distanceKm: 6,
      startMin: 0,
      travelMin: 60,
      stopMin: 0,
      endMin: 60,
      stepWh: [1000],
    },
    {
      phase: "walk_out",
      mode: "walk",
      coordinates: [b, a],
      distanceKm: 1,
      startMin: 60,
      travelMin: 30,
      stopMin: 30,
      endMin: 120,
      stepWh: [],
    },
    {
      phase: "walk_back",
      mode: "walk",
      coordinates: [a, b],
      distanceKm: 1,
      startMin: 120,
      travelMin: 30,
      stopMin: 0,
      endMin: 150,
      stepWh: [],
    },
    {
      phase: "drive_back",
      mode: "drive",
      coordinates: [b, a],
      distanceKm: 6,
      startMin: 150,
      travelMin: 60,
      stopMin: 0,
      endMin: 210,
      stepWh: [1000],
    },
  ];
  const timeline = buildTimeline(legs, "fission");

  it("reports the current phase, distances and resources against their reserves, as simulated", () => {
    const summary = simulationSummary(timeline, stateAt(timeline, 30), "playing", {
      plan: safest,
      following: "safest",
      isFallback: false,
    });
    expect(summary).toMatchObject({
      state: "playing",
      phase: "drive_out",
      elapsed_min: 30,
      total_min: 210,
      distance_done_km: 3,
      distance_total_km: 14,
      rover_battery_wh: { remaining: 199500, reserve: 40000, capacity: 200000 },
      suit_oxygen_min: { remaining: 480, reserve: 30 },
    });
    expect(summary.labels[0]).toMatch(/simulated/i);
    expect(summary.labels[1]).toBe("Following the safest route.");
  });

  it("says when the safest route stands in for the shortest", () => {
    const summary = simulationSummary(timeline, stateAt(timeline, 100), "paused", {
      plan: safest,
      following: "safest",
      isFallback: true,
    });
    expect(summary.phase).toBe("sampling");
    expect(summary.labels[1]).toMatch(/shortest route could not be planned/);
  });
});
