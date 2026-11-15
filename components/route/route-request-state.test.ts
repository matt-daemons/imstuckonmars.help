import { describe, expect, it } from "vitest";
import { routeRequestState, type LoadedRouteRequest } from "./route-request-state";
import { planWalk, slopeDegrees } from "@/lib/mars/routing";
import type { RouteGrid } from "@/lib/mars/route-grid";

describe("route calculation state", () => {
  const failed: LoadedRouteRequest = {
    key: "old",
    attempt: 0,
    state: { kind: "failed", message: "Request failed" },
  };

  it("starts pending before the debounce or response and stays idle without a request", () => {
    expect(routeRequestState(null, 0, null).kind).toBe("idle");
    expect(routeRequestState("walk", 0, null).kind).toBe("pending");
  });

  it("hides obsolete responses and errors when inputs change or a retry starts", () => {
    expect(routeRequestState("new", 0, failed).kind).toBe("pending");
    expect(routeRequestState("old", 1, failed).kind).toBe("pending");
    expect(routeRequestState(null, 0, failed).kind).toBe("idle");
  });

  it("shows the current outcome without claiming an error is still calculating", () => {
    expect(routeRequestState("old", 0, failed)).toEqual(failed.state);
  });
  it("finishes when the current response arrives, including a no-path result", () => {
    const grid: RouteGrid = {
      width: 1,
      height: 1,
      west: 0,
      east: 0.01,
      rowEdges: new Float64Array([0.01, 0]),
      heights: new Float32Array(1),
    };
    const ready: LoadedRouteRequest = {
      key: "walk",
      attempt: 1,
      state: {
        kind: "ready",
        cache: "hit",
        response: {
          key: "walk",
          version: "test",
          result: {
            mission: "walking",
            plan: planWalk(
              grid,
              slopeDegrees(grid),
              new Uint8Array([1]),
              [0.005, 0.005],
              [0.005, 0.005],
            ),
            shortest: null,
            comparison: null,
          },
        },
      },
    };
    expect(routeRequestState("walk", 1, ready)).toEqual(ready.state);
    expect(routeRequestState("changed", 1, ready).kind).toBe("pending");
  });
});
