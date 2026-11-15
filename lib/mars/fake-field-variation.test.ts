import { describe, expect, it } from "vitest";
import { fakeFieldVariation } from "./fake-field-variation";
import { fakeReading } from "./fake-sensors";

describe("synthetic regional variation", () => {
  it("is deterministic and joins across the longitude seam and poles", () => {
    expect(fakeFieldVariation(40, 20, 3)).toEqual(fakeFieldVariation(40, 20, 3));
    for (const key of ["weather", "regional", "local", "terrain"] as const) {
      expect(fakeFieldVariation(-180, 32, 2)[key]).toBeCloseTo(
        fakeFieldVariation(180, 32, 2)[key],
        12,
      );
      expect(fakeFieldVariation(0, 90, 2)[key]).toBeCloseTo(
        fakeFieldVariation(120, 90, 2)[key],
        12,
      );
    }
  });
  it("changes gradually across adjacent locations and ten-second samples", () => {
    const first = fakeFieldVariation(30, 45, 2);
    const near = fakeFieldVariation(30.001, 45.001, 2.0001);
    expect(Math.abs(first.weather - near.weather)).toBeLessThan(0.001);
    expect(fakeFieldVariation(30, 45, 3).weather).not.toBe(first.weather);
    const sensor = { id: "test", position: [30, 45] as [number, number] };
    expect(
      Math.abs(fakeReading(sensor, 1000).ground - fakeReading(sensor, 1001).ground),
    ).toBeLessThan(0.1);
  });
  it("creates different regional patches without moving the terrain pattern", () => {
    expect(fakeFieldVariation(0, 25, 0).weather).not.toBe(fakeFieldVariation(90, 25, 0).weather);
    expect(fakeFieldVariation(40, 20, 0).terrain).toBe(fakeFieldVariation(40, 20, 7).terrain);
  });
});
