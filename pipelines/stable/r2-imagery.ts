import { mkdir, readFile } from "node:fs/promises";

import { execa } from "execa";

import {
  displayAdapter,
  download,
  geographicVrt,
  imageTiles,
  json,
  releaseRoot,
} from "../lib/map-assets.ts";

const mode = process.argv[2];
if (mode !== "global" && mode !== "arcadia") throw new Error("Choose global or arcadia imagery");
const work = `data/interim/r2-${mode}`;
await mkdir(work, { recursive: true });
const inputs: string[] = [];
const sources: Awaited<ReturnType<typeof download>>[] = [];
let totalBytes = 0;
const global = mode === "global";
const sourceLevel = global ? 4 : 12;
const service = global
  ? "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0"
  : "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer";
const span = global ? 180 / 2 ** sourceLevel : 512 * 0.0000858306884765625;
const requestedBounds = global ? [-180, -90, 180, 90] : [-176.2, 45.8, -175.8, 46.2];
const [west, south, east, north] = requestedBounds;
const firstColumn = Math.floor((west + 180) / span);
const lastColumn = Math.ceil((east + 180) / span) - 1;
const firstRow = Math.floor((90 - north) / span);
const lastRow = Math.ceil((90 - south) / span) - 1;
const bounds = [
  -180 + firstColumn * span,
  90 - (lastRow + 1) * span,
  -180 + (lastColumn + 1) * span,
  90 - firstRow * span,
];
for (let row = firstRow; row <= lastRow; row++) {
  for (let column = firstColumn; column <= lastColumn; column++) {
    const url = global
      ? `${service}//default/default028mm/${sourceLevel}/${row}/${column}.jpg`
      : `${service}/tile/${sourceLevel}/${row}/${column}`;
    const path = `data/raw/terrain/r2-${mode}/${sourceLevel}-${row}-${column}.jpg`;
    const record = await download(url, path, 300_000);
    totalBytes += record.bytes;
    if (totalBytes > 180_000_000) throw new Error("Imagery source budget exceeded");
    const bytes = await readFile(path);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`Source is not JPEG: ${url}`);
    sources.push(record);
    const vrt = `${work}/${row}-${column}.vrt`;
    await geographicVrt(path, vrt, [
      -180 + column * span,
      90 - (row + 1) * span,
      -180 + (column + 1) * span,
      90 - row * span,
    ]);
    inputs.push(vrt);
  }
  console.log(`${mode}: source row ${row - firstRow + 1}/${lastRow - firstRow + 1}`);
}
await execa("gdalbuildvrt", ["-q", `${work}/mosaic.vrt`, ...inputs]);
await displayAdapter(`${work}/mosaic.vrt`, `${work}/display.vrt`);
const tileBounds = global ? [-180, -85.0511287798, 180, 85.0511287798] : bounds;
const assets = await imageTiles(
  `${work}/display.vrt`,
  mode === "global" ? "viking" : "arcadia",
  global ? 0 : 9,
  global ? 5 : 14,
  tileBounds,
  !global,
);
await json(`${releaseRoot}/${mode}-imagery-provenance.json`, {
  id: `mars-v2-${mode}-imagery`,
  service,
  sourceLevel,
  bounds,
  sourceBytes: totalBytes,
  body: "Mars",
  radiusMeters: 3396190,
  latitudeType: "planetocentric",
  longitudeDirection: "east",
  sourcePixelDegrees: span / (global ? 256 : 512),
  attribution: global ? "NASA/USGS/Ames; NASA Trek" : "NASA/JPL/MSSS/Caltech Murray Lab/Esri",
  limitations: global
    ? [
        "Colorized visual context, not radiometry or elevation",
        "Polar caps beyond 85.051 degrees use renderer fill",
      ]
    : [
        "JPEG-compressed imagery, not elevation",
        "Service says beta01 while catalog says V01",
        "Registration errors may approach 200 m; not for hazard certification",
      ],
  processing:
    "Mars geographic source mosaic reprojected through a display-only angular adapter to Web Mercator XYZ. Edge coverage uses alpha, not invented imagery.",
  sources,
  assets,
});
console.log(`${mode}: ${assets.length} tiles, ${totalBytes} source bytes`);
