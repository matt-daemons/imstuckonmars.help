import { describe, expect, it } from "vitest";

import {
  encodeTerrarium,
  LOCAL_TERRAIN_BOUNDS,
  sampleElevation,
  terrainSourceForView,
  tileLatitude,
  tileLongitude,
} from "./terrain";

describe("Mars terrain display", () => {
  it("round trips negative elevations without an Earth-radius height conversion", () => {
    for (const height of [-8201, -4123.125, -0.5, 0, 21241]) {
      const [r, g, b] = encodeTerrarium(height);
      expect(r * 256 + g + b / 256 - 32768).toBe(height);
    }
    expect(() => encodeTerrarium(Number.NaN)).toThrow();
  });

  it("aligns the local coverage to a complete Web Mercator tile", () => {
    expect(LOCAL_TERRAIN_BOUNDS).toEqual([
      tileLongitude(5, 9),
      tileLatitude(183, 9),
      tileLongitude(6, 9),
      tileLatitude(182, 9),
    ]);
  });

  it("uses local relief only when the whole view is covered", () => {
    expect(terrainSourceForView([-176.1, 45.93, -175.9, 46.07], 12)).toBe("hab-dem");
    expect(terrainSourceForView([-176.1, 45.93, -175.9, 46.07], 8)).toBe("mola-dem");
    expect(terrainSourceForView([-177, 45.93, -175.9, 46.07], 12)).toBe("mola-dem");
    expect(terrainSourceForView([170, 45.93, 184, 46.07], 12)).toBeNull();
  });

  it("does not project bounded elevation data onto the whole globe", () => {
    expect(terrainSourceForView([-180, -80, 180, 80], 1.5)).toBeNull();
    expect(terrainSourceForView([120, -30, 130, -20], 8)).toBeNull();
  });

  it("masks missing samples and never clamps outside coverage to a fake edge", () => {
    const grid = {
      width: 2,
      height: 2,
      west: 0,
      north: 2,
      stepX: 1,
      stepY: 1,
      nodata: -32768,
      values: [-10, -20, -30, -40],
    };
    expect(sampleElevation(grid, 1, 1)).toBe(-25);
    expect(sampleElevation(grid, 0, 1)).toBeNull();
    expect(sampleElevation({ ...grid, values: [-10, -32768, -30, -40] }, 1, 1)).toBeNull();
    expect(sampleElevation({ ...grid, values: [-10, Number.NaN, -30, -40] }, 1, 1)).toBeNull();
  });
});
