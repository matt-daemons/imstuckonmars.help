import { describe, expect, it } from "vitest";
import { DUST_FOOTPRINT, DUST_IMAGE_PATCHES, dustColor, dustField } from "./dust-field";

describe("illustrative geographic dust field", () => {
  it("keeps each image inside one world so terrain cannot clip it at the antimeridian", () => {
    for (const patch of DUST_IMAGE_PATCHES) {
      expect(patch.west).toBeGreaterThanOrEqual(-180);
      expect(patch.east).toBeLessThanOrEqual(180);
      expect(patch.west).toBeLessThan(patch.east);
    }
    const intervals = DUST_IMAGE_PATCHES.map((patch) => [
      patch.west + patch.longitudeOffset,
      patch.east + patch.longitudeOffset,
    ]).sort((a, b) => a[0] - b[0]);
    expect(intervals[0][0]).toBe(DUST_FOOTPRINT.west);
    expect(intervals.at(-1)?.[1]).toBe(DUST_FOOTPRINT.east);
    for (let index = 1; index < intervals.length; index++) {
      expect(intervals[index - 1][1]).toBe(intervals[index][0]);
    }
  });
  it("has a localized, bounded plume instead of a screen-wide haze", () => {
    expect(dustField(-176, 46, 270)).toBeGreaterThan(0.7);
    expect(dustField(DUST_FOOTPRINT.west, DUST_FOOTPRINT.south, 270)).toBeLessThan(0.01);
    expect(dustField(DUST_FOOTPRINT.west, 46, 270)).toBe(0);
    expect(dustField(DUST_FOOTPRINT.east, 46, 270)).toBe(0);
    for (let latitude = 26; latitude <= 66; latitude += 4) {
      for (let longitude = -196; longitude <= -156; longitude += 4) {
        const value = dustField(longitude, latitude, 270);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
  it("responds to wind direction without changing its geographic anchor", () => {
    expect(dustField(-166, 46, 270)).not.toBeCloseTo(dustField(-166, 46, 0), 2);
  });
  it("makes no-dust pixels transparent and uses a distinct high-intensity color", () => {
    expect(dustColor(0)[3]).toBe(0);
    expect(dustColor(1)).toEqual([102, 31, 64, 210]);
  });
});
