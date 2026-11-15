// Geologic units along the drive corridor (habitat → 4 HiRISE sites), for context on the map and in the mission summary.
// Source: Tanaka et al. (2014), Geologic Map of Mars, USGS SIM 3292, 1:20,000,000 — the newest map covering all sites
//   (the only other one, the 2005 Northern Plains map SIM 2888 at 1:15M, is older and superseded by it).
//   Shapefile SIM3292_Global_Geology.shp: lon/lat on the Mars 2000 sphere (R = 3,396,190 m), −180..180 east-positive,
//   so "reprojecting" only means labelling it +proj=longlat +R=3396190 — no coordinates change.
// Corridor = the bbox of the regional slope (pnpm pipe:regional-slope), clipped either side of ±180.
// Outputs (committed, small):
//   public/data/processed/geology.geojson       — unit polygons clipped to the corridor (unit, unit_name, age, description)
//   public/data/processed/geology-sites.json    — unit at each POI + habitat, distance to the nearest contact, caveats
// Usage: pnpm pipe:geology
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { booleanPointInPolygon } from "@turf/turf";
import { execa } from "execa";

const URL = "https://pubs.usgs.gov/sim/3292/downloads/sim3292_database.zip";
const raw = "data/raw/geology";
const zip = join(raw, "sim3292_database.zip");
const shpDir = "SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles";
const shp = join(raw, shpDir, "SIM3292_Global_Geology.shp");
const work = "data/interim/geology";
const R = 3396190;
const MARS = "+proj=longlat +R=3396190 +no_defs";
const MAX_BYTES = 2_000_000;
const HABITAT: [number, number] = [-176.05, 45.97];
mkdirSync(raw, { recursive: true });
mkdirSync(work, { recursive: true });

if (!existsSync(shp)) {
  if (!existsSync(zip)) await execa("curl", ["-sSfL", "-o", zip, URL]);
  await execa("unzip", ["-q", "-o", zip, `${shpDir}/SIM3292_Global_Geology.*`, "-d", raw]);
}

// Short descriptions paraphrased from the SIM 3292 Description of Map Units (sim3292_dmu_with_locality_images.pdf).
// Only the units that occur in the corridor; anything else falls back to the map's own unit name.
const UNITS: Record<string, string> = {
  Av:
    "Rugged, hummocky, pitted plains of poorly defined flows, hundreds to >1,000 km across; " +
    "interpreted as lava and perhaps volcaniclastic flows. Tens of metres or more thick.",
  lAv:
    "Planar flood lavas with lobate scarps, sinuous troughs and platy textures; largely unmodified flows " +
    "from fissures and shields. Metres to tens of metres thick.",
  mAl:
    "Hummocky to undulating, internally stratified deposits; interpreted as ice-rich loess modified by " +
    "periglacial processes (thumbprint terrain, pedestal craters). Tens of metres thick.",
  lHl:
    "Planar to undulating plains across most of the northern lowlands; sediments from outflow channels and " +
    "highland margins, likely with lavas; pervasively modified by periglaciation and mantling. Hundreds of metres to km thick.",
  lHt:
    "Relatively smooth plains near the highland/lowland boundary with small knobs and mesas; mass-wasting, " +
    "fluvial/lacustrine and possibly volcanic materials.",
  eHt:
    "Undulating to moderately rugged plains with scattered knobs and mesas of highland material; mass-wasting, " +
    "fluvial/lacustrine and other sediments, possibly volcanic rocks.",
};

// Unit codes carry their age (Tanaka et al. 2014): optional e/m/l (Early/Middle/Late) + A/H/N, or two periods (e.g. AH).
function ageOf(code: string): string {
  const period: Record<string, string> = { A: "Amazonian", H: "Hesperian", N: "Noachian" };
  const epoch: Record<string, string> = { e: "Early", m: "Middle", l: "Late" };
  const m = /^([eml]?)([AHN])([AHN]?)/.exec(code);
  if (!m) return "unknown";
  const [, e, p1, p2] = m;
  if (p2) return `${period[p1]} to ${period[p2]}`;
  return e ? `${epoch[e]} ${period[p1]}` : period[p1];
}

// Corridor from the regional slope summary (0..360 °E) → two boxes in −180..180.
const slope = JSON.parse(readFileSync("public/data/processed/regional-slope.json", "utf8"));
const [W, S, E, N] = slope.grid.bbox_0_360 as number[];
const boxes = [
  [W, S, 180, N],
  [-180, S, E - 360, N],
];

type Ring = number[][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: Geometry };
const read = async (args: string[]) =>
  JSON.parse(
    (
      await execa("ogr2ogr", [
        "-f",
        "GeoJSON",
        "/vsistdout/",
        shp,
        "-a_srs",
        MARS,
        "-select",
        "Unit,UnitDesc",
        ...args,
      ])
    ).stdout,
  ).features as Feature[];

const toFeature = (f: Feature, extra: Record<string, unknown> = {}): Feature => {
  const unit = String(f.properties.Unit);
  return {
    type: "Feature",
    properties: {
      unit,
      unit_name: String(f.properties.UnitDesc),
      age: ageOf(unit),
      description: UNITS[unit] ?? String(f.properties.UnitDesc),
      ...extra,
    },
    geometry: f.geometry,
  };
};

async function writeCorridor(simplifyDeg: number | null) {
  const features: Feature[] = [];
  for (const box of boxes) {
    const args = ["-clipsrc", ...box.map(String), "-lco", "COORDINATE_PRECISION=5"];
    if (simplifyDeg) args.push("-simplify", String(simplifyDeg));
    for (const f of await read(args)) features.push(toFeature(f));
  }
  const body = JSON.stringify({
    type: "FeatureCollection",
    name: "geology",
    source: "Tanaka et al. (2014), Geologic Map of Mars, USGS SIM 3292, 1:20M",
    attribution: "USGS Astrogeology / NASA (Tanaka et al. 2014, SIM 3292)",
    crs_note:
      "lon/lat on the Mars 2000 sphere (R = 3,396,190 m), −180..180 east-positive; split at ±180",
    simplified_deg: simplifyDeg,
    features,
  });
  writeFileSync("public/data/processed/geology.geojson", body + "\n");
  return { count: features.length, bytes: Buffer.byteLength(body) };
}

let simplify: number | null = null;
let result = await writeCorridor(simplify);
while (result.bytes > MAX_BYTES) {
  simplify = simplify ? simplify * 2 : 0.005; // 0.005° ≈ 300 m on Mars — far below the map's ~km-scale contacts
  result = await writeCorridor(simplify);
}
console.log(
  `geology.geojson: ${result.count} polygons, ${(result.bytes / 1e6).toFixed(2)} MB` +
    (simplify ? ` (simplified ${simplify}°)` : " (not simplified)"),
);

// Unit at each place + great-circle-ish distance to the nearest unit contact (unclipped polygons; the artificial
// ±180 seam of the source is skipped). Local equirectangular metres around the point — fine at these distances.
const sites = JSON.parse(readFileSync("public/data/processed/sites.geojson", "utf8"))
  .features.filter((f: { geometry: { type: string } }) => f.geometry.type === "Point")
  .map(
    (f: {
      properties: { hirise_id: string; title?: string };
      geometry: { coordinates: number[] };
    }) => ({
      id: f.properties.hirise_id,
      lonlat: f.geometry.coordinates as [number, number],
    }),
  );
const places = [...sites, { id: "habitat", lonlat: HABITAT }];
const all = [
  ...(await read(["-spat", ...boxes[0].map(String)])),
  ...(await read(["-spat", ...boxes[1].map(String)])),
];

function rings(g: Geometry): Ring[] {
  return g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
}
function distanceToContactM([lon0, lat0]: [number, number], g: Geometry): number {
  const k = (Math.PI / 180) * R;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const xy = ([lon, lat]: number[]) => {
    let d = lon - lon0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return [d * k * cos, (lat - lat0) * k];
  };
  let best = Infinity;
  for (const ring of rings(g)) {
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      if (Math.abs(a[0]) >= 179.9999 && Math.abs(b[0]) >= 179.9999) continue; // ±180 seam, not a contact
      const [ax, ay] = xy(a);
      const [bx, by] = xy(b);
      const [dx, dy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

const rows = places.map(({ id, lonlat }) => {
  const hit = all.find((f) => booleanPointInPolygon(lonlat, f.geometry));
  if (!hit) return { id, lon: lonlat[0], lat: lonlat[1], unit: null };
  const f = toFeature(hit).properties;
  const km = Math.round(distanceToContactM(lonlat, hit.geometry) / 100) / 10;
  console.log(`${id}: ${f.unit} (${f.unit_name}, ${f.age}); nearest contact ${km} km`);
  return { id, lon: lonlat[0], lat: lonlat[1], ...f, nearest_contact_km: km };
});

writeFileSync(
  "public/data/processed/geology-sites.json",
  JSON.stringify(
    {
      source:
        "Tanaka, K. L. et al. (2014). Geologic Map of Mars. USGS Scientific Investigations Map 3292, scale 1:20,000,000.",
      source_url: "https://pubs.usgs.gov/sim/3292/",
      attribution: "USGS Astrogeology / NASA (Tanaka et al. 2014, SIM 3292)",
      map_scale: "1:20,000,000",
      corridor_bbox_0_360: [W, S, E, N],
      geojson: "public/data/processed/geology.geojson",
      simplified_deg: simplify,
      caveats: [
        "Global 1:20M map: unit contacts are placed to within kilometres to tens of kilometres, so this is regional context, not what is under the rover's wheels.",
        "Units are mapped from orbit (morphology, crater counts); none of these units has been visited in Arcadia Planitia.",
        "The metres-thick ice-rich mantle seen in the HiRISE images at every site (Mustard et al. 2001) is too thin and patchy for this map; the mapped unit is what lies beneath it.",
        "Ages are relative epochs from crater statistics, not radiometric dates.",
        "nearest_contact_km is measured to the mapped contact; treat values under ~10 km as 'near a contact', not a precise distance.",
      ],
      places: rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `geology.geojson ${(statSync("public/data/processed/geology.geojson").size / 1e6).toFixed(2)} MB`,
);
