// Gathers the HiRISE water-ice site outputs into one folder for M's R2 upload:
//   data/map-assets/sites-v2/sites/<dtm>/{imagery,terrain,slope,roughness}/{z}/{x}/{y}  (map tiles)
//   data/map-assets/sites-v2/slope/<HiRISE ID>_slope.tif          (routing COGs, Int16 tenths of a degree)
//   data/map-assets/sites-v2/roughness/<HiRISE ID>_roughness.tif  (Int16 cm, same grid as slope)
//   data/map-assets/sites-v2/thermal-inertia/{z}/{x}/{y}.webp     (regional THEMIS overlay, pnpm pipe:thermal-inertia)
//   data/map-assets/sites-v2/regional-slope/{z}/{x}/{y}.webp      (regional 200 m slope, pnpm pipe:regional-slope)
//   data/map-assets/sites-v2/sites.geojson + catalog.json
// sites-v1 (no roughness) is an immutable prefix on R2, so roughness ships as a new version. The two regional
// overlays ride along so all of Role B's tiles share one upload and one prefix.
// Upload: MAP_RELEASE_CONFIG=pipelines/sites-release-v2.json pnpm maps:upload
// Usage: pnpm sites:package (after pnpm pipe:sites, pipe:slope and pipe:roughness for every site,
// pipe:thermal-inertia and pipe:regional-slope)
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const version = "sites-v2";
const root = join("data/map-assets", version);
const sites = JSON.parse(
  await (await import("node:fs/promises")).readFile("public/data/processed/sites.geojson", "utf8"),
) as { features: { properties: { id: string; hirise_id: string; kind: string } }[] };
const pois = sites.features.filter((f) => f.properties.kind === "poi").map((f) => f.properties);

await rm(root, { recursive: true, force: true });
await mkdir(join(root, "slope"), { recursive: true });
await mkdir(join(root, "roughness"), { recursive: true });
let sourceBytes = 0;
for (const { id, hirise_id } of pois) {
  for (const layer of ["imagery", "terrain", "slope", "roughness"]) {
    await cp(join("public/data/sites", id, layer), join(root, "sites", id, layer), {
      recursive: true,
    });
  }
  await cp(
    join("data/processed/sites", id, "slope.tif"),
    join(root, "slope", `${hirise_id}_slope.tif`),
  );
  await cp(
    join("data/processed/sites", id, "roughness.tif"),
    join(root, "roughness", `${hirise_id}_roughness.tif`),
  );
  for (const file of await readdir(join("data/raw/hirise", id))) {
    sourceBytes += (await stat(join("data/raw/hirise", id, file))).size;
  }
}
for (const layer of ["thermal-inertia", "regional-slope"]) {
  await cp(join("public/data", layer), join(root, layer), { recursive: true });
}
await cp("public/data/processed/sites.geojson", join(root, "sites.geojson"));
// upload-map-assets.py checks sourceBytes (raw HiRISE downloads) against the release's budget.
await writeFile(
  join(root, "catalog.json"),
  JSON.stringify(
    {
      id: version,
      sourceBytes,
      attribution: "NASA/JPL/University of Arizona (MRO HiRISE)",
      regionalAttribution: {
        "thermal-inertia": "NASA/JPL-Caltech/Arizona State University/USGS (THEMIS)",
        "regional-slope":
          "NASA/GSFC (MOLA); ESA/DLR/FU Berlin (HRSC); USGS Astrogeology (blended DEM)",
      },
      sites: pois.map((p) => p.id),
      layout: {
        imagery: "sites/<dtm>/imagery/{z}/{x}/{y}.webp (z11–17, ~0.45 m/px)",
        terrain: "sites/<dtm>/terrain/{z}/{x}/{y}.png (Terrarium, z9–15, +10 km display offset)",
        slopeTiles: "sites/<dtm>/slope/{z}/{x}/{y}.webp (z11–16, colour classes)",
        slopeCogs: "slope/<HiRISE ID>_slope.tif (Int16, value / 10 = degrees, nodata −9999)",
        roughnessTiles: "sites/<dtm>/roughness/{z}/{x}/{y}.webp (z11–16, colour classes)",
        roughnessCogs:
          "roughness/<HiRISE ID>_roughness.tif (Int16 cm, value / 100 = m RMS height deviation from the 5 m trend; 5 m cells, same lon/lat grid as the slope COG; nodata −9999)",
        thermalInertiaTiles:
          "thermal-inertia/{z}/{x}/{y}.webp (z5–11, 3 colour classes, 170–196°E 43–48°N)",
        regionalSlopeTiles:
          "regional-slope/{z}/{x}/{y}.webp (z5–10, colour classes, drive corridor)",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Packaged ${pois.length} sites into ${root} (raw source ${(sourceBytes / 1e9).toFixed(2)} GB)`,
);
