import { describe, expect, it } from "vitest";
import { nearestObservation, observationSegments } from "./plot";

describe("homebase observation plots", () => {
  it("does not join across missing, flagged or absent buckets", () => {
    const rows = [
      { utc_ms: 0, value: 0, count: 1 },
      { utc_ms: 60000, value: 2, count: 1 },
      { utc_ms: 120000, value: null, count: 0 },
      { utc_ms: 180000, value: 3, count: 1 },
      { utc_ms: 420000, value: 4, count: 1 },
    ];
    expect(observationSegments(rows, 60).map((s) => s.length)).toEqual([2, 1, 1]);
    expect(nearestObservation(rows, 300000, 30000)).toBeNull();
    expect(nearestObservation(rows, 120000, 30000)?.value).toBeNull();
    expect(nearestObservation(rows, 0, 30000)?.value).toBe(0);
  });
});
