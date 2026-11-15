// Small global context release, reprojected offline from NASA Trek's geographic matrix.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

const base = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0";
const raw = "data/raw/terrain/viking";
const work = "data/interim/viking";
const output = "public/data/terrain/globe";
await Promise.all([raw, work, output].map((path) => mkdir(path, { recursive: true })));
const sourceLevel = 2;
const sources: { url: string; sha256: string }[] = [];
const inputs: string[] = [];
for (let row = 0; row < 4; row++) {
  for (let column = 0; column < 8; column++) {
    const url = `${base}//default/default028mm/${sourceLevel}/${row}/${column}.jpg`;
    const path = join(raw, `${row}-${column}.jpg`);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Viking imagery request failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path, bytes);
    }
    sources.push({ url, sha256: createHash("sha256").update(bytes).digest("hex") });
    const vrt = join(work, `${row}-${column}.vrt`);
    // Geographic angles assigned to the display adapter only, not Earth science data.
    await execa("gdal_translate", [
      "-q",
      "-of",
      "VRT",
      "-a_srs",
      "EPSG:4326",
      "-a_ullr",
      String(-180 + column * 45),
      String(90 - row * 45),
      String(-135 + column * 45),
      String(45 - row * 45),
      path,
      vrt,
    ]);
    inputs.push(vrt);
  }
}
await execa("gdalbuildvrt", ["-q", join(work, "global.vrt"), ...inputs]);
const edge = "20037508.342789244";
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  "EPSG:3857",
  "-te",
  `-${edge}`,
  `-${edge}`,
  edge,
  edge,
  "-ts",
  "2048",
  "2048",
  "-r",
  "bilinear",
  join(work, "global.vrt"),
  join(work, "display.tif"),
]);
const assets: { path: string; sha256: string }[] = [];
for (let zoom = 0; zoom <= 3; zoom++) {
  const count = 2 ** zoom;
  const size = 2048 / count;
  for (let x = 0; x < count; x++) {
    for (let y = 0; y < count; y++) {
      const relative = `${zoom}/${x}/${y}.jpg`;
      const path = join(output, relative);
      await mkdir(join(output, String(zoom), String(x)), { recursive: true });
      await execa(
        "gdal_translate",
        [
          "-q",
          "-of",
          "JPEG",
          "-co",
          "QUALITY=90",
          "-srcwin",
          String(x * size),
          String(y * size),
          String(size),
          String(size),
          "-outsize",
          "256",
          "256",
          "-r",
          "bilinear",
          join(work, "display.tif"),
          path,
        ],
        { env: { GDAL_PAM_ENABLED: "NO" } },
      );
      assets.push({
        path: relative,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
    }
  }
}
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      product: "Viking MDIM 2.1 colorized global mosaic",
      source: base,
      capabilities: `${base}/WMTSCapabilities.xml`,
      retrievedAt: new Date().toISOString(),
      attribution: "NASA/USGS/Ames; NASA Trek",
      body: "Mars",
      radiusMeters: 3396190,
      latitudeType: "planetocentric",
      longitudeDirection: "east",
      sourceLevel,
      sourceMatrix: { width: 8, height: 4, tileSize: 256, topLeft: [-180, 90] },
      overviewDegreesPerPixel: 360 / 2048,
      purpose: "Colorized global visual context only, not elevation or true-color radiometry",
      processing:
        "NASA Trek geographic tiles mosaicked and reprojected into display-only Web Mercator XYZ z0-3. Polar imagery beyond Web Mercator's latitude limit is not represented.",
      sources,
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Generated ${assets.length} global context tiles.`);
