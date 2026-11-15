import { describe, expect, it } from "vitest";
import { compassDirection, initialBearing } from "./direction";

describe("Mars compass directions", () => {
  it("uses geographic north and handles the longitude seam", () => {
    expect(initialBearing([0, 0], [0, 1])).toBeCloseTo(0);
    expect(initialBearing([0, 0], [1, 0])).toBeCloseTo(90);
    expect(initialBearing([0, 0], [0, -1])).toBeCloseTo(180);
    expect(initialBearing([179, 0], [-179, 0])).toBeCloseTo(90);
    expect(initialBearing([-179, 0], [179, 0])).toBeCloseTo(270);
  });
  it("distinguishes south from southeast and southwest", () => {
    expect(compassDirection(180)).toBe("south");
    expect(compassDirection(135)).toBe("southeast");
    expect(compassDirection(225)).toBe("southwest");
    expect(compassDirection(359)).toBe("north");
  });
});
