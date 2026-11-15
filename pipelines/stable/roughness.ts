// Surface roughness for a HiRISE site (run after hirise-sites.ts) — how bumpy the ground is once the slope is removed.
// Matters most for walking EVAs: a suited walker trips on metre-scale bumps a rover rolls over.
//   Metric: RMS height deviation (m) from the local trend surface, per 5 m cell.
//     trend    = 1 m DTM averaged to 5 m, then bilinear back to 1 m (a plane stays a plane, so steady slopes score ~0)
//     residual = DTM − trend;  roughness = sqrt(mean(residual²)) over each 5 m cell
//   COG for routing: data/processed/sites/<dtm>/roughness.tif — Int16 centimetres (value / 100 = m, scale metadata 0.01),
//                    nodata −9999, same lon/lat grid as dem.tif and slope.tif (pixel-for-pixel; 5 m blocks)
//   Map overlay tiles: public/data/sites/<dtm>/roughness/{z}/{x}/{y}.webp, z11–16
//   Per-site summary:  public/data/processed/roughness-sites.json (percentiles + % per class, merged per run)
// Limits: the 1 m DTM resolves bumps ~2 m and wider (boulders, polygon troughs, small crater rims, scarps); single rocks
// < ~1–2 m are invisible here and need the 0.25 m imagery. Vertical precision is a few tens of cm, so the lowest class
// is "below DTM noise", not "proven smooth".
// Usage: pnpm pipe:roughness <dtm-id>
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

const dtm = process.argv[2];
if (!dtm) throw new Error("usage: roughness.ts <dtm-id>");

const CELL_M = 5;
const EDGE_TRIM_M = 10 + CELL_M; // slope.ts trims 10 m; the trend surface reaches a further cell inwards
// Classes — ASSUMPTION (Role B), not flight rules: no NASA walking-roughness limit exists. Breaks sit above the
// DTM's vertical precision (~0.2–0.3 m, Kirk et al. 2008) and around a suited walker's comfortable step-over height.
// To be agreed with team role A before they drive a GO/NO-GO.
const CLASSES = [
  { max: 0.25, label: "smooth (below DTM noise)", rgba: "0 0 0 0" },
  { max: 0.5, label: "uneven — walk with care", rgba: "250 220 90 130" },
  { max: 1.0, label: "rough — walking caution", rgba: "245 150 50 170" },
  { max: Infinity, label: "very rough — avoid on foot", rgba: "220 40 30 210" },
];

const work = join("data/interim/hirise", dtm);
const dem = join(work, "dem.tif");
const out = join("data/processed/sites", dtm);
const tilesOut = join("public/data/sites", dtm, "roughness");
const summaryPath = "public/data/processed/roughness-sites.json";
mkdirSync(out, { recursive: true });

const info = JSON.parse((await execa("gdalinfo", ["-json", dem])).stdout);
const [clon, clat]: number[] = info.cornerCoordinates.center;
const local = `+proj=eqc +lat_ts=${clat} +lon_0=${clon} +R=3396190 +units=m +no_defs`;
const mars = "+proj=longlat +R=3396190 +no_defs";

// 1 m DTM on a local metre grid (same as slope.ts), then the trend surface on exactly that grid.
const demLocal = join(work, "dem-local.tif");
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
  "-dstnodata",
  "-32768",
  dem,
  demLocal,
]);
const localInfo = JSON.parse((await execa("gdalinfo", ["-json", demLocal])).stdout);
const [lw, ls, le, ln] = bounds(localInfo.cornerCoordinates).map(String);
const [lx, ly]: number[] = localInfo.size;
const coarse = join(work, "trend-5m-local.tif");
const trend = join(work, "trend-local.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-tr",
  String(CELL_M),
  String(CELL_M),
  "-r",
  "average",
  "-srcnodata",
  "-32768",
  "-dstnodata",
  "-32768",
  demLocal,
  coarse,
]);
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-te",
  lw,
  ls,
  le,
  ln,
  "-ts",
  String(lx),
  String(ly),
  "-r",
  "bilinear",
  "-srcnodata",
  "-32768",
  "-dstnodata",
  "-32768",
  coarse,
  trend,
]);

// Blank everything within EDGE_TRIM_M of the DTM's no-data area (ragged HiRISE edges, see slope.ts).
const valid = join(work, "valid-local.tif");
const proximity = join(work, "edge-distance-roughness-local.tif");
await execa("gdal_calc", [
  "--quiet",
  "--overwrite",
  "-A",
  demLocal,
  "--calc",
  "A>-32000",
  "--type",
  "Byte",
  "--NoDataValue",
  "255",
  "--hideNoData",
  "--outfile",
  valid,
]);
await execa("gdal_proximity", [
  "-q",
  valid,
  proximity,
  "-values",
  "0",
  "-distunits",
  "PIXEL",
  "-maxdist",
  String(EDGE_TRIM_M + 1),
  "-nodata",
  String(EDGE_TRIM_M + 1),
  "-ot",
  "Float32",
]);
const residual2 = join(work, "residual2-local.tif");
await execa("gdal_calc", [
  "--quiet",
  "--overwrite",
  "-A",
  demLocal,
  "-B",
  trend,
  "-C",
  proximity,
  "--calc",
  `where((C > ${EDGE_TRIM_M}) & (A > -32000) & (B > -32000), (A - B) ** 2, -9999)`,
  "--type",
  "Float32",
  "--NoDataValue",
  "-9999",
  "--hideNoData",
  "--outfile",
  residual2,
]);
const meanSq = join(work, "residual2-5m-local.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-tr",
  String(CELL_M),
  String(CELL_M),
  "-r",
  "average",
  "-srcnodata",
  "-9999",
  "-dstnodata",
  "-9999",
  residual2,
  meanSq,
]);
const rmsLocal = join(work, "roughness-local.tif");
await execa("gdal_calc", [
  "--quiet",
  "--overwrite",
  "-A",
  meanSq,
  "--calc",
  "where(A >= 0, sqrt(A), -9999)",
  "--type",
  "Float32",
  "--NoDataValue",
  "-9999",
  "--outfile",
  rmsLocal,
]);

// Back onto the DTM's lon/lat grid (nearest keeps the 5 m cells intact), so it lines up with slope.tif.
const [w, s, e, n] = bounds(info.cornerCoordinates);
const roughness = join(work, "roughness-m.tif"); // Float32 metres, used for the overlay and stats
const published = join(out, "roughness.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  mars,
  "-te",
  ...[w, s, e, n].map(String),
  "-ts",
  String(info.size[0]),
  String(info.size[1]),
  "-r",
  "near",
  "-srcnodata",
  "-9999",
  "-dstnodata",
  "-9999",
  "-of",
  "COG",
  "-co",
  "COMPRESS=DEFLATE",
  rmsLocal,
  roughness,
]);
const cm = join(work, "roughness-cm.tif");
await execa("gdal_calc", [
  "--quiet",
  "--overwrite",
  "-A",
  roughness,
  "--calc",
  "where(A >= 0, minimum(rint(A * 100), 32000), -9999)",
  "--type",
  "Int16",
  "--NoDataValue",
  "-9999",
  "--outfile",
  cm,
]);
await execa("gdal_translate", [
  "-q",
  "-of",
  "COG",
  "-a_scale",
  "0.01",
  "-a_nodata",
  "-9999",
  "-co",
  "COMPRESS=DEFLATE",
  "-co",
  "PREDICTOR=2",
  cm,
  published,
]);

const ramp = join(work, "roughness-ramp.txt");
const rampLines: string[] = [];
let lo = 0;
for (const c of CLASSES) {
  const hi = Number.isFinite(c.max) ? c.max - 0.001 : 1000;
  rampLines.push(`${lo} ${c.rgba}`, `${hi} ${c.rgba}`);
  lo = c.max;
}
writeFileSync(ramp, [...rampLines, "nv 0 0 0 0", ""].join("\n"));
const coloured = join(work, "roughness-rgba.tif");
await execa("gdaldem", [
  "color-relief",
  "-q",
  "-alpha",
  "-nearest_color_entry",
  roughness,
  ramp,
  coloured,
]);
const asEarth = join(work, "roughness-as-4326.vrt");
await execa("gdal_translate", ["-q", "-of", "VRT", "-a_srs", "EPSG:4326", coloured, asEarth]);
rmSync(tilesOut, { recursive: true, force: true });
mkdirSync(tilesOut, { recursive: true });
await execa("gdal2tiles", [
  "--xyz",
  "-z",
  "11-16",
  "-w",
  "none",
  "-r",
  "near",
  "--tiledriver",
  "WEBP",
  "--webp-quality",
  "85",
  "--processes",
  "8",
  asEarth,
  tilesOut,
]);

// Stats on the local 5 m cells (equal-area, unlike the lon/lat copy).
const hist = JSON.parse(
  (
    await execa("gdalinfo", [
      "-json",
      "-stats",
      "-hist",
      "-nomd",
      "--config",
      "GDAL_PAM_ENABLED",
      "NO",
      rmsLocal,
    ])
  ).stdout,
);
const band = hist.bands[0];
const raw = (
  await execa("gdal_translate", ["-q", "-of", "XYZ", rmsLocal, "/vsistdout/"], {
    maxBuffer: 1 << 30,
  })
).stdout;
const values = raw
  .split("\n")
  .map((l) => Number(l.split(" ")[2]))
  .filter((v) => Number.isFinite(v) && v >= 0)
  .sort((a, b) => a - b);
const pct = (p: number) =>
  round(values[Math.min(values.length - 1, Math.floor(p * values.length))]);
let prev = 0;
const classes = CLASSES.map((c) => {
  const count = values.filter((v) => v >= prev && v < c.max).length;
  const row = {
    label: c.label,
    min_m: prev,
    max_m: Number.isFinite(c.max) ? c.max : null,
    percent: round((100 * count) / values.length),
  };
  prev = c.max;
  return row;
});
const entry = {
  metric: `RMS height deviation from local trend, ${CELL_M} m cells, 1 m HiRISE DTM`,
  cells: values.length,
  mean_m: round(band.mean),
  p50_m: pct(0.5),
  p90_m: pct(0.9),
  p99_m: pct(0.99),
  classes,
};
const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, "utf8")) : {};
summary.note =
  "Class breaks are a Role B ASSUMPTION (no NASA walking-roughness limit). Bumps narrower than ~2 m are not resolved. " +
  "Source: HiRISE DTMs, NASA/JPL/University of Arizona.";
summary.sites = { ...summary.sites, [dtm]: entry };
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `${dtm}: roughness p50 ${entry.p50_m} m, p90 ${entry.p90_m} m, p99 ${entry.p99_m} m; ` +
    classes.map((c) => `${c.percent}% ${c.label}`).join(", "),
);

function bounds(c: Record<string, number[]>): [number, number, number, number] {
  const xs = Object.values(c).map((p) => p[0]);
  const ys = Object.values(c).map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
