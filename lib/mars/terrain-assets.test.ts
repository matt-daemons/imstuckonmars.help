import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DISPLAY_ELEVATION_OFFSET_M, LOCAL_TERRAIN_BOUNDS } from "./terrain";

const terrainManifest = z.object({
  bounds: z.array(z.number()),
  tileCount: z.number(),
  assets: z.array(z.object({ path: z.string(), sha256: z.string() })),
});

describe("packaged terrain release", () => {
  it("ships the complete small global imagery pyramid with source hashes", async () => {
    const manifest = z
      .object({
        sources: z.array(z.object({ url: z.string(), sha256: z.string() })),
        assets: z.array(z.object({ path: z.string(), sha256: z.string() })),
      })
      .parse(JSON.parse(await readFile("public/data/terrain/globe/provenance.json", "utf8")));
    expect(manifest.sources).toHaveLength(32);
    expect(manifest.assets).toHaveLength(85);
    for (let zoom = 0; zoom <= 3; zoom++) {
      for (let x = 0; x < 2 ** zoom; x++) {
        for (let y = 0; y < 2 ** zoom; y++) {
          const path = `${zoom}/${x}/${y}.jpg`;
          const asset = manifest.assets.find((entry) => entry.path === path);
          const bytes = await readFile(`public/data/terrain/globe/${path}`);
          expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset?.sha256);
          expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
        }
      }
    }
  });

  it("ships every declared elevation tile, with finite negative Mars elevations and no transparent pixels", async () => {
    const manifest = terrainManifest.parse(
      JSON.parse(await readFile("public/data/terrain/hab/provenance.json", "utf8")),
    );
    expect(manifest.bounds).toEqual([...LOCAL_TERRAIN_BOUNDS]);
    expect(manifest.assets).toHaveLength(21);
    expect(manifest.tileCount).toBe(manifest.assets.length);
    for (const asset of manifest.assets) {
      const bytes = await readFile(`public/data/terrain/hab/${asset.path}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      const png = PNG.sync.read(bytes);
      expect([png.width, png.height]).toEqual([256, 256]);
      for (let i = 0; i < png.data.length; i += 4) {
        const elevation = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
        // Broad independent plausibility bound, not an accuracy claim.
        if (elevation < -5000 || elevation > -3000 || png.data[i + 3] !== 255) {
          throw new Error(`Invalid elevation in ${asset.path} at pixel ${i / 4}`);
        }
      }
    }
  });

  it("keeps generated imagery optional and separate from terrain", async () => {
    const manifest = z
      .object({
        layers: z.array(
          z.object({ id: z.string(), path: z.string(), visible: z.boolean().optional() }),
        ),
      })
      .parse(JSON.parse(await readFile("public/data/processed/manifest.json", "utf8")));
    const ai = manifest.layers.find((layer) => layer.id === "ai-visual-preview");
    expect(ai?.visible).toBe(false);
    expect(ai?.path).toBe("../terrain/ctx/ai-map.png");
    for (const layer of manifest.layers) {
      await expect(readFile(`public/data/processed/${layer.path}`)).resolves.toBeInstanceOf(Buffer);
    }
  });

  it("applies a reversible display offset without changing relative relief", async () => {
    for (const [originalPath, displayPath] of [
      ["hab/9/5/182.png", "display/hab/9/5/182.png"],
      ["mola/terrain/8/2/91.png", "display/mola/8/2/91.png"],
    ]) {
      const original = PNG.sync.read(await readFile(`public/data/terrain/${originalPath}`));
      const display = PNG.sync.read(await readFile(`public/data/terrain/${displayPath}`));
      for (let i = 0; i < original.data.length; i += 4) {
        const value = (data: Buffer) => data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        if (value(display.data) - value(original.data) !== DISPLAY_ELEVATION_OFFSET_M) {
          throw new Error(`Display offset changed relief at ${originalPath}:${i / 4}`);
        }
      }
    }
  });
});
