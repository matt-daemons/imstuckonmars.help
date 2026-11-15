import { describe, expect, it } from "vitest";

import { noRouteText, stripFields, walkMargin } from "./strip-fields";

describe("walkMargin", () => {
  it("measures the margin on the verdict's limiting rule, even when another rule is tighter", () => {
    const route = { max_slope: 17.2, farthest_from_base_km: 1.9, est_time_min: 100 };
    expect(walkMargin(route, "slope")).toMatchObject({
      resource: "walk_slope",
      value: 17.2,
      limit: 20,
    });
  });

  it("takes the tightest of slope, walk-back and suit time when nothing limits the walk", () => {
    const route = { max_slope: 5, farthest_from_base_km: 1, est_time_min: 300 };
    // Suit time with the 1.3 terrain margin is 390 of the 450 usable minutes, the largest share.
    expect(walkMargin(route, null)).toMatchObject({ resource: "suit_supply", value: 390 });
  });
});

describe("stripFields", () => {
  it("names the constraint, then the margin to its no-go limit and the time to shelter", () => {
    const margin = { resource: "walk_slope", value: 17.2, limit: 20, unit: "°" };
    expect(stripFields(margin, 21.6)).toEqual([
      { label: "Walk slope", value: "17.2°" },
      { label: "Margin", value: "2.8°" },
      { label: "Shelter", value: "22 min" },
    ]);
  });

  it("labels the time back as a walk back to the start when the start is not the habitat", () => {
    const margin = { resource: "walk_slope", value: 5, limit: 20, unit: "°" };
    expect(stripFields(margin, 40, "Back to start")[2]).toEqual({
      label: "Back to start",
      value: "40 min",
    });
  });

  it("shows a margin past the limit as negative", () => {
    const margin = { resource: "walk_back", value: 5.44, limit: 2, unit: "km" };
    expect(stripFields(margin, 117)[1]).toEqual({ label: "Margin", value: "−3.44 km" });
  });

  it("counts the margin above a limit the value must stay over, such as battery", () => {
    const margin = {
      resource: "rover_battery",
      value: 67,
      limit: 20,
      unit: "% after the hardest sol",
    };
    expect(stripFields(margin, 0).slice(0, 2)).toEqual([
      { label: "Rover battery", value: "67%" },
      { label: "Margin", value: "47%" },
    ]);
  });
});

describe("noRouteText", () => {
  const walk = { plan: null, loadFailed: false };
  const journey = { plan: null, driveFailed: false, siteFailed: false };

  it("says the terrain is unavailable when it failed to load", () => {
    expect(noRouteText("walking", { ...walk, loadFailed: true }, journey, false)).toBe(
      "Terrain unavailable",
    );
    expect(noRouteText("drive-walk", walk, { ...journey, siteFailed: true }, true)).toBe(
      "Terrain unavailable",
    );
  });

  it("says planning while a plan is on its way", () => {
    expect(noRouteText("walking", walk, journey, false)).toBe("Planning…");
    expect(noRouteText("drive-walk", walk, journey, true)).toBe("Planning…");
  });

  it("says no route when planning ended without one, or no site is chosen", () => {
    const failedWalk = { plan: { summary: null }, loadFailed: false };
    expect(noRouteText("walking", failedWalk, journey, false)).toBe("No route yet");
    expect(noRouteText("drive-walk", walk, journey, false)).toBe("No route yet");
    expect(
      noRouteText("drive-walk", walk, { ...journey, plan: { status: "no_staging" } }, true),
    ).toBe("No route yet");
  });
});
