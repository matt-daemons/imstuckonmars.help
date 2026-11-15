import { describe, expect, it } from "vitest";
import { fakeSensorFeatures, fakeWindFeatures, FAKE_LAYER_IDS } from "./fake-sensor-layers";
import { FAKE_LAST_FRAME } from "@/lib/mars/fake-sensors";

describe("fake sensor map data", () => {
  it("omits removed soil hardness from generated data", () => {
    expect(fakeSensorFeatures(0).features[0].properties).not.toHaveProperty("hardness");
  });
  it("draws a geographic vector with arrowhead for each station without long seam jumps", () => {
    const field = fakeWindFeatures(1000);
    expect(field.features).toHaveLength(580);
    for (const feature of field.features) {
      expect(feature.geometry.type).toBe("MultiLineString");
      expect(feature.geometry.coordinates.map((line) => line.length)).toEqual([2, 3]);
      for (const line of feature.geometry.coordinates) {
        for (let i = 1; i < line.length; i++)
          expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThanOrEqual(180);
      }
    }
  });
  it("has one station feature per location with all requested measurements", () => {
    const data = fakeSensorFeatures(0);
    expect(data.features).toHaveLength(580);
    expect(data.features[0].properties).toEqual(
      expect.objectContaining({
        id: "FS-001",
        ground: expect.any(Number),
        air: expect.any(Number),
        pressure: expect.any(Number),
        radiation: expect.any(Number),
        humidity: expect.any(Number),
        humidityLabel: expect.stringMatching(/^\d+%$/),
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
    expect(FAKE_LAYER_IDS).toHaveLength(3);
    expect(FAKE_LAYER_IDS.every((id) => id.startsWith("fake-"))).toBe(true);
    expect(new Set(FAKE_LAYER_IDS).size).toBe(FAKE_LAYER_IDS.length);
  });
});
