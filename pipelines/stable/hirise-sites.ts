// HiRISE science sites (water-ice POIs): 1 m DTMs + 0.25 m RED orthoimages → Mapbox XYZ tiles.
//   imagery: public/data/sites/<dtm>/imagery/{z}/{x}/{y}.webp, z11–17 (z17 ≈ 0.45 m/px on Mars)
//   terrain: public/data/sites/<dtm>/terrain/{z}/{x}/{y}.png, z9–15, HiRISE inside the DTM, MOLA around it,
//            display-shifted by DISPLAY_ELEVATION_OFFSET_M like the team's other terrain sources
//   Mapbox upload: data/interim/hirise/<dtm>/<obs>_mapbox.tif (JPEG GeoTIFF for M's Mapbox account;
//                  named by HiRISE ID because Mapbox Studio names each tileset after the file)
//   POIs + footprints: public/data/processed/sites.geojson
// Inputs: data/raw/hirise/<dtm>/ (see data/raw/README.md).
// Usage: pnpm pipe:sites [dtm-id]   (REBUILD_IMAGERY=1 to re-cut imagery tiles that already exist)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

import { DISPLAY_ELEVATION_OFFSET_M } from "../../lib/mars/terrain.ts";
import {
  type BBox,
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
  kind: "crater" | "ridges";
  /** POI lon/lat (east-positive −180..180). */
  poi: [number, number];
  poiNote: string;
}

// Shortlist from the ODE search (CLAUDE.md Step 2a). Titles are the HiRISE team's.
const SITES: Site[] = [
  {
    dtm: "DTEEC_033225_2250_033146_2250_A01",
    obs: "ESP_033225_2250",
    title: "Possible Terraced Crater in Arcadia Planitia",
    confirmed: false,
    kind: "crater",
    poi: [-176.33383, 44.41589],
    poiNote:
      "Picked by Claude from the orthoimage (most prominent crater, ~130 m, 12 m deep); refined on DTM. Confirm.",
  },
  {
    dtm: "DTEEC_034082_2260_033014_2260_A01",
    obs: "ESP_034082_2260",
    title: "Possible Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: false,
    kind: "crater",
    poi: [-171.38243, 45.64829],
    poiNote: "Circled by Jess on the HiRISE browse image; refined on DTM (bowl ~28 m deep).",
  },
  {
    dtm: "DTEEC_037352_2245_037418_2245_A01",
    obs: "ESP_037352_2245",
    title: "Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: true,
    kind: "crater",
    poi: [-166.14298, 44.39035],
    poiNote: "Circled by Jess on the HiRISE browse image; refined on DTM (bowl ~41 m deep).",
  },
  {
    dtm: "DTEEC_054060_2265_054126_2265_A01",
    obs: "ESP_054060_2265",
    title: "Ridges in Arcadia Planitia",
    confirmed: false,
    kind: "ridges",
    poi: [172.56388, 46.07022],
    poiNote: "Not a crater: ridges worth exploring for ice. POI at the DTM centre.",
  },
];

const MARS = "+proj=longlat +R=3396190 +no_defs";
const DEG_PER_M = 360 / (2 * Math.PI * 3396190);
const IMAGERY_ZOOMS = "11-17";
const TERRAIN_MIN_ZOOM = 9;
const TERRAIN_MAX_ZOOM = 15; // ~1.8 m mesh; the 0.45 m imagery carries the fine detail
const PAD_DEG = 0.02; // ~1 km of MOLA around each DTM so the terrain blends into the region
const MOLA_URL =
  "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif";
export const ATTRIBUTION = "NASA/JPL/University of Arizona";
const only = process.argv[2]; // optional: one DTM id

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
  if (process.env.REBUILD_IMAGERY || !existsSync(join(imageryOut, "17"))) {
    rmSync(imageryOut, { recursive: true, force: true });
    mkdirSync(imageryOut, { recursive: true });
    await execa("gdal2tiles", [
      ...["--xyz", "-z", IMAGERY_ZOOMS, "-w", "none", "-r", "average"],
      ...["--tiledriver", "WEBP", "--webp-quality", "80", "--processes", "8"],
      ...[orthoAsEarth, imageryOut],
    ]);
  }
  // Same image as one GeoTIFF for a Mapbox raster tileset upload (Mapbox tiles it itself).
  // Grey → RGB + mask with JPEG: ~10× smaller than RGBA deflate. Quality 75: no visible loss at full
  // resolution, with headroom for Mapbox re-compressing its own tiles (65 also looked identical).
  await execa("gdal_translate", [
    ...["-q", "-of", "COG", "-b", "1", "-b", "1", "-b", "1", "-mask", "4"],
    ...["-co", "COMPRESS=JPEG", "-co", "QUALITY=75", "-co", "BIGTIFF=IF_SAFER"],
    ...[orthoAsEarth, join(work, `${site.obs}_mapbox.tif`)],
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
  const molaPath = join(work, "mola-pad.tif");
  await execa("gdalwarp", [
    ...["-q", "-overwrite", "-r", "bilinear", "-t_srs", MARS],
    ...[
      "-te",
      ...[padded.west - 0.02, padded.south - 0.02, padded.east + 0.02, padded.north + 0.02].map(
        String,
      ),
    ],
    "-tr",
    "0.0078125",
    "0.0078125",
    MOLA_URL,
    molaPath,
  ]);
  const mola = await loadGrid(molaPath);
  const terrainOut = join("public/data/sites", site.dtm, "terrain");
  rmSync(terrainOut, { recursive: true, force: true });
  let tiles = 0;
  for (let z = TERRAIN_MIN_ZOOM; z <= TERRAIN_MAX_ZOOM; z++) {
    for (const { x, y } of tilesIn(padded, z)) {
      const tile = newTile();
      forEachPixel(z, x, y, (lon, lat, i) => {
        const h = sample(g, 0, lon, lat) ?? sample(mola, 0, lon, lat) ?? 0;
        encodeTerrarium(tile, i, h + DISPLAY_ELEVATION_OFFSET_M, false);
      });
      writeTile(terrainOut, z, x, y, tile);
      tiles++;
    }
  }

  const footprint = join(work, "footprint.geojson");
  rmSync(footprint, { force: true });
  await execa("gdal_footprint", ["-q", "-t_srs", MARS, "-max_points", "64", dem, footprint]);
  const poly = JSON.parse(readFileSync(footprint, "utf8")).features[0].geometry;
  const props = {
    id: site.dtm,
    hirise_id: site.obs,
    title: site.title,
    confirmed: site.confirmed,
    site_kind: site.kind,
    objective: "Water-ice procurement (ISRU): terraced craters and ridges indicate buried ice",
    url: `https://www.uahirise.org/${site.obs}`,
    bbox: [b.west, b.south, b.east, b.north],
    terrain_bbox: [padded.west, padded.south, padded.east, padded.north],
    source: `MRO HiRISE DTM + RED orthoimage — ${ATTRIBUTION}`,
    attribution: ATTRIBUTION,
  };
  features.push({ type: "Feature", properties: { ...props, kind: "footprint" }, geometry: poly });
  features.push({
    type: "Feature",
    properties: { ...props, kind: "poi", position_note: site.poiNote },
    geometry: { type: "Point", coordinates: site.poi },
  });
  console.log(`   imagery z${IMAGERY_ZOOMS}, ${tiles} terrain tiles, POI ${site.poi.join(", ")}`);
}

if (!only) {
  writeFileSync(
    "public/data/processed/sites.geojson",
    JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n",
  );
}
