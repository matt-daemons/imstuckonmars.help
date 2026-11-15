import { cp, mkdir, readFile } from "node:fs/promises";
import { z } from "zod";

import { exists, json, releaseRoot } from "./lib/map-assets.ts";

// Preserve original terrain and AI provenance alongside the new release.
await mkdir(`${releaseRoot}/legacy`, { recursive: true });
// The first migration reads public assets. Subsequent builds retain the archived R2 input.
if (await exists("public/data/terrain")) {
  await cp("public/data/terrain", `${releaseRoot}/legacy`, { recursive: true });
}
if (!(await exists(`${releaseRoot}/legacy/hab/provenance.json`))) {
  throw new Error("Original terrain archive missing; restore it from the published R2 release");
}
await mkdir(`${releaseRoot}/source-products`, { recursive: true });
await cp("data/raw/terrain/mola-global", `${releaseRoot}/source-products/mola-global`, {
  recursive: true,
});
await cp(
  "data/raw/terrain/mola-hrsc-hab-subset.tif",
  `${releaseRoot}/source-products/mola-hrsc-hab-subset.tif`,
);
await cp(
  "data/raw/terrain/mola-hrsc-source.json",
  `${releaseRoot}/source-products/mola-hrsc-source.json`,
);
const imagery = z.object({
  sourceBytes: z.number(),
  bounds: z.array(z.number()),
  assets: z.array(z.unknown()),
});
const global = imagery.parse(
  JSON.parse(await readFile(`${releaseRoot}/global-imagery-provenance.json`, "utf8")),
);
const arcadia = imagery.parse(
  JSON.parse(await readFile(`${releaseRoot}/arcadia-imagery-provenance.json`, "utf8")),
);
const elevation = z
  .object({ sources: z.array(z.object({ bytes: z.number() })), assets: z.array(z.unknown()) })
  .parse(JSON.parse(await readFile(`${releaseRoot}/global-elevation-provenance.json`, "utf8")));
const sourceBytes =
  global.sourceBytes +
  arcadia.sourceBytes +
  elevation.sources.reduce((sum, source) => sum + source.bytes, 0);
if (sourceBytes > 500_000_000) throw new Error("Approved source budget exceeded");
await json(`${releaseRoot}/catalog.json`, {
  id: "mars-v2",
  sourceDownloadLimitBytes: 500000000,
  sourceBytes,
  datasets: [
    {
      id: "viking",
      kind: "imagery",
      provenance: "global-imagery-provenance.json",
      minZoom: 0,
      maxZoom: 5,
      tiles: global.assets.length,
    },
    {
      id: "arcadia",
      kind: "imagery",
      provenance: "arcadia-imagery-provenance.json",
      minZoom: 9,
      maxZoom: 14,
      bounds: arcadia.bounds,
      tiles: arcadia.assets.length,
    },
    {
      id: "global-dem",
      kind: "elevation",
      provenance: "global-elevation-provenance.json",
      minZoom: 0,
      maxZoom: 4,
      tiles: elevation.assets.length,
    },
  ],
  notes: [
    "Imagery and elevation are independent products",
    "Display terrain uses a reversible 10000 m offset",
    "Source global elevation includes archive interpolation; counts retained separately",
    "No global high-resolution coverage or operational hazard validation claimed",
  ],
});
