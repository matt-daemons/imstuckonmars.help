import { describe, expect, it } from "vitest";
import { skyPoints, skyPosition } from "./starfield";

describe("illustrative space backdrop", () => {
  const camera = { longitude: 0, latitude: 0, bearing: 0, width: 1000, height: 800 };
  it("uses a repeatable bounded sky instead of regenerating on camera movement", () => {
    expect(skyPoints(10)).toEqual(skyPoints(10));
    for (const point of skyPoints(100)) {
      expect(Math.abs(point.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(point.longitude)).toBeLessThanOrEqual(180);
    }
  });
  it("projects the forward sky and hides directions behind the camera", () => {
    expect(skyPosition({ longitude: 0, latitude: 0 }, camera)).toEqual({ x: 500, y: 400 });
    expect(skyPosition({ longitude: 180, latitude: 0 }, camera)).toBeNull();
    expect(skyPosition({ longitude: 10, latitude: 0 }, camera)?.x).toBeGreaterThan(500);
  });
  it("moves the background with camera bearing and longitude, including across the seam", () => {
    const star = { longitude: 10, latitude: 0 };
    expect(skyPosition(star, { ...camera, longitude: 10 })).toEqual({ x: 500, y: 400 });
    const rotated = skyPosition(star, { ...camera, bearing: 90 });
    expect(rotated?.x).toBeCloseTo(500);
    expect(rotated?.y).toBeLessThan(400);
    expect(
      skyPosition({ longitude: -179, latitude: 0 }, { ...camera, longitude: 179 })?.x,
    ).toBeGreaterThan(500);
  });
});
