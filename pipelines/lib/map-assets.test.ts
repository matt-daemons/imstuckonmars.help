import { describe, expect, it } from "vitest";

import { latTile, lonTile } from "./map-assets";

describe("Mars display tile indexing", () => {
  it("maps longitude seams and equator to standard XYZ positions", () => {
    expect(lonTile(-180, 3)).toBe(0);
    expect(lonTile(0, 3)).toBe(4);
    expect(lonTile(180 - 1e-9, 3)).toBe(7);
    expect(latTile(0, 3)).toBe(4);
  });

  it("keeps the unchanged Arcadia base within the expected tiles", () => {
    expect(lonTile(-176.05, 12)).toBe(44);
    expect(latTile(45.97, 12)).toBe(1457);
  });
});
