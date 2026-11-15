import { describe, expect, it, vi } from "vitest";
import { surfaceCursor } from "./use-map-cursor";

describe("surface cursor", () => {
  const location = { lng: 179, lat: 45 };
  const fixture = (x: number, y: number) => ({
    unproject: vi.fn(() => location),
    project: vi.fn(() => ({ x, y })),
  });

  it("shows coordinates when the pixel maps back to the same surface point", () => {
    expect(surfaceCursor(fixture(50, 60), { x: 50, y: 60 })).toEqual([179, 45]);
  });

  it("hides the horizon-clamped coordinates returned for empty space", () => {
    expect(surfaceCursor(fixture(100, 60), { x: 50, y: 60 })).toBeNull();
  });
});
