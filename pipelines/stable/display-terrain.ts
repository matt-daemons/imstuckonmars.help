// Keep archive-derived tiles untouched. The shifted copies are for Mapbox's camera only.
import { createHash } from "node:crypto";
import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { PNG } from "pngjs";

import { DISPLAY_ELEVATION_OFFSET_M, encodeTerrarium } from "../../lib/mars/terrain.ts";

const outputs: { path: string; sha256: string }[] = [];
for (const dataset of ["mola", "hab"]) {
  const inputRoot =
    dataset === "mola" ? "public/data/terrain/mola/terrain" : "public/data/terrain/hab";
  for await (const path of glob(`${inputRoot}/*/*/*.png`)) {
    const input = PNG.sync.read(await readFile(path));
    for (let i = 0; i < input.data.length; i += 4) {
      if (input.data[i + 3] !== 255) throw new Error(`Missing source elevation: ${path}`);
      const height = input.data[i] * 256 + input.data[i + 1] + input.data[i + 2] / 256 - 32768;
      input.data.set(encodeTerrarium(height + DISPLAY_ELEVATION_OFFSET_M), i);
    }
    const output = path.replace(inputRoot, `public/data/terrain/display/${dataset}`);
    const bytes = PNG.sync.write(input);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    outputs.push({ path: output, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
}
await writeFile(
  "public/data/terrain/display/provenance.json",
  JSON.stringify(
    {
      purpose: "Mapbox display-only datum shift; not a scientific elevation grid",
      offsetMeters: DISPLAY_ELEVATION_OFFSET_M,
      inverse: "Mars elevation = decoded display elevation - offsetMeters",
      sourceElevationsPreserved: true,
      limitations:
        "Regional copies retain the original MOLA pipeline's outer-edge clamping. Local source tiles fail on missing samples.",
      outputs,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Shifted ${outputs.length} display tiles; originals unchanged.`);
