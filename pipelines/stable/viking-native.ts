import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat } from "node:fs/promises";

import { execa } from "execa";
import { z } from "zod";

import { download, exists, json, sha256 } from "../lib/map-assets.ts";

const config = z
  .object({
    directory: z.string(),
    outputLimitBytes: z.number(),
    tileSize: z.literal(1024),
    maxZoom: z.literal(7),
  })
  .parse(JSON.parse(await readFile("pipelines/viking-native-release.json", "utf8")));
const source = "data/raw/terrain/viking-native/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif";
const expectedBytes = 12_742_411_029;
const partial = `${source}.partial`;
if (!(await exists(source))) {
  if ((await stat(partial)).size !== expectedBytes)
    throw new Error("Source download is incomplete");
  await rename(partial, source);
}
if ((await stat(source)).size !== expectedBytes) throw new Error("Unexpected source byte length");
const label = await download(
  "https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/f760f110-93bd-4d0e-8256-6d3af337426f/download/mars_viking_mdim21_clrmosaic_global_232m_pds3.lbl",
  "data/raw/terrain/viking-native/source.lbl",
  100_000,
);
const work = "data/interim/viking-native";
await mkdir(work, { recursive: true });
await mkdir(config.directory, { recursive: true });
await json(`${config.directory}/source-label.json`, {
  url: label.url,
  sha256: label.sha256,
  text: await readFile(label.path, "utf8"),
});
const { stdout } = await execa("gdalinfo", ["-json", source]);
const header = z
  .object({
    size: z.tuple([z.number(), z.number()]),
    coordinateSystem: z.object({ wkt: z.string() }),
    geoTransform: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  })
  .parse(JSON.parse(stdout));
if (
  header.size[0] !== 92160 ||
  header.size[1] !== 46080 ||
  !header.coordinateSystem.wkt.includes("3396190")
)
  throw new Error("Unexpected Viking dimensions or Mars body");
const degreesPerMeter = 180 / (Math.PI * 3396190);
const [originX, pixelX, rotationX, originY, rotationY, pixelY] = header.geoTransform;
if (
  Math.abs(originX * degreesPerMeter + 180) > 0.00001 ||
  Math.abs(originY * degreesPerMeter - 90) > 0.00001 ||
  Math.abs(pixelX * degreesPerMeter - 1 / 256) > 0.00000001 ||
  Math.abs(pixelY * degreesPerMeter + 1 / 256) > 0.00000001 ||
  rotationX !== 0 ||
  rotationY !== 0
)
  throw new Error("Unexpected source extent or grid orientation");
await json(`${config.directory}/source-header.json`, JSON.parse(stdout));
const digest = createHash("sha256");
const multipart = createHash("md5");
let parts = 0;
// The source server advertises an S3 multipart ETag with 1,520 eight-MiB parts.
for await (const chunk of createReadStream(source, { highWaterMark: 8 * 1024 * 1024 })) {
  digest.update(chunk);
  multipart.update(createHash("md5").update(chunk).digest());
  parts++;
}
const sourceHash = digest.digest("hex");
const multipartEtag = `${multipart.digest("hex")}-${parts}`;
if (multipartEtag !== "efb446a3deef9aea7e8aba2e13bfbbaa-1520")
  throw new Error("Source multipart ETag does not match the server");
console.log(`Source verified by length/header; SHA-256 ${sourceHash}`);

// Lossless tiled source prevents repeated full scanline reads while warping small tiles.
const tiled = `${work}/source-tiled.tif`;
if (!(await exists(tiled))) {
  await execa(
    "gdal_translate",
    [
      "-of",
      "GTiff",
      "-co",
      "TILED=YES",
      "-co",
      "COMPRESS=LZW",
      "-co",
      "BIGTIFF=YES",
      "-co",
      "NUM_THREADS=8",
      source,
      `${tiled}.partial`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  await rename(`${tiled}.partial`, tiled);
}
const adapter = `${work}/display.vrt`;
// Source remains Mars-native. This angular adapter is only for Mapbox display tiling.
await execa("gdal_translate", [
  "-q",
  "-of",
  "VRT",
  "-a_srs",
  "EPSG:4326",
  "-a_ullr",
  "-180",
  "90",
  "180",
  "-90",
  tiled,
  adapter,
]);
await execa(
  "gdal",
  [
    "raster",
    "tile",
    "--min-zoom",
    "0",
    "--max-zoom",
    String(config.maxZoom),
    "--tile-size",
    String(config.tileSize),
    "--format",
    "JPEG",
    "--co",
    "QUALITY=95",
    "--no-alpha",
    "--resampling",
    "bilinear",
    "--overview-resampling",
    "average",
    "--convention",
    "xyz",
    "--webviewer",
    "none",
    "--resume",
    "--num-threads",
    "8",
    adapter,
    `${config.directory}/tiles`,
  ],
  { stdout: "inherit", stderr: "inherit", env: { GDAL_CACHEMAX: "1024" } },
);
const assets = [];
let totalBytes = 0;
for (let zoom = 0; zoom <= config.maxZoom; zoom++) {
  for (let x = 0; x < 2 ** zoom; x++) {
    for (let y = 0; y < 2 ** zoom; y++) {
      const path = `tiles/${zoom}/${x}/${y}.jpg`;
      const bytes = await readFile(`${config.directory}/${path}`);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`Invalid JPEG ${path}`);
      totalBytes += bytes.length;
      if (totalBytes > config.outputLimitBytes) throw new Error("Approved output budget exceeded");
      assets.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
}
await json(`${config.directory}/provenance.json`, {
  id: "viking-native-v1",
  source: "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif",
  resolvedSource:
    "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif",
  sourceBytes: expectedBytes,
  sourceSha256: sourceHash,
  sourceMultipartEtag: multipartEtag,
  label,
  dimensions: header.size,
  nativePixelMeters: 231.5417872,
  radiusMeters: 3396190,
  metadataConflict:
    "Detached PDS label lists a 3376.2 km polar radius; actual GeoTIFF uses a 3396.19 km sphere. Display follows the GeoTIFF grid.",
  latitudeType: "planetocentric",
  longitudeDirection: "east",
  sourceLongitudeDomain: [-180, 180],
  tileSize: config.tileSize,
  maxZoom: config.maxZoom,
  tileCount: assets.length,
  totalBytes,
  attribution: "NASA/Viking; USGS Astrogeology; NASA Ames",
  processing:
    "Lossless source tiling, geographic display adapter, bilinear Web Mercator reprojection, average overviews, JPEG quality 95. No AI, recoloring, hillshade or elevation substitution.",
  limitations: [
    "Colorized Viking mosaic, not true-color calibrated radiometry",
    "Native grid spacing is not positional accuracy",
    "Web Mercator does not sample beyond 85.05112878 degrees latitude; pole fill is not imagery",
    "Close-up detail remains limited by Viking source resolution",
  ],
});
await json(`${config.directory}/catalog.json`, {
  id: "viking-native-v1",
  sourceBytes: expectedBytes,
  totalBytes,
  assets,
});
console.log(`Prepared ${assets.length} native-detail tiles, ${totalBytes} bytes`);
