import { describe, expect, it } from "vitest";
import { HOMEBASE, orbitalContext } from "./context";

describe("homebase orbital context", () => {
  it("places the base in the same published XYZ tile geometry as the map", () => {
    const result = orbitalContext(HOMEBASE.latitude_deg, HOMEBASE.longitude_deg);
    expect(result.supported).toBe(true);
    expect(result.tiles).toHaveLength(6);
    expect(result.tiles[0]).toBe("https://tiles.imstuckonmars.help/mars-v2/arcadia/12/43/1457.png");
    const x = 43 + (parseFloat(result.marker.left) / 100) * 3;
    const y = 1457 + (parseFloat(result.marker.top) / 100) * 2;
    expect((x / 4096) * 360 - 180).toBeCloseTo(HOMEBASE.longitude_deg, 10);
    expect((Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 4096))) * 180) / Math.PI).toBeCloseTo(
      HOMEBASE.latitude_deg,
      10,
    );
  });
  it("does not relocate Arcadia imagery to another base", () => {
    expect(orbitalContext(18.44, 77.45).supported).toBe(false);
  });
});
