import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GLOBAL_COLOR_SOURCE } from "../../lib/mars/map-data";

describe("native Viking release contract", () => {
  it("preserves an equatorial sample grid finer than the source without excessive objects", async () => {
    const config = z
      .object({
        tileSize: z.number(),
        maxZoom: z.number(),
        sourceDownloadLimitBytes: z.number(),
        outputLimitBytes: z.number(),
      })
      .parse(JSON.parse(await readFile("pipelines/viking-native-release.json", "utf8")));
    expect(config.tileSize).toBe(GLOBAL_COLOR_SOURCE.tileSize);
    expect(config.maxZoom).toBe(GLOBAL_COLOR_SOURCE.maxzoom);
    const displayMetersPerPixel = (2 * Math.PI * 3396190) / (config.tileSize * 2 ** config.maxZoom);
    expect(displayMetersPerPixel).toBeLessThan(231.5417872);
    expect((4 ** (config.maxZoom + 1) - 1) / 3).toBe(21845);
    expect(config.sourceDownloadLimitBytes).toBeGreaterThanOrEqual(12742411029);
    expect(config.outputLimitBytes).toBe(15000000000);
  });
});
