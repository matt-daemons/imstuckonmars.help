import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ROUGHNESS_DATA_ROOT, roughnessTiles } from "./ground-layers";

import {
  ARCADIA_IMAGERY_BOUNDS,
  GLOBAL_COLOR_ROOT,
  GLOBAL_COLOR_SOURCE,
  MAP_DATA_ROOT,
  SITE_DATA_ROOT,
  mapAsset,
} from "./map-data";

describe("R2 map delivery", () => {
  it("pins public map objects to one immutable release", () => {
    expect(MAP_DATA_ROOT).toBe("https://tiles.imstuckonmars.help/mars-v2");
    expect(mapAsset("viking/{z}/{x}/{y}.jpg")).toBe(`${MAP_DATA_ROOT}/viking/{z}/{x}/{y}.jpg`);
    expect(mapAsset("global-dem/0/0/0.png")).toBe(`${MAP_DATA_ROOT}/global-dem/0/0/0.png`);
    expect(GLOBAL_COLOR_ROOT).toBe("https://tiles.imstuckonmars.help/viking-native-v1");
    expect(SITE_DATA_ROOT).toBe("https://tiles.imstuckonmars.help/sites-v2");
    expect(ROUGHNESS_DATA_ROOT).toBe(SITE_DATA_ROOT);
    expect(roughnessTiles("https://imstuckonmars.help", "site")).toEqual([
      `${SITE_DATA_ROOT}/sites/site/roughness/{z}/{x}/{y}.webp`,
    ]);
  });

  it("uses bounded tiled imagery instead of downloading a whole regional image", async () => {
    const manifest = z
      .object({
        layers: z.array(
          z.object({
            id: z.string(),
            path: z.string(),
            tiles: z.array(z.string()).optional(),
            minzoom: z.number().optional(),
            maxzoom: z.number().optional(),
            tileBounds: z.array(z.number()).optional(),
            visible: z.boolean().optional(),
          }),
        ),
      })
      .parse(JSON.parse(await readFile("public/data/processed/manifest.json", "utf8")));
    const imagery = manifest.layers.find((layer) => layer.id === "ctx-context");
    expect(imagery?.tiles).toEqual([mapAsset("arcadia/{z}/{x}/{y}.png")]);
    expect(imagery?.minzoom).toBe(9);
    expect(imagery?.maxzoom).toBe(14);
    expect(imagery?.tileBounds).toEqual([...ARCADIA_IMAGERY_BOUNDS]);
    expect(manifest.layers.some((layer) => layer.id === "ai-visual-preview")).toBe(false);
    expect(manifest.layers.some((layer) => layer.id === "mola-base")).toBe(false);
  });

  it("requests native-detail global imagery with matching tile dimensions", () => {
    expect(GLOBAL_COLOR_SOURCE.tiles).toEqual([`${GLOBAL_COLOR_ROOT}/tiles/{z}/{x}/{y}.jpg`]);
    expect(GLOBAL_COLOR_SOURCE.tileSize).toBe(1024);
    expect(GLOBAL_COLOR_SOURCE.minzoom).toBe(0);
    expect(GLOBAL_COLOR_SOURCE.maxzoom).toBe(7);
  });
});
