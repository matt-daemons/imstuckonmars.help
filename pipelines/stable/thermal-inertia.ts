// THEMIS thermal inertia for the habitat + the 4 HiRISE sites (soft/dusty ground vs firm/rocky ground).
// Source: USGS/ASU THEMIS Thermal Inertia Mosaic, Quantitative 32-bit, 100 m/px (Fergason et al. 2006),
//   tiles 30N120E + 30N180E, read in place over HTTP (/vsicurl/) — only our window is fetched, not the 2.5 GB tiles.
//   Simple cylindrical on the Mars 2000 sphere (R = 3,396,190 m), units J m⁻² K⁻¹ s⁻½, absolute accuracy ~20 %.
// Outputs:
//   COG for routing: data/processed/thermal-inertia/thermal-inertia.tif — Int16 thermal inertia, nodata −9999,
//                    lon/lat Mars 2000 sphere. ⚠ Longitudes are 0..360 °E (170–196) because the AOI crosses ±180.
//   Map overlay tiles: public/data/thermal-inertia/{z}/{x}/{y}.webp, z5–11 (classes below)
//   Per-site summary:  public/data/processed/thermal-inertia-sites.json (mean/percentiles within RADIUS_M of each POI)
//   Rover drive grid:  public/data/processed/rover/thermal-inertia-corridor.{bin,json} — Int16 thermal inertia on
//                      the exact cells of mola-corridor.bin (pnpm pipe:mola-corridor), nodata −9999
// Usage: pnpm pipe:thermal-inertia
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

const SRC =
  "/vsicurl/https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/" +
  "THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30N{tile}_100mpp.cub";
const R = 3396190;
const DEG_PER_100M = (100 / (Math.PI * R)) * 180; // source pixel size in degrees
// Habitat (−176.05 °E) + all sites (172.56 … −166.14 °E) with ~2° margin, in 0..360 °E.
const [W, S, E, N] = [170, 43, 196, 48];
const RADIUS_M = 5000;
const ACCURACY = 0.2; // absolute accuracy of THEMIS thermal inertia (Fergason et al. 2006)
// Rough surface classes (Putzig & Mellon 2007; Fergason et al. 2006). Indicative only: ~20 % accuracy,
// top few cm of the surface, 100 m pixels.
const CLASSES = [
  { max: 150, label: "fine dust / loose fines", rgba: "200 140 70 170" },
  { max: 400, label: "sand / crusted soil", rgba: "120 170 200 150" },
  { max: Infinity, label: "firm ground / rock", rgba: "70 90 170 190" },
];

const work = "data/interim/themis";
const out = "data/processed/thermal-inertia";
const tilesOut = "public/data/thermal-inertia";
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const env = {
  GDAL_DISABLE_READDIR_ON_OPEN: "EMPTY_DIR",
  GDAL_HTTP_MAX_RETRY: "5",
  GDAL_HTTP_RETRY_DELAY: "2",
};
const mars0360 = "+proj=longlat +R=3396190 +lon_wrap=180 +no_defs";

// Warp both tiles onto one lon/lat grid at the source resolution; nearest keeps the measured values.
const ti = join(work, "thermal-inertia-f32.tif");
await execa(
  "gdalwarp",
  [
    "-q",
    "-overwrite",
    "-t_srs",
    mars0360,
    "-te",
    ...[W, S, E, N].map(String),
    "-tr",
    String(DEG_PER_100M),
    String(DEG_PER_100M),
    "-r",
    "near",
    "-dstnodata",
    "-9999",
    "-wo",
    "SOURCE_EXTRA=4",
    "-multi",
    "-co",
    "COMPRESS=DEFLATE",
    "-co",
    "TILED=YES",
    ...["120E", "180E"].map((t) => SRC.replace("{tile}", t)),
    ti,
  ],
  { env },
);
const published = join(out, "thermal-inertia.tif");
await execa("gdal_translate", [
  "-q",
  "-of",
  "COG",
  "-ot",
  "Int16",
  "-a_nodata",
  "-9999",
  "-co",
  "COMPRESS=DEFLATE",
  "-co",
  "PREDICTOR=2",
  ti,
  published,
]);

// Thermal inertia on the rover's drive grid, cell for cell, so the drive planner can price soft ground.
// Each 463 m cell holds ~15 THEMIS pixels; the median is the typical ground and ignores the odd rock or
// dust patch. Cells with no THEMIS pixel stay nodata; the strip's outer 0.5° rows lie outside our box.
const corridor = JSON.parse(readFileSync("public/data/processed/rover/mola-corridor.json", "utf8"));
const corridorRaw = join(work, "ti-corridor.bin"); // ENVI: bare little-endian Int16, rows north to south
const { west, south, east, north } = corridor.extent;
await execa(
  "gdalwarp",
  [
    ...["-q", "-overwrite", "-t_srs", mars0360, "-te", west, south, east, north],
    ...["-ts", corridor.width, corridor.height, "-r", "med", "-srcnodata", "-9999"],
    ...["-dstnodata", "-9999", "-ot", "Int16", "-of", "ENVI", published, corridorRaw],
  ].map(String),
);
const corridorTi = new Int16Array(new Uint8Array(readFileSync(corridorRaw)).buffer);
if (corridorTi.length !== corridor.width * corridor.height) {
  throw new Error(`Corridor grid: ${corridorTi.length} cells, expected the MOLA strip's`);
}
const corridorCoverage =
  Math.round((1000 * corridorTi.filter((v) => v !== -9999).length) / corridorTi.length) / 10;
writeFileSync("public/data/processed/rover/thermal-inertia-corridor.bin", corridorTi);
writeFileSync(
  "public/data/processed/rover/thermal-inertia-corridor.json",
  JSON.stringify(
    {
      width: corridor.width,
      height: corridor.height,
      west: corridor.west,
      north: corridor.north,
      degreesPerPixel: corridor.degreesPerPixel,
      nodata: -9999,
      coverage_percent: corridorCoverage,
      units: "J m^-2 K^-1 s^-1/2",
      source:
        "THEMIS Thermal Inertia Mosaic, Quantitative, 100 m/px (USGS Astrogeology / ASU; Fergason et al. 2006)",
      attribution: "NASA/JPL-Caltech/Arizona State University/USGS",
      note: "Int16 thermal inertia, median of the THEMIS pixels in each cell of mola-corridor.bin (same grid). ±20 %, top few cm only; nodata is unknown ground, not firm ground.",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Drive grid: THEMIS data for ${corridorCoverage} % of the MOLA strip's cells`);

// Coloured overlay. Tiles are cut in −180..180 (Mapbox/MapLibre treat Mars degrees as Earth degrees),
// so tile each side of the antimeridian separately; 180° is a tile edge at every zoom, so they don't overlap.
const ramp = join(work, "ti-ramp.txt");
let lo = 0;
const rampLines = CLASSES.flatMap((c) => {
  const hi = Number.isFinite(c.max) ? c.max - 0.01 : 5000;
  const lines = [`${lo} ${c.rgba}`, `${hi} ${c.rgba}`];
  lo = c.max;
  return lines;
});
writeFileSync(ramp, [...rampLines, "nv 0 0 0 0", ""].join("\n"));
const coloured = join(work, "ti-rgba.tif");
await execa("gdaldem", [
  "color-relief",
  "-q",
  "-alpha",
  "-nearest_color_entry",
  ti,
  ramp,
  coloured,
]);
rmSync(tilesOut, { recursive: true, force: true });
mkdirSync(tilesOut, { recursive: true });
for (const [name, w, e, shift] of [
  ["east", W, 180, 0],
  ["west", 180, E, -360],
] as const) {
  const part = join(work, `ti-${name}.vrt`);
  await execa("gdal_translate", [
    "-q",
    "-of",
    "VRT",
    "-projwin",
    String(w),
    String(N),
    String(e),
    String(S),
    coloured,
    part,
  ]);
  const asEarth = join(work, `ti-${name}-as-4326.vrt`);
  await execa("gdal_translate", [
    "-q",
    "-of",
    "VRT",
    "-a_srs",
    "EPSG:4326",
    "-a_ullr",
    String(w + shift),
    String(N),
    String(e + shift),
    String(S),
    part,
    asEarth,
  ]);
  await execa("gdal2tiles", [
    "--xyz",
    "-z",
    "5-11",
    "-w",
    "none",
    "-r",
    "near",
    "--resume",
    "--tiledriver",
    "WEBP",
    "--webp-quality",
    "85",
    "--processes",
    "8",
    asEarth,
    tilesOut,
  ]);
}

// Per-site stats within RADIUS_M of each POI (local metre grid, so the circle is a true circle on Mars).
type Feature = {
  geometry: { type: string; coordinates: number[] };
  properties: Record<string, string>;
};
const sites = JSON.parse(
  readFileSync("public/data/processed/sites.geojson", "utf8"),
).features.filter((f: Feature) => f.geometry.type === "Point");
const places = [
  ...sites.map((f: Feature) => ({ id: f.properties.hirise_id, lonlat: f.geometry.coordinates })),
  { id: "habitat", lonlat: [-176.05, 45.97] },
];
// THEMIS has gaps (mosaic holes), so report how much of the box and of each site circle has data.
const stats = JSON.parse((await execa("gdalinfo", ["-json", "-stats", published])).stdout);
const aoiCoverage = Math.round(Number(stats.bands[0].metadata[""].STATISTICS_VALID_PERCENT));
console.log(
  `⚠ THEMIS covers only ${aoiCoverage} % of the AOI (${W}–${E} °E, ${S}–${N} °N); the rest is no data, not "unknown = safe".\n` +
    `⚠ Values are ±${ACCURACY * 100} % (absolute), describe the top few cm only, and classes are indicative.`,
);
const summary = [];
for (const { id, lonlat } of places) {
  const [lon, lat] = lonlat;
  const local = `+proj=aeqd +lat_0=${lat} +lon_0=${lon} +R=${R} +units=m +no_defs`;
  const clip = join(work, `ti-${id}.tif`);
  await execa("gdalwarp", [
    "-q",
    "-overwrite",
    "-t_srs",
    local,
    "-te",
    ...[-RADIUS_M, -RADIUS_M, RADIUS_M, RADIUS_M].map(String),
    "-tr",
    "100",
    "100",
    "-r",
    "near",
    "-srcnodata",
    "-9999",
    "-dstnodata",
    "-9999",
    ti,
    clip,
  ]);
  const xyz = (await execa("gdal_translate", ["-q", "-of", "XYZ", clip, "/vsistdout/"])).stdout;
  const inCircle = xyz
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter(([x, y]) => Math.hypot(x, y) <= RADIUS_M);
  const values = inCircle
    .map(([, , v]) => v)
    .filter((v) => v !== -9999 && Number.isFinite(v))
    .sort((a, b) => a - b);
  const coverage = Math.round((1000 * values.length) / inCircle.length) / 10;
  const pct = (p: number) => Math.round(values[Math.floor((p / 100) * (values.length - 1))]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const share = (lo: number, hi: number) =>
    Math.round((1000 * values.filter((v) => v >= lo && v < hi).length) / values.length) / 10;
  let prev = 0;
  const classes = CLASSES.map((c) => {
    const r = { label: c.label, percent: share(prev, c.max) };
    prev = c.max;
    return r;
  });
  // Does the class survive the ±ACCURACY error on the mean? If not, say so rather than over-claiming.
  const [meanLow, meanHigh] = [mean * (1 - ACCURACY), mean * (1 + ACCURACY)];
  const classOf = (v: number) => CLASSES.find((c) => v < c.max)!.label;
  const classRobust = classOf(meanLow) === classOf(meanHigh);
  const row = {
    id,
    lon,
    lat,
    radius_m: RADIUS_M,
    coverage_percent: coverage,
    mean: Math.round(mean),
    mean_range: [Math.round(meanLow), Math.round(meanHigh)],
    p10: pct(10),
    p50: pct(50),
    p90: pct(90),
    class: CLASSES.find((c) => mean < c.max)!.label,
    class_robust: classRobust,
    classes,
  };
  summary.push(row);
  console.log(
    `${id}: mean ${row.mean} (±${ACCURACY * 100} %: ${row.mean_range.join("–")}), p10–p90 ${row.p10}–${row.p90} ` +
      `J m⁻² K⁻¹ s⁻½, data for ${coverage} % of the ${RADIUS_M / 1000} km circle → ${row.class}` +
      `${classRobust ? "" : " (⚠ uncertain: ±20 % crosses a class break)"} ` +
      `(${classes.map((c) => `${c.percent}% ${c.label}`).join(", ")})`,
  );
}
writeFileSync(
  "public/data/processed/thermal-inertia-sites.json",
  JSON.stringify(
    {
      units: "J m^-2 K^-1 s^-1/2",
      source:
        "THEMIS Thermal Inertia Mosaic, Quantitative, 100 m/px (USGS Astrogeology / ASU; Fergason et al. 2006)",
      attribution: "NASA/JPL-Caltech/Arizona State University/USGS",
      coverage: {
        aoi_percent: aoiCoverage,
        aoi_bbox_0_360: [W, S, E, N],
        note: "THEMIS mosaic has gaps; pixels without data are unknown, not safe. Per-site coverage is in sites[].coverage_percent.",
      },
      uncertainty: {
        absolute_accuracy: ACCURACY,
        note: "mean_range = mean ±20 % (Fergason et al. 2006). class_robust = false when that range crosses a class break.",
      },
      caveats: [
        "Incomplete coverage: THEMIS has no data for part of the area (see coverage).",
        "Thermal inertia is ~20 % accurate and describes only the top few centimetres of the surface.",
        "100 m pixels average over rocks, sand and dust; classes are indicative, not a trafficability guarantee.",
        "Not ground-truthed: no rover has operated in Arcadia Planitia.",
      ],
      class_breaks: CLASSES.map((c) => ({
        below: Number.isFinite(c.max) ? c.max : null,
        label: c.label,
      })),
      sites: summary,
    },
    null,
    2,
  ) + "\n",
);
