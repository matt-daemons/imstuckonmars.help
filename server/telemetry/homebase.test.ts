import { describe, expect, it } from "vitest";
import { availableDays, metricRange } from "./homebase";

describe("homebase archived data selection", () => {
  const day = (sol: number) => [
    { sol, sensor: "ats", processing_level: "calibrated", sample_count: 10 },
    { sol, sensor: "ps", processing_level: "derived", sample_count: 10 },
    { sol, sensor: "rhs", processing_level: "derived", sample_count: 10 },
  ];
  it("selects only days with every preferred acquired sensor, not catalog or empty products", () => {
    expect(
      availableDays([...day(816), ...day(242).map((p) => ({ ...p, sample_count: 0 })), day(10)[0]]),
    ).toEqual([816]);
    expect(availableDays(day(10).map((p) => ({ ...p, processing_level: "catalog" })))).toEqual([]);
  });
  it("keeps missing values separate from zero in displayed ranges", () => {
    expect(
      metricRange([
        { utc_ms: 0, value: null, count: 0 },
        { utc_ms: 1, value: 0, count: 1 },
        { utc_ms: 2, value: 2, count: 1 },
      ]),
    ).toEqual({ minimum: 0, maximum: 2 });
    expect(metricRange([{ utc_ms: 0, value: null, count: 0 }])).toEqual({
      minimum: null,
      maximum: null,
    });
  });
});
