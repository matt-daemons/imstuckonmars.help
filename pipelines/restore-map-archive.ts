import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { MAP_DATA_ROOT } from "../lib/mars/map-data.ts";
import { download, releaseRoot, sha256 } from "./lib/map-assets.ts";

const response = await fetch(`${MAP_DATA_ROOT}/release.json`);
if (!response.ok) throw new Error("Published release inventory unavailable");
const manifest = z
  .object({
    objects: z.array(
      z.object({
        path: z.string(),
        bytes: z.number(),
        sha256: z.string(),
      }),
    ),
  })
  .parse(await response.json());
for (const object of manifest.objects) {
  if (!object.path.startsWith("legacy/") && !object.path.startsWith("source-products/")) continue;
  if (object.path.includes("..") || !/^[a-zA-Z0-9_./-]+$/.test(object.path))
    throw new Error("Invalid archive path");
  const path = `${releaseRoot}/${object.path}`;
  await download(`${MAP_DATA_ROOT}/${object.path}`, path, object.bytes);
  const bytes = await readFile(path);
  if (bytes.length !== object.bytes || sha256(bytes) !== object.sha256)
    throw new Error(`Archive hash mismatch: ${object.path}`);
}
for (const filename of ["mola-hrsc-hab-subset.tif", "mola-hrsc-source.json"]) {
  const path = `data/raw/terrain/${filename}`;
  await mkdir(dirname(path), { recursive: true });
  // Restore only absent local source files; never overwrite a retained source.
  try {
    await writeFile(path, await readFile(`${releaseRoot}/source-products/${filename}`), {
      flag: "wx",
    });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  }
}
