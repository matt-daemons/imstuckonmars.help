import { Evented } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { constrainGlobeCamera } from "./globe-camera";
import { watchImageryLoading } from "./imagery-loading";

describe("globe camera", () => {
  it("levels the whole-planet view without changing close-up pitch", () => {
    expect(constrainGlobeCamera({ zoom: 1.5, pitch: 52 })).toEqual({ pitch: 0 });
    expect(constrainGlobeCamera({ zoom: 3, pitch: 52 })).toEqual({ pitch: 0 });
    expect(constrainGlobeCamera({ zoom: 15.2, pitch: 52 })).toEqual({ pitch: 52 });
    expect(constrainGlobeCamera({ zoom: 15, pitch: 0 })).toEqual({ pitch: 0 });
  });
  it("allows increasing tilt smoothly as regional terrain becomes visible", () => {
    let previous = 0;
    for (let zoom = 3; zoom <= 5; zoom += 0.01) {
      const { pitch } = constrainGlobeCamera({ zoom, pitch: 85 });
      expect(pitch).toBeGreaterThanOrEqual(previous);
      expect(pitch - previous).toBeLessThan(0.65);
      previous = pitch;
    }
    expect(constrainGlobeCamera({ zoom: 5, pitch: 85 }).pitch).toBe(85);
  });
});

class ImageryMap extends Evented {
  moving = false;
  loaded = true;
  isMoving() {
    return this.moving;
  }
  areTilesLoaded() {
    return this.loaded;
  }
}

describe("imagery loading feedback", () => {
  afterEach(() => vi.useRealTimers());

  it("never announces tile churn during a camera flight or a brief post-flight load", () => {
    vi.useFakeTimers();
    const map = new ImageryMap();
    const changed = vi.fn();
    const dispose = watchImageryLoading(map, changed);
    map.moving = true;
    map.loaded = false;
    map.fire("movestart");
    map.fire("dataloading");
    vi.advanceTimersByTime(2000);
    expect(changed).not.toHaveBeenCalledWith(true);
    map.moving = false;
    map.fire("moveend");
    vi.advanceTimersByTime(300);
    map.loaded = true;
    map.fire("idle");
    vi.advanceTimersByTime(2000);
    expect(changed).not.toHaveBeenCalledWith(true);
    dispose();
  });

  it("reports sustained loading after settling and clears it on movement or completion", () => {
    vi.useFakeTimers();
    const map = new ImageryMap();
    map.loaded = false;
    const changed = vi.fn();
    const dispose = watchImageryLoading(map, changed);
    vi.advanceTimersByTime(500);
    map.fire("sourcedata");
    vi.advanceTimersByTime(250);
    expect(changed).toHaveBeenLastCalledWith(true);
    map.moving = true;
    map.fire("movestart");
    expect(changed).toHaveBeenLastCalledWith(false);
    map.moving = false;
    map.fire("moveend");
    vi.advanceTimersByTime(750);
    expect(changed).toHaveBeenLastCalledWith(true);
    map.loaded = true;
    map.fire("idle");
    expect(changed).toHaveBeenLastCalledWith(false);
    map.loaded = false;
    map.fire("dataloading");
    dispose();
    changed.mockClear();
    vi.advanceTimersByTime(1000);
    map.fire("moveend");
    expect(changed).not.toHaveBeenCalled();
  });
});
