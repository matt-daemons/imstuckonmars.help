import { describe, expect, it } from "vitest";

import { appendCorner, unwrapZoneRing } from "./route-zones";
import type { LngLat } from "./types";

describe("unwrapZoneRing", () => {
  it("takes the short crossing in both directions and keeps source coordinates unchanged", () => {
    const ring: LngLat[] = [
      [179, 45],
      [-179, 46],
      [-178, 47],
    ];
    expect(unwrapZoneRing(ring)).toEqual([
      [179, 45],
      [181, 46],
      [182, 47],
    ]);
    expect(unwrapZoneRing([...ring].reverse())).toEqual([
      [-178, 47],
      [-179, 46],
      [-181, 45],
    ]);
    expect(ring[1]).toEqual([-179, 46]);
  });
  it("keeps ordinary and prime-meridian crossings unchanged", () => {
    expect(
      unwrapZoneRing([
        [-1, 45],
        [1, 46],
      ]),
    ).toEqual([
      [-1, 45],
      [1, 46],
    ]);
    expect(unwrapZoneRing([])).toEqual([]);
  });
});

describe("appendCorner", () => {
  const a: LngLat = [-176, 46];
  const b: LngLat = [-175.99, 46.01];

  it("adds a new corner", () => {
    expect(appendCorner([a], b)).toEqual([a, b]);
  });

  it("returns the same corners when the new one equals the last", () => {
    const draft = [a, b];
    expect(appendCorner(draft, [...b])).toBe(draft);
  });

  it("keeps a corner that equals an earlier, not last, corner", () => {
    expect(appendCorner([a, b], [...a])).toEqual([a, b, a]);
  });
});
