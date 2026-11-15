import { describe, expect, it } from "vitest";
import { bounds } from "./camera";

describe("camera framing", () => {
  it("fits points the short way around the Mars antimeridian", () => {
    expect(
      bounds([
        [179, 45],
        [-179, 46],
      ]),
    ).toEqual([
      [179, 45],
      [181, 46],
    ]);
  });
  it("retains a single target and normal coordinate bounds", () => {
    expect(bounds([[-176, 45]])).toEqual([
      [-176, 45],
      [-176, 45],
    ]);
    expect(
      bounds([
        [-176, 45],
        [-174, 47],
        [-175, 46],
      ]),
    ).toEqual([
      [-176, 45],
      [-174, 47],
    ]);
  });
});
