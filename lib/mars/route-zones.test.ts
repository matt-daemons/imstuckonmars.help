import { describe, expect, it } from "vitest";

import { appendCorner } from "./route-zones";
import type { LngLat } from "./types";

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
