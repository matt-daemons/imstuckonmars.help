// Gathers the HiRISE water-ice site outputs into one folder for M's R2 upload:
//   data/map-assets/sites-v1/sites/<dtm>/{imagery,terrain,slope}/{z}/{x}/{y}  (map tiles)
//   data/map-assets/sites-v1/slope/<HiRISE ID>_slope.tif                       (routing COGs, Int16 tenths of a degree)
//   data/map-assets/sites-v1/sites.geojson + catalog.json
// Upload: MAP_RELEASE_CONFIG=pipelines/sites-release.json pnpm maps:upload
// Usage: pnpm sites:package (after pnpm pipe:sites and pnpm pipe:slope for every site)
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = "data/map-assets/sites-v1";
const sites = JSON.parse(
  await (await import("node:fs/promises")).readFile("public/data/processed/sites.geojson", "utf8"),
) as { features: { properties: { id: string; hirise_id: string; kind: string } }[] };
const pois = sites.features.filter((f) => f.properties.kind === "poi").map((f) => f.properties);

await rm(root, { recursive: true, force: true });
await mkdir(join(root, "slope"), { recursive: true });
let sourceBytes = 0;
for (const { id, hirise_id } of pois) {
  for (const layer of ["imagery", "terrain", "slope"]) {
    await cp(join("public/data/sites", id, layer), join(root, "sites", id, layer), {
      recursive: true,
    });
  }
  await cp(
    join("data/processed/sites", id, "slope.tif"),
    join(root, "slope", `${hirise_id}_slope.tif`),
  );
  for (const file of await readdir(join("data/raw/hirise", id))) {
    sourceBytes += (await stat(join("data/raw/hirise", id, file))).size;
  }
}
await cp("public/data/processed/sites.geojson", join(root, "sites.geojson"));
// upload-map-assets.py checks sourceBytes (raw HiRISE downloads) against the release's budget.
await writeFile(
  join(root, "catalog.json"),
  JSON.stringify(
    {
      id: "sites-v1",
      sourceBytes,
      attribution: "NASA/JPL/University of Arizona (MRO HiRISE)",
      sites: pois.map((p) => p.id),
      layout: {
        imagery: "sites/<dtm>/imagery/{z}/{x}/{y}.webp (z11–17, ~0.45 m/px)",
        terrain: "sites/<dtm>/terrain/{z}/{x}/{y}.png (Terrarium, z9–15, +10 km display offset)",
        slopeTiles: "sites/<dtm>/slope/{z}/{x}/{y}.webp (z11–16, colour classes)",
        slopeCogs: "slope/<HiRISE ID>_slope.tif (Int16, value / 10 = degrees, nodata −9999)",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Packaged ${pois.length} sites into ${root} (raw source ${(sourceBytes / 1e9).toFixed(2)} GB)`,
);
