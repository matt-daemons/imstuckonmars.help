import { readFile } from "node:fs/promises";

import { execa } from "execa";
import { z } from "zod";

import { tileLatitude, tileLongitude } from "../lib/mars/terrain.ts";

const config = z
  .object({ directory: z.string(), tileSize: z.number(), maxZoom: z.number() })
  .parse(JSON.parse(await readFile("pipelines/viking-native-release.json", "utf8")));
const source = "data/raw/terrain/viking-native/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif";
const header = z
  .object({
    geoTransform: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  })
  .parse(JSON.parse(await readFile(`${config.directory}/source-header.json`, "utf8")));
const [west, stepX, , north, , stepY] = header.geoTransform;
const radius = 3396190;
const zoom = config.maxZoom;
const pixel = config.tileSize / 2;
const checks = [];
for (const [x, y] of [
  [1, 40],
  [30, 65],
  [63, 62],
  [100, 90],
  [125, 45],
]) {
  const lon = tileLongitude(x + (pixel + 0.5) / config.tileSize, zoom);
  const lat = tileLatitude(y + (pixel + 0.5) / config.tileSize, zoom);
  const sourceX = (((lon * Math.PI) / 180) * radius - west) / stepX;
  const sourceY = (((lat * Math.PI) / 180) * radius - north) / stepY;
  const raw = await execa("gdallocationinfo", [
    "-valonly",
    "-r",
    "bilinear",
    source,
    String(sourceX),
    String(sourceY),
  ]);
  const tile = await execa("gdallocationinfo", [
    "-valonly",
    `${config.directory}/tiles/${zoom}/${x}/${y}.jpg`,
    String(pixel),
    String(pixel),
  ]);
  const expected = raw.stdout.trim().split(/\s+/).map(Number);
  const actual = tile.stdout.trim().split(/\s+/).map(Number);
  const deltas = expected.map((value, band) => Math.abs(value - actual[band]));
  if (
    expected.length !== 3 ||
    actual.length !== 3 ||
    deltas.some((value) => !Number.isFinite(value) || value > 30)
  ) {
    throw new Error(`Native source / tile mismatch at ${lon},${lat}: ${expected} vs ${actual}`);
  }
  checks.push({ tile: `${zoom}/${x}/${y}`, lon, lat, expected, actual, deltas });
}
console.log(
  JSON.stringify(
    {
      method:
        "Independent lon/lat to source-grid samples, compared with decoded JPEG tile centers; tolerance 30/255 per band",
      checks,
    },
    null,
    2,
  ),
);
