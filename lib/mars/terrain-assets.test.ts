import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DISPLAY_ELEVATION_OFFSET_M } from "./terrain";

describe("archived terrain release", () => {
  it("retains negative source elevations in an opaque real-data fixture", async () => {
    const png = PNG.sync.read(await readFile("lib/mars/fixtures/hab-source.png"));
    expect([png.width, png.height]).toEqual([256, 256]);
    for (let i = 0; i < png.data.length; i += 4) {
      const elevation = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
      if (elevation < -5000 || elevation > -3000 || png.data[i + 3] !== 255) {
        throw new Error(`Invalid fixture elevation at pixel ${i / 4}`);
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
    expect(ai?.path).toBe("https://tiles.imstuckonmars.help/mars-v2/legacy/ctx/ai-map.png");
    for (const layer of manifest.layers) {
      if (!layer.path.startsWith("https://")) {
        await expect(readFile(`public/data/processed/${layer.path}`)).resolves.toBeInstanceOf(
          Buffer,
        );
      }
    }
  });

  it("applies a reversible display offset without changing relative relief", async () => {
    for (const [originalPath, displayPath] of [
      ["hab-source.png", "hab-display.png"],
      ["mola-source.png", "mola-display.png"],
    ]) {
      const original = PNG.sync.read(await readFile(`lib/mars/fixtures/${originalPath}`));
      const display = PNG.sync.read(await readFile(`lib/mars/fixtures/${displayPath}`));
      for (let i = 0; i < original.data.length; i += 4) {
        const value = (data: Buffer) => data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        if (value(display.data) - value(original.data) !== DISPLAY_ELEVATION_OFFSET_M) {
          throw new Error(`Display offset changed relief at ${originalPath}:${i / 4}`);
        }
      }
    }
  });
});
