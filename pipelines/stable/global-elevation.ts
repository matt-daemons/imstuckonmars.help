import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { PNG } from "pngjs";

import {
  DISPLAY_ELEVATION_OFFSET_M,
  encodeTerrarium,
  tileLatitude,
  tileLongitude,
} from "../../lib/mars/terrain.ts";
import { download, json, releaseRoot, sha256 } from "../lib/map-assets.ts";

const base = "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016";
const raw = "data/raw/terrain/mola-global";
const sources = [];
for (const name of [
  "megt90n000eb.lbl",
  "megt90n000eb.img",
  "megc90n000eb.lbl",
  "megc90n000eb.img",
]) {
  sources.push(await download(`${base}/${name}`, `${raw}/${name}`, 34_000_000));
}
const checksumSource = await download(
  "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x_201204.md5",
  `${raw}/archive.md5`,
  100_000,
);
const checksums = await readFile(`${raw}/archive.md5`, "utf8");
for (const source of sources) {
  const filename = source.path.split("/").at(-1);
  const line = checksums
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes(`mgsl_300x\\meg016\\${filename}`));
  const expected = line?.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("md5")
    .update(await readFile(source.path))
    .digest("hex");
  if (actual !== expected) throw new Error(`PDS checksum mismatch: ${filename}`);
}
const label = await readFile(`${raw}/megt90n000eb.lbl`, "utf8");
if (
  !label.includes("MSB_INTEGER") ||
  !/LINE_SAMPLES\s*=\s*5760/.test(label) ||
  !/LINES\s*=\s*2880/.test(label)
) {
  throw new Error("Unexpected MOLA schema; inspect label before decoding");
}
const bytes = await readFile(`${raw}/megt90n000eb.img`);
if (bytes.length !== 5760 * 2880 * 2) throw new Error("Incomplete MOLA product");
const width = 5760;
const height = 2880;
// The archive uses 0..360 east longitude; wrap neighbors across its real seam.
function sample(longitude: number, latitude: number) {
  const x = (((longitude % 360) + 360) % 360) * 16 - 0.5;
  const y = (90 - latitude) * 16 - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (y0 < 0 || y0 + 1 >= height) throw new Error("Outside MOLA interpolation coverage");
  const at = (column: number, row: number) =>
    bytes.readInt16BE((row * width + ((column + width) % width)) * 2);
  const dx = x - x0;
  const dy = y - y0;
  const neighbors = [at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)];
  if (neighbors.some((value) => value < -8177 || value > 21171))
    throw new Error("Unexpected MOLA value; refusing to fill");
  return (
    (neighbors[0] * (1 - dx) + neighbors[1] * dx) * (1 - dy) +
    (neighbors[2] * (1 - dx) + neighbors[3] * dx) * dy
  );
}
const assets = [];
for (let zoom = 0; zoom <= 4; zoom++) {
  for (let x = 0; x < 2 ** zoom; x++) {
    for (let y = 0; y < 2 ** zoom; y++) {
      const tile = new PNG({ width: 256, height: 256 });
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const elevation = sample(
            tileLongitude(x + (px + 0.5) / 256, zoom),
            tileLatitude(y + (py + 0.5) / 256, zoom),
          );
          tile.data.set(
            [...encodeTerrarium(elevation + DISPLAY_ELEVATION_OFFSET_M), 255],
            (py * 256 + px) * 4,
          );
        }
      }
      const path = `global-dem/${zoom}/${x}/${y}.png`;
      const output = `${releaseRoot}/${path}`;
      const encoded = PNG.sync.write(tile);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, encoded);
      assets.push({ path, bytes: encoded.length, sha256: sha256(encoded) });
    }
  }
}
await json(`${releaseRoot}/global-elevation-provenance.json`, {
  product: "MEGT90N000EB.IMG",
  dataset: "MGS-M-MOLA-5-MEGDR-L3-V1.0",
  version: "2.0",
  sources,
  checksumSource,
  sourceGrid: {
    width,
    height,
    degreesPerPixel: 0.0625,
    longitudeDomain: [0, 360],
    latitudeType: "planetocentric",
    radiusMeters: 3396000,
  },
  units: "m",
  verticalDatum: "GMM3 mgm1025 areoid to degree/order 50",
  displayOffsetMeters: DISPLAY_ELEVATION_OFFSET_M,
  processing:
    "Decode signed big-endian Int16; bilinear periodic longitude sampling; Terrarium encoding for display. Subtract display offset for archive-derived height.",
  limitations: [
    "Coarse approximately 3.7 km grid, not local hazard terrain",
    "Archive fills empty bins by interpolation; counts product distinguishes shot support",
    "Label radius 3396000 differs from regional sphere 3396190; use angular display alignment, not a merged quantitative DEM",
    "Do not use global or display tiles for route safety calculations",
  ],
  attribution: "NASA/MGS/MOLA Science Team; PDS Geosciences",
  assets,
});
console.log(`Generated ${assets.length} coarse global elevation tiles.`);
