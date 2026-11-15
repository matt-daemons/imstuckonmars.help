import { describe, expect, it } from "vitest";
import {
  FAKE_LAST_FRAME,
  FAKE_LAYERS,
  FAKE_SENSORS,
  FAKE_SOL_COUNT,
  FAKE_SOL_SECONDS,
  FAKE_SAMPLE_SECONDS,
  FAKE_DURATION_SECONDS,
  fakeElapsedSeconds,
  INITIAL_FAKE_VISIBILITY,
  fakeFrame,
  fakeReading,
  fakeTimeLabel,
} from "./fake-sensors";

describe("fictional future sensor network", () => {
  it("covers all longitudes, both hemispheres and poles with stable unique stations", () => {
    expect(FAKE_SENSORS).toHaveLength(290);
    expect(new Set(FAKE_SENSORS.map((sensor) => sensor.id)).size).toBe(290);
    expect(Math.min(...FAKE_SENSORS.map((sensor) => sensor.position[1]))).toBe(-90);
    expect(Math.max(...FAKE_SENSORS.map((sensor) => sensor.position[1]))).toBe(90);
    expect(new Set(FAKE_SENSORS.map((sensor) => sensor.position[0])).size).toBe(25);
  });

  it("spans seven full Martian solar days, including the final boundary", () => {
    expect(FAKE_LAST_FRAME).toBe(62143);
    expect(FAKE_SAMPLE_SECONDS).toBe(10);
    expect(FAKE_SOL_COUNT * FAKE_SOL_SECONDS).toBeCloseTo(621426.708);
    expect(fakeTimeLabel(0)).toBe("SOL 01 · 00:00:00");
    expect(fakeTimeLabel(8878)).toMatch(/^SOL 02/);
    expect(fakeTimeLabel(FAKE_LAST_FRAME - 1)).toMatch(/^SOL 07/);
    expect(fakeTimeLabel(FAKE_LAST_FRAME)).toBe("End of SOL 07");
    expect(fakeElapsedSeconds(6)).toBe(60);
    expect(fakeElapsedSeconds(FAKE_LAST_FRAME)).toBe(FAKE_DURATION_SECONDS);
  });

  it("produces repeatable bounded values at every sensor throughout seven SOLs", () => {
    expect(fakeFrame(20)).toEqual(fakeFrame(20));
    for (let frame = 0; frame <= FAKE_LAST_FRAME; frame += 367) {
      for (const reading of fakeFrame(frame)) {
        for (const layer of FAKE_LAYERS) {
          if (layer.id === "sensors" || layer.id === "wind") continue;
          expect(reading[layer.id]).toBeGreaterThanOrEqual(layer.low);
          expect(reading[layer.id]).toBeLessThanOrEqual(layer.high);
        }
        expect(reading.windSpeed).toBeGreaterThanOrEqual(0);
        expect(reading.windSpeed).toBeLessThanOrEqual(35);
        expect(reading.windBearing).toBeGreaterThanOrEqual(0);
        expect(reading.windBearing).toBeLessThan(360);
        expect(reading.storm).toBeGreaterThanOrEqual(0);
        expect(reading.storm).toBeLessThanOrEqual(1);
      }
    }
  });

  it("changes with time and location without any observation input", () => {
    expect(fakeReading(FAKE_SENSORS[0], 0)).not.toEqual(fakeReading(FAKE_SENSORS[0], 12));
    expect(fakeReading(FAKE_SENSORS[120], 4000).ground).not.toEqual(
      fakeReading(FAKE_SENSORS[125], 4000).ground,
    );
    expect(Object.values(INITIAL_FAKE_VISIBILITY).filter(Boolean)).toHaveLength(1);
    expect(FAKE_LAYERS).toHaveLength(8);
  });
});
