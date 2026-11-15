// HiRISE science sites (water-ice POIs): 1 m DTMs + 0.25 m RED orthoimages → Mapbox XYZ tiles.
//   imagery: public/data/sites/<dtm>/imagery/{z}/{x}/{y}.webp, z11–17 (z17 ≈ 0.45 m/px on Mars)
//   terrain: public/data/terrain/dem/{z}/{x}/{y}.png, z9–15, HiRISE inside the DTM, MOLA around it
//   POIs + footprints: public/data/processed/sites.geojson
// Inputs: data/raw/hirise/<dtm>/ (see data/raw/README.md). Requires `pnpm pipe:mola` first.
// Usage: pnpm pipe:sites
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

import { MOLA_PIECES, MOLA_WORK } from "./mola-terrain-config.ts";
import {
  type BBox,
  type Grid,
  encodeTerrarium,
  forEachPixel,
  gridBBox,
  loadGrid,
  newTile,
  sample,
  tilesIn,
  writeTile,
} from "../lib/xyz.ts";

interface Site {
  dtm: string;
  /** Observation whose RED orthoimage we tile. */
  obs: string;
  title: string;
  confirmed: boolean;
}

// Shortlist from the ODE search (CLAUDE.md Step 2a). Titles are the HiRISE team's.
const SITES: Site[] = [
  {
    dtm: "DTEEC_033225_2250_033146_2250_A01",
    obs: "ESP_033225_2250",
    title: "Possible Terraced Crater in Arcadia Planitia",
    confirmed: false,
  },
  {
    dtm: "DTEEC_034082_2260_033014_2260_A01",
    obs: "ESP_034082_2260",
    title: "Possible Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: false,
  },
  {
    dtm: "DTEEC_037352_2245_037418_2245_A01",
    obs: "ESP_037352_2245",
    title: "Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: true,
  },
  {
    dtm: "DTEEC_054060_2265_054126_2265_A01",
    obs: "ESP_054060_2265",
    title: "Ridges in Arcadia Planitia",
    confirmed: false,
  },
];

const MARS = "+proj=longlat +R=3396190 +no_defs";
const DEG_PER_M = 360 / (2 * Math.PI * 3396190);
const IMAGERY_ZOOMS = "11-17";
const TERRAIN_MIN_ZOOM = 9;
const TERRAIN_MAX_ZOOM = 15; // ~1.8 m mesh; the 0.45 m imagery carries the fine detail
const PAD_DEG = 0.02; // ~1 km of MOLA around each DTM so the terrain blends into the region
const only = process.argv[2]; // optional: one DTM id

const molaGrids = Object.fromEntries(
  await Promise.all(
    Object.keys(MOLA_PIECES).map(async (k) => [k, await loadGrid(join(MOLA_WORK, `dem-${k}.tif`))]),
  ),
) as Record<string, Grid>;
const sampleMola = (lon: number, lat: number) =>
  sample(molaGrids[lon >= 0 ? "west" : "east"], 0, lon, lat);

const features: object[] = [];

for (const site of SITES) {
  if (only && site.dtm !== only) continue;
  const raw = join("data/raw/hirise", site.dtm);
  const work = join("data/interim/hirise", site.dtm);
  const imageryOut = join("public/data/sites", site.dtm, "imagery");
  mkdirSync(work, { recursive: true });
  console.log(`== ${site.dtm}`);

  // The DTM label's projection is authoritative. Some RED_A JP2 GeoJP2 headers carry a broken
  // standard parallel (lands the image at ~85–90°N), so the ortho gets the DTM's CRS; their
  // projected metre coordinates match exactly.
  const srs = join(work, "dtm-srs.wkt");
  writeFileSync(
    srs,
    (await execa("gdalsrsinfo", ["-o", "wkt", join(raw, `${site.dtm}.IMG`)])).stdout,
  );

  const dem = join(work, "dem.tif");
  await execa("gdalwarp", [
    ...["-q", "-overwrite", "-r", "bilinear", "-ot", "Float32"],
    ...["-srcnodata", "-3.4028227e+38", "-dstnodata", "-32768"],
    ...["-t_srs", MARS, "-tr", String(DEG_PER_M), String(DEG_PER_M)],
    ...["-co", "COMPRESS=DEFLATE", "-co", "TILED=YES"],
    ...[join(raw, `${site.dtm}.IMG`), dem],
  ]);

  const orthoFixed = join(work, "ortho-fixed.vrt");
  await execa("gdal_translate", [
    ...["-q", "-of", "VRT", "-a_srs", srs],
    ...[join(raw, `${site.obs}_RED_A_01_ORTHO.JP2`), orthoFixed],
  ]);
  const ortho = join(work, "ortho.tif");
  const orthoRes = String(DEG_PER_M * 0.45); // z17 pixel size; no point keeping 0.25 m past it
  await execa("gdalwarp", [
    ...["-q", "-overwrite", "-r", "average", "-srcnodata", "0", "-dstalpha"],
    ...["-t_srs", MARS, "-tr", orthoRes, orthoRes],
    ...["-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", "-co", "BIGTIFF=IF_SAFER"],
    ...[orthoFixed, ortho],
  ]);
  // gdal2tiles only knows Earth; label the Mars lon/lat as EPSG:4326 so tiles land where Mapbox
  // puts Mars degrees (Mapbox assumes Earth too).
  const orthoAsEarth = join(work, "ortho-as-4326.vrt");
  // Grey + alpha → RGBA: WebP tiles need 3 or 4 bands (HiRISE RED is greyscale).
  await execa("gdal_translate", [
    ...["-q", "-of", "VRT", "-a_srs", "EPSG:4326"],
    ...["-b", "1", "-b", "1", "-b", "1", "-b", "2"],
    ...[ortho, orthoAsEarth],
  ]);
  rmSync(imageryOut, { recursive: true, force: true });
  mkdirSync(imageryOut, { recursive: true });
  await execa("gdal2tiles", [
    ...["--xyz", "-z", IMAGERY_ZOOMS, "-w", "none", "-r", "average"],
    ...["--tiledriver", "WEBP", "--webp-quality", "80", "--processes", "8"],
    ...[orthoAsEarth, imageryOut],
  ]);

  // Terrain: HiRISE where it has data, MOLA elsewhere in the padded box.
  const g = await loadGrid(dem);
  const b = gridBBox(g);
  const padded: BBox = {
    west: b.west - PAD_DEG,
    south: b.south - PAD_DEG,
    east: b.east + PAD_DEG,
    north: b.north + PAD_DEG,
  };
  let tiles = 0;
  for (let z = TERRAIN_MIN_ZOOM; z <= TERRAIN_MAX_ZOOM; z++) {
    for (const { x, y } of tilesIn(padded, z)) {
      const tile = newTile();
      forEachPixel(z, x, y, (lon, lat, i) => {
        encodeTerrarium(tile, i, sample(g, 0, lon, lat) ?? sampleMola(lon, lat) ?? 0, false);
      });
      writeTile("public/data/terrain/dem", z, x, y, tile);
      tiles++;
    }
  }

  const footprint = join(work, "footprint.geojson");
  rmSync(footprint, { force: true });
  await execa("gdal_footprint", ["-q", "-t_srs", MARS, "-max_points", "64", dem, footprint]);
  const poly = JSON.parse(readFileSync(footprint, "utf8")).features[0].geometry;
  const center = [(b.west + b.east) / 2, (b.south + b.north) / 2];
  const props = {
    id: site.dtm,
    hirise_id: site.obs,
    title: site.title,
    confirmed: site.confirmed,
    objective: "Water ice (ISRU): terraced craters indicate buried ice layers",
    url: `https://www.uahirise.org/${site.obs}`,
    bbox: [b.west, b.south, b.east, b.north],
    source: "MRO HiRISE DTM + RED orthoimage (Univ. of Arizona / NASA PDS)",
  };
  features.push({ type: "Feature", properties: { ...props, kind: "footprint" }, geometry: poly });
  features.push({
    type: "Feature",
    // POI at the DTM centre: HiRISE targeted the crater, but its exact centre is approximate.
    properties: { ...props, kind: "poi", position_note: "DTM centre; crater centre approximate" },
    geometry: { type: "Point", coordinates: center },
  });
  console.log(
    `   imagery z${IMAGERY_ZOOMS}, ${tiles} terrain tiles, centre ${center.map((v) => v.toFixed(4))}`,
  );
}

if (!only) {
  writeFileSync(
    "public/data/processed/sites.geojson",
    JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n",
  );
}
