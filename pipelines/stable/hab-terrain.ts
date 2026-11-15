// Offline-only cutout. Source samples are never filled, clamped, or AI-generated.
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";

import {
  encodeTerrarium,
  LOCAL_TERRAIN_BOUNDS,
  sampleElevation,
  tileLatitude,
  tileLongitude,
} from "../../lib/mars/terrain.ts";

const source =
  "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif";
const raw = "data/raw/terrain";
const output = "public/data/terrain/hab";
await mkdir(raw, { recursive: true });
await mkdir(output, { recursive: true });
const path = join(raw, "mola-hrsc-hab-subset.tif");
const [west, south, east, north] = LOCAL_TERRAIN_BOUNDS;
let cached = true;
try {
  await access(path);
} catch {
  cached = false;
}
if (!cached) {
  const { stdout: sourceInfo } = await execa("gdalinfo", ["-json", `/vsicurl/${source}`]);
  await writeFile(join(raw, "mola-hrsc-source.json"), sourceInfo);
  // Keep a four-pixel halo so edge tiles interpolate measured neighbors, not edge copies.
  await execa("gdal_translate", [
    "-q",
    "-projwin",
    String(west - 0.014),
    String(north + 0.014),
    String(east + 0.014),
    String(south - 0.014),
    `/vsicurl/${source}`,
    path,
  ]);
}
const { stdout: subsetInfo } = await execa("gdalinfo", ["-json", path]);
await writeFile(join(output, "subset-info.json"), subsetInfo);
const file = await fromFile(path);
const image = await file.getImage();
const [originX, originY] = image.getOrigin();
const [stepX, stepY] = image.getResolution();
const values = await image.readRasters({ samples: [0], interleave: true });
const grid = {
  width: image.getWidth(),
  height: image.getHeight(),
  west: originX,
  north: originY,
  stepX,
  stepY: -stepY,
  nodata: image.getGDALNoData(),
  values,
};
let tileCount = 0;
const assets: { path: string; sha256: string }[] = [];
for (let zoom = 9; zoom <= 11; zoom++) {
  const scale = 2 ** (zoom - 9);
  for (let x = 5 * scale; x < 6 * scale; x++) {
    for (let y = 182 * scale; y < 183 * scale; y++) {
      const tile = new PNG({ width: 256, height: 256 });
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const height = sampleElevation(
            grid,
            tileLongitude(x + (px + 0.5) / 256, zoom),
            tileLatitude(y + (py + 0.5) / 256, zoom),
          );
          if (height === null)
            throw new Error(
              `Missing terrain at ${zoom}/${x}/${y}:${px},${py}; refusing to invent elevation`,
            );
          const offset = (py * 256 + px) * 4;
          tile.data.set([...encodeTerrarium(height), 255], offset);
        }
      }
      const relative = `${zoom}/${x}/${y}.png`;
      const bytes = PNG.sync.write(tile);
      await mkdir(join(output, String(zoom), String(x)), { recursive: true });
      await writeFile(join(output, relative), bytes);
      assets.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
      tileCount++;
    }
  }
}
await file.close();
const bytes = await readFile(path);
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      id: "ares-hab-relief-v1",
      source,
      product: "USGS MOLA/HRSC blended DEM v2",
      retrievedAt: new Date().toISOString(),
      sourceSubset: {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      },
      bounds: LOCAL_TERRAIN_BOUNDS,
      body: "Mars",
      radiusMeters: 3396190,
      latitudeType: "planetocentric",
      longitudeDirection: "east",
      units: "m",
      nodata: grid.nodata,
      nativeGridDegrees: stepX,
      nominalGridMeters: 200,
      nativeGridIsNotAccuracy: true,
      processing:
        "GDAL geographic cutout with interpolation halo; bilinear samples at Web Mercator pixel centers; Terrarium 1/256 m encoding. No added terrain detail.",
      limitations: [
        "200 m product grid does not establish local independent terrain resolution or vertical accuracy.",
        "MOLA remains the regional fallback. No HiRISE or CTX DTM footprint covers the HAB in the catalogs checked.",
        "Not for local hazard detection or safety decisions.",
      ],
      attribution: "NASA/MGS/MOLA; ESA/DLR/FU Berlin/Mars Express/HRSC; USGS Astrogeology",
      tileCount,
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Generated ${tileCount} local terrain tiles; no missing samples.`);
