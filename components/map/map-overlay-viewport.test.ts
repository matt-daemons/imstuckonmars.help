import { describe, expect, it } from "vitest";
import { overlayInsets } from "./map-overlay-viewport";

describe("full-screen map overlay insets", () => {
  it("keeps camera targets clear of the desktop sidebar and HUD", () => {
    expect(overlayInsets({ left: 0, bottom: 1000 }, { left: 360, bottom: 955 })).toEqual({
      left: 360,
      bottom: 45,
      top: 0,
      right: 0,
    });
  });
  it("returns sidebar space to the map when collapsed or on mobile", () => {
    expect(overlayInsets({ left: 0, bottom: 1000 }, { left: 0, bottom: 955 })).toEqual({
      left: 0,
      bottom: 45,
      top: 0,
      right: 0,
    });
  });
  it("does not produce negative padding during layout transitions", () => {
    expect(overlayInsets({ left: 10, bottom: 900 }, { left: 0, bottom: 1000 })).toEqual({
      left: 0,
      bottom: 0,
      top: 0,
      right: 0,
    });
  });
});
