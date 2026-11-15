import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { terrainPng } from "./png";

describe("Worker terrain PNG decoder", () => {
  it.each([0, 1, 2, 3, 4])("preserves every Terrarium byte with filter %s", async (filterType) => {
    const image = new PNG({ width: 256, height: 256 });
    for (let i = 0; i < image.data.length; i++)
      image.data[i] = (i * 37 + Math.floor(i / 1024)) % 256;
    const encoded = PNG.sync.write(image, { filterType });
    const bytes = new Uint8Array(encoded).buffer;
    expect(await terrainPng(bytes)).toEqual(new Uint8Array(image.data));
  });
  it("rejects oversized images before decompression", async () => {
    const image = new PNG({ width: 257, height: 256 });
    await expect(terrainPng(new Uint8Array(PNG.sync.write(image)).buffer)).rejects.toThrow();
  });
  it("rejects corrupt chunk checksums", async () => {
    const image = new PNG({ width: 256, height: 256 });
    const encoded = new Uint8Array(PNG.sync.write(image));
    encoded[29] ^= 1;
    await expect(terrainPng(encoded.buffer)).rejects.toThrow("Corrupt terrain PNG chunk");
  });
});
