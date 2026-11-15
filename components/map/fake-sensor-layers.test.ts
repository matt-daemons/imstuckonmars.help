import { describe, expect, it } from "vitest";
import { fakeSensorFeatures, FAKE_LAYER_IDS } from "./fake-sensor-layers";
import { FAKE_LAST_FRAME } from "@/lib/mars/fake-sensors";

describe("fake sensor map data", () => {
  it("has one station feature per location with all requested measurements", () => {
    const data = fakeSensorFeatures(0);
    expect(data.features).toHaveLength(580);
    expect(data.features[0].properties).toEqual(
      expect.objectContaining({
        id: "FS-001",
        ground: expect.any(Number),
        air: expect.any(Number),
        hardness: expect.any(Number),
        pressure: expect.any(Number),
        radiation: expect.any(Number),
        humidity: expect.any(Number),
        windSpeed: expect.any(Number),
        windBearing: expect.any(Number),
        storm: expect.any(Number),
      }),
    );
    expect(fakeSensorFeatures(FAKE_LAST_FRAME).features[0].properties).not.toEqual(
      data.features[0].properties,
    );
  });
  it("owns only fake-prefixed layers for complete cleanup", () => {
    expect(FAKE_LAYER_IDS).toHaveLength(9);
    expect(FAKE_LAYER_IDS.every((id) => id.startsWith("fake-"))).toBe(true);
    expect(new Set(FAKE_LAYER_IDS).size).toBe(FAKE_LAYER_IDS.length);
  });
});
