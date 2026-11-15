import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SOURCE_GROUPS } from "./sources";

const entries = SOURCE_GROUPS.flatMap((g) => g.entries);

describe("sources and caveats", () => {
  it("does not advertise the retired AI texture experiment", () => {
    expect(entries.some((entry) => entry.id === "ai-visual-preview")).toBe(false);
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
