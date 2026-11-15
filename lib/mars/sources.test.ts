import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SOURCE_GROUPS } from "./sources";
import { FAKE_LAYERS, FAKE_SENSOR_COUNT, FAKE_SENSOR_VERSION } from "./fake-sensors";

const entries = SOURCE_GROUPS.flatMap((g) => g.entries);

describe("sources and caveats", () => {
  it("credits all fictional sensor layers to the versioned LARA model, not NASA", () => {
    const source = entries.find((entry) => entry.id === "fake-sensors");
    expect(source?.kind).toBe("simulated");
    expect(source?.credit).toContain("LARA");
    expect(source?.detail).toContain(String(FAKE_SENSOR_COUNT));
    expect(source?.detail).toContain(FAKE_SENSOR_VERSION);
    for (const layer of FAKE_LAYERS) expect(source?.use).toContain(layer.label);
    expect(source?.caveats.join(" ")).toContain("not NASA observations");
    expect(source?.links?.some((link) => link.url.endsWith("/docs/FAKE_SENSOR_MODE.md"))).toBe(
      true,
    );
  });
  it("does not advertise the retired AI texture experiment", () => {
    expect(entries.some((entry) => entry.id === "ai-visual-preview")).toBe(false);
  });
  it("retains elevation sources without the optional colored hillshade", () => {
    expect(entries.some((entry) => entry.id === "mola-base")).toBe(false);
    expect(entries.some((entry) => entry.id === "terrain-mola")).toBe(true);
    expect(entries.some((entry) => entry.id === "terrain-hab")).toBe(true);
  });
  it("covers every layer in the manifest", async () => {
    const manifest = JSON.parse(await readFile("public/data/processed/manifest.json", "utf8")) as {
      layers: { id: string }[];
    };
    const covered = new Set(entries.flatMap((e) => e.layerIds ?? []));
    expect(manifest.layers.map((l) => l.id).filter((id) => !covered.has(id))).toEqual([]);
  });

  it("gives every entry a credit and at least one caveat", () => {
    for (const e of entries) {
      expect(e.credit, e.id).not.toBe("");
      expect(e.caveats.length, e.id).toBeGreaterThan(0);
    }
  });

  it("uses unique ids", () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
