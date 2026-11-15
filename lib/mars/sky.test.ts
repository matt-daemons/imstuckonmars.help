import { describe, expect, it } from "vitest";
import { MARS_SKY_COLOR, skyBackground, skyBlend } from "./sky";
import { TERRAIN_MIN_ZOOM } from "./terrain";

describe("space-to-sky transition", () => {
  it("makes room for the starfield only in the globe view", () => {
    expect(skyBlend(1.5)).toBe(0);
    expect(skyBlend(TERRAIN_MIN_ZOOM - 1)).toBe(0.5);
    expect(skyBlend(TERRAIN_MIN_ZOOM)).toBe(1);
  });
  it("preserves dark space for globe views", () => {
    expect(skyBackground(1.5)).toBe("rgb(1,4,5)");
    expect(skyBackground(TERRAIN_MIN_ZOOM - 2)).toBe("rgb(1,4,5)");
  });
  it("fades between space and sky before the terrain threshold", () => {
    expect(skyBackground(TERRAIN_MIN_ZOOM - 1)).toBe("rgb(89,68,55)");
  });
  it("finishes by terrain activation and stays sky at close zooms", () => {
    for (const zoom of [TERRAIN_MIN_ZOOM, 6, 7, 18]) {
      expect(skyBackground(zoom)).toBe(MARS_SKY_COLOR);
    }
  });
  it("is deterministic when zooming back out", () => {
    skyBackground(18);
    expect(skyBackground(2)).toBe("rgb(1,4,5)");
  });
});
