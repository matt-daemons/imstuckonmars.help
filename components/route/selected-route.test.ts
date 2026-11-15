import { describe, expect, it } from "vitest";
import { selectedRoute } from "./selected-route";
import type { RoutePlanResult } from "./use-route-plan-result";

describe("route selection shared by map, launch and inspection", () => {
  const safest = { label: "safest fixture" };
  const shortest = { label: "shortest fixture" };
  const routes = {
    walk: { plan: safest, shortest },
    journey: { plan: safest, shortest },
  } as unknown as RoutePlanResult;
  it("uses the selected route for both walking and driving", () => {
    expect(selectedRoute({ route: null }, routes)).toEqual({
      choice: "safest",
      walk: safest,
      trip: safest,
    });
    expect(selectedRoute({ route: "shortest" }, routes)).toEqual({
      choice: "shortest",
      walk: shortest,
      trip: shortest,
    });
  });
  it("does not silently substitute another route while shortest is unavailable", () => {
    const unavailable = {
      walk: { plan: safest, shortest: null },
      journey: { plan: safest, shortest: null },
    } as unknown as RoutePlanResult;
    expect(selectedRoute({ route: "shortest" }, unavailable)).toEqual({
      choice: "shortest",
      walk: null,
      trip: null,
    });
  });
});
