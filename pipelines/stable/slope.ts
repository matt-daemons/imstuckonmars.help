// Slope + hazard classes for a HiRISE site (run after hirise-sites.ts).
//   COG (true values, degrees): data/processed/sites/<dtm>/slope.tif
//   Map overlay tiles:          public/data/sites/<dtm>/slope/{z}/{x}/{y}.webp, z11–16
// Slope is computed on a local equirectangular metre grid centred on the site (Mars 2000 sphere),
// so x and y metres are both true; then warped back to lon/lat for tiling.
// The hazard threshold is config.yaml thresholds.slope_max_deg (team role A: NASA lunar suit limit, assumed for Mars).
// Usage: pnpm pipe:slope <dtm-id>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";
import { parse } from "yaml";

const dtm = process.argv[2];
if (!dtm) throw new Error("usage: slope.ts <dtm-id>");

const config = parse(readFileSync("config.yaml", "utf8"));
const maxSlope = Number(config.thresholds.slope_max_deg);
const work = join("data/interim/hirise", dtm);
const dem = join(work, "dem.tif");
const out = join("data/processed/sites", dtm);
const tilesOut = join("public/data/sites", dtm, "slope");
mkdirSync(out, { recursive: true });

const info = JSON.parse((await execa("gdalinfo", ["-json", dem])).stdout);
const [clon, clat]: number[] = info.cornerCoordinates.center;
const local = `+proj=eqc +lat_ts=${clat} +lon_0=${clon} +R=3396190 +units=m +no_defs`;
const mars = "+proj=longlat +R=3396190 +no_defs";
const EDGE_TRIM_M = 10; // local grid is 1 m, so also pixels

const demLocal = join(work, "dem-local.tif");
const slopeLocal = join(work, "slope-local.tif");
const slope = join(out, "slope.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  local,
  "-tr",
  "1",
  "1",
  "-r",
  "bilinear",
  dem,
  demLocal,
]);
await execa("gdaldem", ["slope", "-q", demLocal, slopeLocal]);
// HiRISE DTMs have ragged, unreliable edges (fake ~90° cliffs). Blank slope within EDGE_TRIM_M
// of the DTM's no-data area, measured on the local metre grid.
const valid = join(work, "valid-local.tif");
const proximity = join(work, "edge-distance-local.tif");
const trimmed = join(work, "slope-trimmed-local.tif");
await execa("gdal_calc", [
  ...["--quiet", "--overwrite", "-A", demLocal, "--calc", "A>-32000", "--type", "Byte"],
  ...["--NoDataValue", "255", "--hideNoData", "--outfile", valid],
]);
await execa("gdal_proximity", [
  ...["-q", valid, proximity, "-values", "0", "-distunits", "PIXEL"],
  ...["-maxdist", String(EDGE_TRIM_M + 1), "-nodata", String(EDGE_TRIM_M + 1), "-ot", "Float32"],
]);
await execa("gdal_calc", [
  ...["--quiet", "--overwrite", "-A", slopeLocal, "-B", proximity],
  ...["--calc", `where(B > ${EDGE_TRIM_M}, A, -9999)`, "--NoDataValue", "-9999"],
  ...["--outfile", trimmed],
]);
// Back onto the DTM's lon/lat grid so the COG lines up with dem.tif.
const { size } = info;
const [w, s, e, n] = bounds(info.cornerCoordinates);
await execa("gdalwarp", [
  ...["-q", "-overwrite", "-t_srs", mars, "-te", ...[w, s, e, n].map(String)],
  ...["-ts", String(size[0]), String(size[1]), "-r", "bilinear"],
  ...["-srcnodata", "-9999", "-dstnodata", "-9999"],
  ...["-of", "COG", "-co", "COMPRESS=DEFLATE"],
  ...[trimmed, slope],
]);

// Classes: < 10° clear, 10–15° yellow, 15°–threshold orange, ≥ threshold red (hazard).
const ramp = join(work, "slope-ramp.txt");
writeFileSync(
  ramp,
  [
    "0 0 0 0 0",
    "9.99 0 0 0 0",
    "10 250 220 90 120",
    "14.99 250 220 90 120",
    "15 245 150 50 160",
    `${maxSlope - 0.01} 245 150 50 160`,
    `${maxSlope} 220 40 30 210`,
    "90 220 40 30 210",
    "nv 0 0 0 0",
    "",
  ].join("\n"),
);
const coloured = join(work, "slope-rgba.tif");
await execa("gdaldem", [
  "color-relief",
  "-q",
  "-alpha",
  "-nearest_color_entry",
  slope,
  ramp,
  coloured,
]);
const asEarth = join(work, "slope-as-4326.vrt");
await execa("gdal_translate", ["-q", "-of", "VRT", "-a_srs", "EPSG:4326", coloured, asEarth]);
rmSync(tilesOut, { recursive: true, force: true });
mkdirSync(tilesOut, { recursive: true });
await execa("gdal2tiles", [
  ...["--xyz", "-z", "11-16", "-w", "none", "-r", "near"],
  ...["--tiledriver", "WEBP", "--webp-quality", "85", "--processes", "8"],
  ...[asEarth, tilesOut],
]);

const hist = JSON.parse((await execa("gdalinfo", ["-json", "-stats", "-hist", slope])).stdout);
const band = hist.bands[0];
const buckets: number[] = band.histogram.buckets;
const step = (band.histogram.max - band.histogram.min) / buckets.length;
const total = buckets.reduce((a, b) => a + b, 0);
const over = buckets.reduce(
  (a, c, i) => (band.histogram.min + (i + 0.5) * step >= maxSlope ? a + c : a),
  0,
);
console.log(
  `${dtm}: slope mean ${band.mean.toFixed(1)}°, max ${band.maximum.toFixed(1)}°, ` +
    `${((100 * over) / total).toFixed(1)}% ≥ ${maxSlope}° (slope_max_deg)`,
);

function bounds(c: Record<string, number[]>): [number, number, number, number] {
  const xs = Object.values(c).map((p) => p[0]);
  const ys = Object.values(c).map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
