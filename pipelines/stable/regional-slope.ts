// Regional slope for the drive leg: habitat → 4 HiRISE sites, from the MOLA/HRSC blended DEM (200 m).
// Source: USGS Astrogeology Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2 (NASA/ESA/DLR/FU Berlin; same file as
//   hab-terrain.ts), lon/lat on the Mars 2000 sphere, read over HTTP (/vsicurl/). The file is stored in
//   one-row strips, so we fetch only the corridor's latitude band once (full width, ~160 MB) and cut locally.
// Method = slope.ts: reproject to a local equirectangular metre grid on the Mars sphere centred on the corridor
//   (lat_ts = LAT_TS) → gdaldem slope → back to lon/lat at the source resolution.
// Outputs:
//   COG for routing: data/processed/regional-slope/regional-slope.tif — Int16 tenths of a degree (value / 10 = °,
//                    scale metadata 0.1), nodata −9999, lon/lat Mars 2000 sphere.
//                    ⚠ Longitudes are 0..360 °E because the corridor crosses ±180.
//   Map overlay tiles: public/data/regional-slope/{z}/{x}/{y}.webp, z5–10 (classes from 1°: the corridor is flat)
//   Summary:           public/data/processed/regional-slope.json
// Usage: pnpm pipe:regional-slope
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";
import { parse } from "yaml";

const SRC =
  "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif";
const R = 3396190;
const RES_DEG = 0.003374120830641; // source pixel (200 m at the equator)
const RES_M = 200;
const BUFFER_M = 20_000;
const LAT_TS = 45.5; // true-scale latitude of the local metre grid; x scale is off by ≤ ~3 % at the box edges
const HABITAT: [number, number] = [-176.05, 45.97];

const config = parse(readFileSync("config.yaml", "utf8"));
const maxSlope = Number(config.thresholds.slope_max_deg);
const work = "data/interim/regional-slope";
const out = "data/processed/regional-slope";
const tilesOut = "public/data/regional-slope";
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const env = {
  GDAL_DISABLE_READDIR_ON_OPEN: "EMPTY_DIR",
  GDAL_HTTP_MAX_RETRY: "5",
  GDAL_HTTP_RETRY_DELAY: "2",
};

// Corridor = habitat + every POI, in 0..360 °E, plus BUFFER_M (metres → degrees on the Mars sphere).
type Feature = { geometry: { type: string; coordinates: number[] } };
const points: number[][] = [
  HABITAT,
  ...JSON.parse(readFileSync("public/data/processed/sites.geojson", "utf8"))
    .features.filter((f: Feature) => f.geometry.type === "Point")
    .map((f: Feature) => f.geometry.coordinates),
].map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
const lons = points.map((p) => p[0]);
const lats = points.map((p) => p[1]);
const dLat = (BUFFER_M / R) * (180 / Math.PI);
const N = Math.max(...lats) + dLat;
const S = Math.min(...lats) - dLat;
const dLon = dLat / Math.cos((Math.max(Math.abs(N), Math.abs(S)) * Math.PI) / 180);
// Snap to the source grid so the cut is pixel-exact.
const snap = (v: number, f: (x: number) => number) => f(v / RES_DEG) * RES_DEG;
const [W, E] = [
  snap(Math.min(...lons) - dLon, Math.floor),
  snap(Math.max(...lons) + dLon, Math.ceil),
];
const [south, north] = [snap(S, Math.floor), snap(N, Math.ceil)];
const lon0 = (W + E) / 2;
console.log(
  `Corridor ${W.toFixed(3)}–${E.toFixed(3)} °E, ${south.toFixed(3)}–${north.toFixed(3)} °N (0..360, +${BUFFER_M / 1000} km)`,
);

// 1. Fetch the latitude band once, then cut both sides of the antimeridian and shift the west part by +360°.
const band = join(work, "dem-band.tif");
if (!existsSync(band)) {
  await execa(
    "gdal_translate",
    [
      "-q",
      "-projwin",
      "-180",
      String(north),
      "180",
      String(south),
      "-co",
      "COMPRESS=DEFLATE",
      "-co",
      "TILED=YES",
      SRC,
      band,
    ],
    { env },
  );
}
const east = join(work, "dem-east.tif"); // W..180 °E
const west = join(work, "dem-west.tif"); // 180..E °E, i.e. −180..E−360
await execa("gdal_translate", [
  "-q",
  "-projwin",
  String(W),
  String(north),
  "180",
  String(south),
  band,
  east,
]);
await execa("gdal_translate", [
  "-q",
  "-projwin",
  "-180",
  String(north),
  String(E - 360),
  String(south),
  band,
  west,
]);
const westShifted = join(work, "dem-west-0360.vrt");
const westInfo = JSON.parse((await execa("gdalinfo", ["-json", west])).stdout);
const [wx, wy] = westInfo.size;
await execa("gdal_translate", [
  "-q",
  "-of",
  "VRT",
  "-a_ullr",
  "180",
  String(north),
  String(180 + wx * RES_DEG),
  String(north - wy * RES_DEG),
  west,
  westShifted,
]);
const mars0360 = "+proj=longlat +R=3396190 +lon_wrap=180 +no_defs";
const dem0360 = join(work, "dem-0360.vrt");
await execa("gdalbuildvrt", ["-q", "-overwrite", "-a_srs", mars0360, dem0360, east, westShifted]);

// 2. Local metre grid → slope → back to lon/lat.
const local = `+proj=eqc +lat_ts=${LAT_TS} +lon_0=${lon0} +R=${R} +units=m +no_defs`;
const demLocal = join(work, "dem-local.tif");
const slopeLocal = join(work, "slope-local.tif");
const slope = join(work, "slope-deg.tif"); // Float32 degrees, for the overlay and stats
const published = join(out, "regional-slope.tif");
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-s_srs",
  mars0360,
  "-t_srs",
  local,
  "-tr",
  String(RES_M),
  String(RES_M),
  "-r",
  "bilinear",
  "-srcnodata",
  "-32768",
  "-dstnodata",
  "-32768",
  "-multi",
  "-co",
  "COMPRESS=DEFLATE",
  "-co",
  "TILED=YES",
  dem0360,
  demLocal,
]);
await execa("gdaldem", ["slope", "-q", "-co", "COMPRESS=DEFLATE", demLocal, slopeLocal]);
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  mars0360,
  "-te",
  ...[W, south, E, north].map(String),
  "-tr",
  String(RES_DEG),
  String(RES_DEG),
  "-r",
  "bilinear",
  "-srcnodata",
  "-9999",
  "-dstnodata",
  "-9999",
  "-of",
  "COG",
  "-co",
  "COMPRESS=DEFLATE",
  slopeLocal,
  slope,
]);
await execa("gdal_translate", [
  "-q",
  "-of",
  "COG",
  "-ot",
  "Int16",
  "-scale",
  "0",
  "90",
  "0",
  "900",
  "-a_scale",
  "0.1",
  "-a_nodata",
  "-9999",
  "-co",
  "COMPRESS=DEFLATE",
  "-co",
  "PREDICTOR=2",
  slope,
  published,
]);

// 3. Overlay tiles: the corridor is flat (mean < 1°), so the classes start at 1°: < 1° clear, then 1–2°, 2–5°,
//    5–10° (rover caution on MOLA), 10–20°, ≥ 20° (suit limit). Keep REGIONAL_SLOPE_LEGEND in sync.
const ramp = join(work, "slope-ramp.txt");
writeFileSync(
  ramp,
  [
    "0 0 0 0 0",
    "0.99 0 0 0 0",
    "1 255 240 170 90",
    "1.99 255 240 170 90",
    "2 250 220 90 130",
    "4.99 250 220 90 130",
    "5 245 150 50 170",
    "9.99 245 150 50 170",
    "10 230 90 40 200",
    `${maxSlope - 0.01} 230 90 40 200`,
    `${maxSlope} 200 30 30 220`,
    "90 200 30 30 220",
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
// Tiles are cut in −180..180 (MapLibre treats Mars degrees as Earth degrees), one side of ±180 at a time.
rmSync(tilesOut, { recursive: true, force: true });
mkdirSync(tilesOut, { recursive: true });
for (const [name, w, e, shift] of [
  ["east", W, 180, 0],
  ["west", 180, E, -360],
] as const) {
  const part = join(work, `slope-${name}.vrt`);
  await execa("gdal_translate", [
    "-q",
    "-of",
    "VRT",
    "-projwin",
    String(w),
    String(north),
    String(e),
    String(south),
    coloured,
    part,
  ]);
  const asEarth = join(work, `slope-${name}-as-4326.vrt`);
  await execa("gdal_translate", [
    "-q",
    "-of",
    "VRT",
    "-a_srs",
    "EPSG:4326",
    "-a_ullr",
    String(w + shift),
    String(north),
    String(e + shift),
    String(south),
    part,
    asEarth,
  ]);
  await execa("gdal2tiles", [
    "--xyz",
    "-z",
    "5-10",
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

// 4. Summary: share of valid cells at or above each class break.
const hist = JSON.parse(
  (
    await execa("gdalinfo", [
      "-json",
      "-stats",
      "-hist",
      "--config",
      "GDAL_PAM_ENABLED",
      "NO",
      slope,
    ])
  ).stdout,
);
const b = hist.bands[0];
const buckets: number[] = b.histogram.buckets;
const step = (b.histogram.max - b.histogram.min) / buckets.length;
const total = buckets.reduce((a, c) => a + c, 0);
const atLeast = (deg: number) =>
  Math.round(
    (10000 *
      buckets.reduce((a, c, i) => (b.histogram.min + (i + 0.5) * step >= deg ? a + c : a), 0)) /
      total,
  ) / 100;
const percent = {
  ge_1_deg: atLeast(1),
  ge_2_deg: atLeast(2),
  ge_5_deg: atLeast(5),
  ge_10_deg: atLeast(10),
  [`ge_${maxSlope}_deg`]: atLeast(maxSlope),
};
const info = JSON.parse((await execa("gdalinfo", ["-json", published])).stdout);
console.log(
  `regional slope: ${info.size.join(" × ")} cells, mean ${b.mean.toFixed(2)}°, ` +
    `≥1° ${percent.ge_1_deg} %, ≥2° ${percent.ge_2_deg} %, ≥5° ${percent.ge_5_deg} %, ≥10° ${percent.ge_10_deg} %, ≥${maxSlope}° ${percent[`ge_${maxSlope}_deg`]} %`,
);
writeFileSync(
  "public/data/processed/regional-slope.json",
  JSON.stringify(
    {
      units: "degrees (COG stores Int16 tenths of a degree: value / 10 = degrees)",
      source:
        "MOLA/HRSC blended DEM, 200 m/px (Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2, USGS Astrogeology)",
      source_url: SRC.replace("/vsicurl/", ""),
      attribution: "NASA/JPL/GSFC (MOLA); ESA/DLR/FU Berlin (HRSC); USGS Astrogeology",
      files: {
        cog: "data/processed/regional-slope/regional-slope.tif",
        tiles: "public/data/regional-slope/{z}/{x}/{y}.webp (z5–10)",
      },
      grid: {
        crs: mars0360,
        longitude_convention: "0..360 °E (the corridor crosses ±180; subtract 360 for −180..180)",
        bbox_0_360: [W, south, E, north].map((v) => Math.round(v * 1e6) / 1e6),
        size: info.size,
        resolution_deg: RES_DEG,
        resolution_m: RES_M,
        nodata: -9999,
      },
      method: {
        corridor: `habitat (${HABITAT.join(", ")}) + 4 POIs from sites.geojson, buffered ${BUFFER_M / 1000} km`,
        slope_grid: `local equirectangular metre grid, ${local}, ${RES_M} m, bilinear`,
        algorithm:
          "gdaldem slope (Horn 3×3), then bilinear back to lon/lat at the source resolution",
      },
      stats: { mean_deg: Math.round(b.mean * 100) / 100, max_deg: Math.round(b.maximum * 10) / 10 },
      percent_of_cells: percent,
      class_breaks_deg: [1, 2, 5, 10, maxSlope],
      caveats: [
        "200 m cells average out short steep slopes (crater walls, scarps, ridges narrower than a few hundred metres): use for drive-leg routing only, never for the final approach or the walking leg (use the 1 m HiRISE slope there).",
        "Real local slopes are steeper than this layer shows; treat a 200 m slope near the limit as a likely hazard.",
        `The slope threshold (${maxSlope}°, config.yaml slope_max_deg) is the suit/walking limit; the rover slope limit is not agreed yet.`,
        "The blended DEM is MOLA-only where HRSC has no coverage, so effective resolution can be coarser than 200 m between MOLA tracks.",
        "Local metre grid is true-scale at 45.5°N; east-west distances are off by ≤ ~3 % at the corridor's north/south edges.",
      ],
    },
    null,
    2,
  ) + "\n",
);
