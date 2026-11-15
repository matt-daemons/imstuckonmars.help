// Regional terrain context: MGS MOLA 463 m DEM (USGS Astrogeology) → Mapbox XYZ tiles.
// Writes Terrarium-encoded elevation tiles (3D terrain) and shaded-colour base tiles under
// public/data/terrain/mola/. Usage: pnpm pipe:mola
// Inputs and outputs are lon/lat on the Mars 2000 sphere; Mapbox treats degrees as Earth
// degrees, so the tiles line up with everything else on the map (heights: see MARS_TO_MAP).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";

const MOLA_URL =
  "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif";
// Region around the Arcadia Planitia placeholder AOI (east-positive −180..180). Must not cross ±180.
const EXTENT = { west: -180, south: 40, east: -168, north: 52 };
const WORK = "data/interim/mola";
const outDir = "public/data/terrain/mola";

// Elevation colour ramp (m, R G B) tuned to the region's −4.5 to −3.0 km range.
const RAMP = `-4500 58 30 22
-4100 120 64 40
-3700 176 104 62
-3300 214 150 98
-3000 236 196 150
nv 0 0 0 0
`;

mkdirSync(WORK, { recursive: true });
const demPath = join(WORK, "dem.tif");
const colorPath = join(WORK, "color.tif");
const shadePath = join(WORK, "hillshade.tif");
writeFileSync(join(WORK, "ramp.txt"), RAMP);

await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-r",
  "bilinear",
  "-t_srs",
  "+proj=longlat +R=3396190 +no_defs",
  "-te",
  ...[EXTENT.west, EXTENT.south, EXTENT.east, EXTENT.north].map(String),
  "-tr",
  "0.0078125",
  "0.0078125",
  MOLA_URL,
  demPath,
]);
// -s converts degrees to metres on Mars (2πR/360); -z exaggerates relief so the flat plains read.
await execa("gdaldem", [
  "hillshade",
  "-q",
  "-s",
  "59274",
  "-z",
  "40",
  "-multidirectional",
  demPath,
  shadePath,
]);
await execa("gdaldem", ["color-relief", "-q", demPath, join(WORK, "ramp.txt"), colorPath]);
rmSync(outDir, { recursive: true, force: true });

const MIN_ZOOM = 5;
// MOLA is 463 m/px; z8 tiles are ~330 m/px on Mars, so deeper zooms add no detail.
const MAX_ZOOM = 8;
const SIZE = 256;

interface Grid {
  width: number;
  height: number;
  west: number;
  north: number;
  resX: number;
  resY: number;
  bands: ArrayLike<number>[];
}

async function load(path: string): Promise<Grid> {
  const image = await (await fromFile(path)).getImage();
  const [west, , , north] = image.getBoundingBox();
  const [resX, resY] = image.getResolution();
  const bands = (await image.readRasters()) as unknown as ArrayLike<number>[];
  return {
    width: image.getWidth(),
    height: image.getHeight(),
    west,
    north,
    resX,
    resY: -resY,
    bands,
  };
}

// Bilinear sample with edge clamping; returns null outside the grid.
function sample(g: Grid, band: number, lon: number, lat: number): number | null {
  const fx = (lon - g.west) / g.resX - 0.5;
  const fy = (g.north - lat) / g.resY - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > g.width - 0.5 || fy > g.height - 0.5) return null;
  const x0 = Math.max(0, Math.min(g.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(g.height - 1, Math.floor(fy)));
  const x1 = Math.min(g.width - 1, x0 + 1);
  const y1 = Math.min(g.height - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const b = g.bands[band];
  const at = (x: number, y: number) => b[y * g.width + x];
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

const tileToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileToLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const lonToTile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToTile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function write(dir: string, z: number, x: number, y: number, png: PNG) {
  const folder = join(outDir, dir, String(z), String(x));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${y}.png`), PNG.sync.write(png, { deflateLevel: 9 }));
}

const [dem, color, shade] = await Promise.all([load(demPath), load(colorPath), load(shadePath)]);
const east = dem.west + dem.width * dem.resX;
const south = dem.north - dem.height * dem.resY;
let count = 0;

for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
  for (let x = lonToTile(dem.west, z); x <= lonToTile(east - 1e-9, z); x++) {
    for (let y = latToTile(dem.north, z); y <= latToTile(south + 1e-9, z); y++) {
      const terrain = new PNG({ width: SIZE, height: SIZE });
      const base = new PNG({ width: SIZE, height: SIZE });
      for (let py = 0; py < SIZE; py++) {
        const lat = tileToLat(y + (py + 0.5) / SIZE, z);
        for (let px = 0; px < SIZE; px++) {
          const lon = tileToLon(x + (px + 0.5) / SIZE, z);
          const i = (py * SIZE + px) * 4;
          // Terrarium encoding: height = R*256 + G + B/256 - 32768.
          const clampedLon = Math.min(Math.max(lon, dem.west), east - 1e-9);
          const clampedLat = Math.min(Math.max(lat, south + 1e-9), dem.north);
          // Rounded to whole metres (B = 0): MOLA can't resolve less, and the tiles compress ~3× better.
          const v = Math.round(sample(dem, 0, clampedLon, clampedLat) ?? 0) + 32768;
          terrain.data[i] = Math.floor(v / 256);
          terrain.data[i + 1] = v % 256;
          terrain.data[i + 2] = 0;
          terrain.data[i + 3] = 255;

          const h = sample(shade, 0, lon, lat);
          if (h === null) continue; // transparent outside the cut-out
          const light = 0.35 + 0.65 * (h / 255);
          for (let c = 0; c < 3; c++) {
            base.data[i + c] = Math.min(255, (sample(color, c, lon, lat) ?? 0) * light);
          }
          base.data[i + 3] = 255;
        }
      }
      write("terrain", z, x, y, terrain);
      write("base", z, x, y, base);
      count++;
    }
  }
}
console.log(`Wrote ${count} tile pairs (z${MIN_ZOOM}-${MAX_ZOOM}) to ${outDir}`);
