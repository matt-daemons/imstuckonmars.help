import { describe, expect, it } from "vitest";
import { FAKE_FIELD_PALETTES, FAKE_FIELD_PATCHES, fakeFieldValue, fieldBand } from "./fake-fields";
import { fakeReading } from "./fake-sensors";

describe("synthetic shaded fields", () => {
  it("uses disjoint patches that do not cross the longitude seam", () => {
    expect(FAKE_FIELD_PATCHES.map((patch) => [patch.west, patch.east])).toEqual([
      [-180, -90],
      [-90, 0],
      [0, 90],
      [90, 180],
    ]);
  });
  it("keeps field values identical to the underlying invented station model", () => {
    expect(fakeFieldValue(12, 34, 900, "ground")).toBe(
      fakeReading({ id: "test", position: [12, 34] }, 900).ground,
    );
    expect(fakeFieldValue(-180, 0, 1000, "pressure")).toBeCloseTo(
      fakeFieldValue(180, 0, 1000, "pressure"),
    );
  });
  it("uses seven bounded color bands and different measurement palettes", () => {
    expect(fieldBand(-200, -110, 5)).toBe(0);
    expect(fieldBand(500, -110, 5)).toBe(6);
    expect(Object.values(FAKE_FIELD_PALETTES).every((colors) => colors.length === 7)).toBe(true);
    expect(new Set(Object.values(FAKE_FIELD_PALETTES).map((colors) => colors.join())).size).toBe(5);
  });
});
