import { describe, expect, it } from "vitest";
import { ARCADIA_IMAGERY_BOUNDS, HOMEBASE, contextMinZoom, hasSurfaceContext } from "./context";

describe("homebase orbital context", () => {
  it("includes the existing base in the acquired imagery footprint", () => {
    expect(hasSurfaceContext(HOMEBASE.latitude_deg, HOMEBASE.longitude_deg)).toBe(true);
  });
  it("does not relocate Arcadia imagery to another base", () => {
    expect(hasSurfaceContext(18.44, 77.45)).toBe(false);
  });
  it("fills wide, tall and resized viewports without leaving the imagery bounds", () => {
    const [west, south, east, north] = ARCADIA_IMAGERY_BOUNDS;
    const mercatorY = (latitude: number) =>
      Math.asinh(Math.tan((latitude * Math.PI) / 180)) / (2 * Math.PI);
    for (const [width, height] of [
      [900, 300],
      [300, 900],
      [400, 400],
      [1200, 700],
    ]) {
      const zoom = contextMinZoom(width, height);
      const world = 512 * 2 ** zoom;
      expect(width / world).toBeLessThanOrEqual((east - west) / 360 + 1e-12);
      expect(height / world).toBeLessThanOrEqual(mercatorY(north) - mercatorY(south) + 1e-12);
    }
  });
});
