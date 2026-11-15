import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("published map placeholders", () => {
  it("retains the habitat without the retired crater marker", () => {
    const stops = JSON.parse(readFileSync("public/data/processed/stops.geojson", "utf8"));
    expect(
      stops.features.map((feature: { properties: { id: string } }) => feature.properties.id),
    ).toEqual(["base"]);
  });

  it("does not publish the hand-drawn route to the retired crater", () => {
    const manifest = JSON.parse(readFileSync("public/data/processed/manifest.json", "utf8"));
    expect(manifest.layers.some((layer: { id: string }) => layer.id === "route")).toBe(false);
    expect(existsSync("public/data/processed/route.geojson")).toBe(false);
  });
});
