// Shared helpers for cutting lon/lat (Mars 2000 sphere) GeoTIFFs into Web Mercator XYZ tiles.
// Mapbox treats degrees as Earth degrees, so tiles cut this way line up with everything on the map.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fromFile } from "geotiff";
import { PNG } from "pngjs";

export const TILE_SIZE = 256;

export interface Grid {
  width: number;
  height: number;
  west: number;
  north: number;
  resX: number;
  resY: number;
  noData: number | null;
  bands: ArrayLike<number>[];
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export async function loadGrid(path: string): Promise<Grid> {
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
    noData: image.getGDALNoData(),
    bands,
  };
}

export const gridBBox = (g: Grid): BBox => ({
  west: g.west,
  north: g.north,
  east: g.west + g.width * g.resX,
  south: g.north - g.height * g.resY,
});

/** Bilinear sample; null outside the grid or where any neighbour is no-data. */
export function sample(g: Grid, band: number, lon: number, lat: number): number | null {
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
  const v00 = b[y0 * g.width + x0];
  const v10 = b[y0 * g.width + x1];
  const v01 = b[y1 * g.width + x0];
  const v11 = b[y1 * g.width + x1];
  for (const v of [v00, v10, v01, v11]) {
    if (g.noData !== null && (v === g.noData || v < -1e30 || Number.isNaN(v))) return null;
  }
  const top = v00 * (1 - tx) + v10 * tx;
  const bottom = v01 * (1 - tx) + v11 * tx;
  return top * (1 - ty) + bottom * ty;
}

export const tileToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileToLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
export const lonToTile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
export const latToTile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Every tile (z/x/y) covering `bbox` at zoom `z`. */
export function* tilesIn(bbox: BBox, z: number) {
  for (let x = lonToTile(bbox.west, z); x <= lonToTile(bbox.east - 1e-9, z); x++) {
    for (let y = latToTile(bbox.north, z); y <= latToTile(bbox.south + 1e-9, z); y++) {
      yield { x, y };
    }
  }
}

/** Calls `pixel` with the lon/lat of each pixel centre of tile z/x/y and the RGBA offset. */
export function forEachPixel(
  z: number,
  x: number,
  y: number,
  pixel: (lon: number, lat: number, i: number) => void,
) {
  for (let py = 0; py < TILE_SIZE; py++) {
    const lat = tileToLat(y + (py + 0.5) / TILE_SIZE, z);
    for (let px = 0; px < TILE_SIZE; px++) {
      pixel(tileToLon(x + (px + 0.5) / TILE_SIZE, z), lat, (py * TILE_SIZE + px) * 4);
    }
  }
}

/** Terrarium encoding (height = R*256 + G + B/256 − 32768), rounded to 1/256 m or whole metres. */
export function encodeTerrarium(png: PNG, i: number, metres: number, wholeMetres: boolean) {
  const v = (wholeMetres ? Math.round(metres) : Math.round(metres * 256) / 256) + 32768;
  png.data[i] = Math.floor(v / 256);
  png.data[i + 1] = Math.floor(v) % 256;
  png.data[i + 2] = wholeMetres ? 0 : Math.round((v - Math.floor(v)) * 256) % 256;
  png.data[i + 3] = 255;
}

export const newTile = () => new PNG({ width: TILE_SIZE, height: TILE_SIZE });

export function writeTile(outDir: string, z: number, x: number, y: number, png: PNG) {
  const folder = join(outDir, String(z), String(x));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${y}.png`), PNG.sync.write(png, { deflateLevel: 9 }));
}
