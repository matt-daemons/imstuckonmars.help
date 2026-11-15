import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";
import { z } from "zod";

import { ARCADIA_IMAGERY_BOUNDS } from "../lib/mars/map-data.ts";
import { DISPLAY_ELEVATION_OFFSET_M } from "../lib/mars/terrain.ts";
import { releaseRoot, sha256 } from "./lib/map-assets.ts";

const sourceSchema = z.object({ path: z.string(), sha256: z.string() });
const assetSchema = z.object({ path: z.string(), bytes: z.number(), sha256: z.string() });
for (const filename of [
  "global-imagery-provenance.json",
  "arcadia-imagery-provenance.json",
  "global-elevation-provenance.json",
]) {
  const manifest = z
    .object({ sources: z.array(sourceSchema), assets: z.array(assetSchema) })
    .parse(JSON.parse(await readFile(`${releaseRoot}/${filename}`, "utf8")));
  for (const source of manifest.sources) {
    if (sha256(await readFile(source.path)) !== source.sha256)
      throw new Error(`Source hash mismatch: ${source.path}`);
  }
  for (const asset of manifest.assets) {
    const bytes = await readFile(`${releaseRoot}/${asset.path}`);
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw new Error(`Output hash mismatch: ${asset.path}`);
    if (asset.path.startsWith("global-dem/")) {
      const image = PNG.sync.read(bytes);
      for (let i = 0; i < image.data.length; i += 4) {
        const elevation =
          image.data[i] * 256 +
          image.data[i + 1] +
          image.data[i + 2] / 256 -
          32768 -
          DISPLAY_ELEVATION_OFFSET_M;
        if (elevation < -8177 || elevation > 21171 || image.data[i + 3] !== 255)
          throw new Error(`Bad elevation: ${asset.path}`);
      }
    }
  }
  console.log(
    `${filename}: ${manifest.sources.length} sources and ${manifest.assets.length} assets verified`,
  );
}
const arcadia = z
  .object({ bounds: z.array(z.number()) })
  .parse(JSON.parse(await readFile(`${releaseRoot}/arcadia-imagery-provenance.json`, "utf8")));
if (arcadia.bounds.some((value, index) => value !== ARCADIA_IMAGERY_BOUNDS[index]))
  throw new Error("Arcadia manifest and map bounds disagree");
const localManifest = z
  .object({
    assets: z.array(z.object({ path: z.string(), sha256: z.string() })),
  })
  .parse(JSON.parse(await readFile(`${releaseRoot}/legacy/hab/provenance.json`, "utf8")));
if (localManifest.assets.length !== 21) throw new Error("Local terrain release is incomplete");
for (const asset of localManifest.assets) {
  const bytes = await readFile(`${releaseRoot}/legacy/hab/${asset.path}`);
  if (sha256(bytes) !== asset.sha256)
    throw new Error(`Local elevation hash mismatch: ${asset.path}`);
  const original = PNG.sync.read(bytes);
  const shifted = PNG.sync.read(await readFile(`${releaseRoot}/legacy/display/hab/${asset.path}`));
  for (let i = 0; i < original.data.length; i += 4) {
    const decode = (data: Buffer) => data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
    const height = decode(original.data);
    if (
      height < -5000 ||
      height > -3000 ||
      original.data[i + 3] !== 255 ||
      shifted.data[i + 3] !== 255
    )
      throw new Error(`Invalid local elevation: ${asset.path}`);
    if (decode(shifted.data) - height !== DISPLAY_ELEVATION_OFFSET_M)
      throw new Error(`Irreversible display offset: ${asset.path}`);
  }
}
console.log(`Original local elevation and ${localManifest.assets.length} display copies verified`);
