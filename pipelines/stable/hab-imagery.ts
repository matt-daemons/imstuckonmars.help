import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

const service = "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer";
const raw = "data/raw/terrain/ctx";
const work = "data/interim/ctx";
const output = "public/data/terrain/ctx";
await Promise.all([raw, work, output].map((path) => mkdir(path, { recursive: true })));
const metadataResponse = await fetch(`${service}?f=pjson`);
if (!metadataResponse.ok) throw new Error(`Imagery metadata: ${metadataResponse.status}`);
await writeFile(join(raw, "service.json"), await metadataResponse.text());

const level = 12;
const resolution = 0.0000858306884765625;
const span = 512 * resolution;
const westColumn = Math.floor((-176.1 + 180) / span);
const eastColumn = Math.floor((-175.9 + 180) / span);
const northRow = Math.floor((90 - 46.07) / span);
const southRow = Math.floor((90 - 45.93) / span);
const rasters: string[] = [];
const sources: { url: string; path: string; sha256: string; bytes: number }[] = [];
for (let row = northRow; row <= southRow; row++) {
  for (let column = westColumn; column <= eastColumn; column++) {
    const url = `${service}/tile/${level}/${row}/${column}`;
    const path = join(raw, `${level}-${row}-${column}.jpg`);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Imagery tile: ${response.status} ${url}`);
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`Not an image: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path, bytes);
    }
    sources.push({
      url,
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
    const vrt = join(work, `${row}-${column}.vrt`);
    await execa("gdal_translate", [
      "-q",
      "-of",
      "VRT",
      "-a_srs",
      "+proj=longlat +R=3396190 +no_defs",
      "-a_ullr",
      String(-180 + column * span),
      String(90 - row * span),
      String(-180 + (column + 1) * span),
      String(90 - (row + 1) * span),
      path,
      vrt,
    ]);
    rasters.push(vrt);
  }
}
const mosaic = join(work, "mosaic.vrt");
await execa("gdalbuildvrt", ["-q", mosaic, ...rasters]);
// Display adapter only: Mapbox interprets Mars angular positions on an Earth-sized Mercator.
// Retain the genuine Mars CRS on source VRTs; never use this adapter for distances or analysis.
const adapter = join(work, "display-adapter.vrt");
await execa("gdal_translate", ["-q", "-of", "VRT", "-a_srs", "EPSG:4326", mosaic, adapter]);
const warped = join(work, "display.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  "EPSG:3857",
  "-r",
  "bilinear",
  adapter,
  warped,
]);
await execa("gdal_translate", ["-q", "-of", "PNG", warped, join(work, "context.png")]);
await copyFile(join(work, "context.png"), join(output, "context.png"));
await copyFile(join(raw, "12-1001-89.jpg"), join(output, "ai-input.jpg"));
const corners = [
  [-180 + westColumn * span, 90 - northRow * span],
  [-180 + (eastColumn + 1) * span, 90 - northRow * span],
  [-180 + (eastColumn + 1) * span, 90 - (southRow + 1) * span],
  [-180 + westColumn * span, 90 - (southRow + 1) * span],
];
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      id: "ares-hab-ctx-v1",
      retrievedAt: new Date().toISOString(),
      service,
      sources,
      corners,
      sourceProduct: "Murray Lab CTX mosaic, Esri service",
      sourceVersionCaveat:
        "ArcGIS item is titled V01; service description calls it beta01. This release pins retrieved bytes, not a resolved version label.",
      radiusMeters: 3396190,
      latitudeType: "planetocentric",
      longitudeDirection: "east",
      nativeMosaicNominalMeters: 5,
      serviceLevel: level,
      servicePixelDegrees: resolution,
      processing:
        "Lossy JPEG service tiles mosaicked in Mars geographic coordinates, then resampled to Mapbox display Mercator. Display adapter is not a scientific Earth CRS assignment.",
      limitations: [
        "Imagery only, not elevation, slope or proof of traversability.",
        "Mosaic registration errors can approach 200 m; do not interpret image/DEM agreement as survey accuracy.",
        "Service interpolation and JPEG compression are retained; no quantitative radiometry.",
      ],
      attribution: "NASA/JPL/MSSS/Caltech Murray Lab/Esri",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared ${sources.length} CTX tiles at the unchanged HAB site.`);
