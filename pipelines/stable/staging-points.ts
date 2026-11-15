// Rover staging (parking) points for the walking EVA leg: where the crew could leave the rover and walk to each POI.
// Same rule as the app's findStagingPoint (lib/mars/site-grid.ts), decided Sun Nov 15 (CLAUDE.md §7 item 5); the app
// uses its own finder at runtime, this file is the offline check per site.
// For each HiRISE site (run after pipe:slope and pipe:roughness):
//   1. Warp slope.tif + roughness.tif onto a 10 m grid in an azimuthal-equidistant projection centred on the POI
//      (Mars sphere), so a cell's distance from the centre is its true ground distance to the POI on the sphere.
//      Cells keep the WORST value inside them (gdalwarp -r max) and must be fully inside the DTM.
//   2. Parkable cell = slope ≤ ROVER_SLOPE_MAX_DEG and roughness ≤ ROVER_ROUGHNESS_MAX_M, between MIN_STANDOFF_M and
//      walk_back_max_km (config.yaml) from the POI. Spot = a 4 × 4 block of parkable cells (40 × 40 m). If a site has
//      no spot, it is retried at ROVER_SLOPE_FALLBACK_DEG and flagged.
//   3. Walk = straight line spot → POI, sampled every metre on the 1 m slope; any sample outside the DTM marks the
//      walk as leaving the footprint (flagged, never guessed).
//   4. Rank: score = walk_km × (1 + 10 × share of walk ≥ slope_max_deg); greedy top 3 at least MIN_SEPARATION_M apart.
// Output: public/data/processed/staging-points.geojson (top 3 per site).
// The parking limits are a team decision, not NASA flight rules — config.yaml is left untouched on purpose.
// Usage: pnpm pipe:staging [dtm-id]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";
import { fromFile } from "geotiff";
import { parse } from "yaml";

// Team decision (Sun Nov 15): max 1 m slope 5° anywhere in the square, conservative next to Apollo 15 Mission Report
// §9.8.3 (LRV "roll instability would be approached on the 15-degree slopes"). No 40 m square near ESP_034082 meets 5°
// (DTM noise and polygon troughs add metre-scale slope), so a site without one falls back to 10°, flagged.
const ROVER_SLOPE_MAX_DEG = 5;
const ROVER_SLOPE_FALLBACK_DEG = 10;
// Team decision (Sun Nov 15): Apollo LRV ground clearance 36 cm loaded (NASA NSSDC); Apollo 15 drove over a 30 cm block
// (Mission Report §9.8.3). RMS roughness 0.25 m ≈ the 1 m DTM's noise floor (Kirk et al. 2008), so this mostly
// excludes crater rims, troughs and scarps rather than individual rocks.
const ROVER_ROUGHNESS_MAX_M = 0.25;
const CELL_M = 10;
const BLOCK_CELLS = 4; // 4 × 4 cells of 10 m = the 40 m parking square
// Team decision (Sun Nov 15): park at the nearest square at least 25 m out, after Apollo 17 Station 7 (LRV ~25 m from
// the boulder). NASA sets only a maximum (stay within a 1-hour walk back to the rover, EVA-EXP-0042 §9.6).
const MIN_STANDOFF_M = 25;
const MIN_SEPARATION_M = 250; // ASSUMPTION: alternatives should be genuinely different spots/approach directions
const SLOPE_PENALTY = 10; // score multiplier per unit share of the walk at or above the suit slope limit
const R = 3396190;

const config = parse(readFileSync("config.yaml", "utf8"));
const suitSlopeMax = Number(config.thresholds.slope_max_deg);
const walkBackM = Number(config.thresholds.walk_back_max_km) * 1000;

type Site = { id: string; hirise_id: string; lonlat: [number, number] };
const allSites: Site[] = JSON.parse(readFileSync("public/data/processed/sites.geojson", "utf8"))
  .features.filter((f: { properties: { kind: string } }) => f.properties.kind === "poi")
  .map(
    (f: {
      properties: { id: string; hirise_id: string };
      geometry: { coordinates: [number, number] };
    }) => ({
      id: f.properties.id,
      hirise_id: f.properties.hirise_id,
      lonlat: f.geometry.coordinates,
    }),
  );
const only = process.argv[2];
const sites = only ? allSites.filter((s) => s.id === only) : allSites;
if (sites.length === 0) throw new Error(`unknown dtm ${only}`);

const assumptions = [
  `Rover parking: no 1 m slope over ${ROVER_SLOPE_MAX_DEG}° in the square; a site with no such square falls back to ${ROVER_SLOPE_FALLBACK_DEG}°, flagged slope_fallback (team decision; Apollo 15 Mission Report §9.8.3: LRV roll instability approached on 15° slopes).`,
  `Rover parking roughness ≤ ${ROVER_ROUGHNESS_MAX_M} m RMS on 5 m cells (team decision; LRV ground clearance 36 cm, NASA NSSDC). The 1 m DTM cannot see single rocks.`,
  `Each ${CELL_M} m cell takes the worst (max) slope and roughness inside it; a spot needs a ${BLOCK_CELLS} × ${BLOCK_CELLS} block of parkable cells (${BLOCK_CELLS * CELL_M} × ${BLOCK_CELLS * CELL_M} m).`,
  `Walk-back ≤ ${walkBackM / 1000} km straight-line ground distance on the Mars sphere (config.yaml walk_back_max_km); spots closer than ${MIN_STANDOFF_M} m to the POI are excluded (team decision after Apollo 17 Station 7, rover ~25 m from the boulder; NASA sets only the maximum).`,
  `Walk path = straight line to the POI on the 1 m slope; the suit limit is ${suitSlopeMax}° (config.yaml slope_max_deg). Real walks would detour around steep sections.`,
  `Rank by walk_km × (1 + ${SLOPE_PENALTY} × share of the walk ≥ ${suitSlopeMax}°); alternatives at least ${MIN_SEPARATION_M} m apart.`,
  "Slope and roughness come from the 1 m HiRISE DTM (vertical precision ~tens of cm); sub-metre rocks need the 0.25 m imagery.",
];

const features: object[] = [];
for (const site of sites) {
  const [lon0, lat0] = site.lonlat;
  const work = join("data/interim/hirise", site.id, "staging");
  mkdirSync(work, { recursive: true });
  const slopeCog = join("data/processed/sites", site.id, "slope.tif");
  const roughCog = join("data/processed/sites", site.id, "roughness.tif");
  const local = `+proj=aeqd +lat_0=${lat0} +lon_0=${lon0} +R=${R} +units=m +no_defs`;
  const half = walkBackM + 2 * CELL_M;
  const te = ["-te", ...[-half, -half, half, half].map(String)];
  const warp = async (src: string, dst: string, res: number, r: string, extra: string[] = []) => {
    await execa("gdalwarp", [
      "-q",
      "-overwrite",
      "-t_srs",
      local,
      ...te,
      "-tr",
      String(res),
      String(res),
      "-r",
      r,
      "-srcnodata",
      "-9999",
      "-dstnodata",
      "-9999",
      ...extra,
      src,
      dst,
    ]);
  };
  // Coverage: share of 1 m source pixels with data, per 10 m cell (must be 1 = fully inside the DTM).
  const validSrc = join(work, "valid.tif");
  await execa("gdal_calc", [
    "--quiet",
    "--overwrite",
    "-A",
    slopeCog,
    "--calc",
    "A != -9999",
    "--type",
    "Byte",
    "--NoDataValue",
    "255",
    "--hideNoData",
    "--outfile",
    validSrc,
  ]);
  const slopeMax = join(work, "slope-max-10m.tif");
  const roughMax = join(work, "rough-max-10m.tif");
  const valid10 = join(work, "valid-min-10m.tif");
  const slope1 = join(work, "slope-1m.tif");
  await warp(slopeCog, slopeMax, CELL_M, "max");
  await warp(roughCog, roughMax, CELL_M, "max");
  await execa("gdalwarp", [
    "-q",
    "-overwrite",
    "-t_srs",
    local,
    ...te,
    "-tr",
    String(CELL_M),
    String(CELL_M),
    "-r",
    "min",
    "-dstnodata",
    "0",
    validSrc,
    valid10,
  ]);
  await warp(slopeCog, slope1, 1, "near");

  const read = async (p: string) =>
    (
      (await (await (await fromFile(p)).getImage()).readRasters()) as unknown as ArrayLike<number>[]
    )[0];
  const [sMax, rMax, ok, s1] = await Promise.all([slopeMax, roughMax, valid10, slope1].map(read));
  const n = Math.round((2 * half) / CELL_M);
  const n1 = Math.round(2 * half);
  // Cell (i, j) centre in metres from the POI (x east, y north); row 0 is the north edge.
  const cx = (j: number) => -half + (j + 0.5) * CELL_M;
  const cy = (i: number) => half - (i + 0.5) * CELL_M;
  // Parkable cells, flat patches and ranked spots for one slope limit.
  const findSpots = (limitDeg: number) => {
    const flat = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) {
      const d = Math.hypot(cx(k % n), cy(Math.floor(k / n)));
      flat[k] = Number(
        ok[k] === 1 &&
          sMax[k] !== -9999 &&
          rMax[k] !== -9999 &&
          sMax[k] / 10 <= limitDeg &&
          rMax[k] / 100 <= ROVER_ROUGHNESS_MAX_M &&
          d >= MIN_STANDOFF_M &&
          d <= walkBackM,
      );
    }
    // Connected flat patches (4-neighbour) → area per patch.
    const label = new Int32Array(n * n).fill(-1);
    const area: number[] = [];
    for (let k = 0; k < n * n; k++) {
      if (!flat[k] || label[k] >= 0) continue;
      const id = area.length;
      let count = 0;
      const stack = [k];
      label[k] = id;
      while (stack.length) {
        const c = stack.pop()!;
        count++;
        const [i, j] = [Math.floor(c / n), c % n];
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const [a, b] = [i + di, j + dj];
          const q = a * n + b;
          if (a >= 0 && a < n && b >= 0 && b < n && flat[q] && label[q] < 0) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
      area.push(count * CELL_M * CELL_M);
    }
    // Walk metrics along the straight line on the 1 m slope grid.
    const walk = (x: number, y: number) => {
      const len = Math.hypot(x, y);
      const steps = Math.max(1, Math.ceil(len));
      let max = 0;
      let steep = 0;
      for (let t = 0; t <= steps; t++) {
        const [px, py] = [(x * (steps - t)) / steps, (y * (steps - t)) / steps];
        const col = Math.floor(px + half);
        const row = Math.floor(half - py);
        const v = s1[row * n1 + col];
        if (v === undefined || v === -9999) return null; // leaves the DTM footprint
        const deg = v / 10;
        max = Math.max(max, deg);
        if (deg >= suitSlopeMax) steep++;
      }
      return { max, steepShare: steep / (steps + 1) };
    };
    type Candidate = {
      x: number;
      y: number;
      walkM: number;
      patch: number;
      w: ReturnType<typeof walk>;
      score: number;
    };
    const candidates: Candidate[] = [];
    const blockFlat = (i: number, j: number) => {
      for (let a = 0; a < BLOCK_CELLS; a++) {
        for (let b = 0; b < BLOCK_CELLS; b++) if (!flat[(i + a) * n + j + b]) return false;
      }
      return true;
    };
    const toCentre = ((BLOCK_CELLS - 1) / 2) * CELL_M;
    for (let i = 0; i <= n - BLOCK_CELLS; i++) {
      for (let j = 0; j <= n - BLOCK_CELLS; j++) {
        const k = i * n + j;
        if (!blockFlat(i, j)) continue;
        const [x, y] = [cx(j) + toCentre, cy(i) - toCentre]; // centre of the block
        const walkM = Math.hypot(x, y);
        if (walkM > walkBackM || walkM < MIN_STANDOFF_M) continue;
        const w = walk(x, y);
        const score = w ? (walkM / 1000) * (1 + SLOPE_PENALTY * w.steepShare) : Infinity;
        candidates.push({ x, y, walkM, patch: area[label[k]], w, score });
      }
    }
    // Walks that leave the DTM can't be scored → only used if nothing else is left, ordered by distance.
    candidates.sort((a, b) => a.score - b.score || a.walkM - b.walkM);
    return { flat, area, candidates };
  };
  let slopeLimitDeg = ROVER_SLOPE_MAX_DEG;
  let { flat, area, candidates } = findSpots(slopeLimitDeg);
  if (candidates.length === 0) {
    slopeLimitDeg = ROVER_SLOPE_FALLBACK_DEG;
    ({ flat, area, candidates } = findSpots(slopeLimitDeg));
  }
  const slopeFallback = slopeLimitDeg !== ROVER_SLOPE_MAX_DEG;
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= MIN_SEPARATION_M)) picked.push(c);
    if (picked.length === 3) break;
  }
  const parkable = flat.reduce((a, b) => a + b, 0);
  console.log(
    `${site.hirise_id}: slope ≤ ${slopeLimitDeg}°${slopeFallback ? " (FALLBACK)" : ""}, ${parkable} parkable ${CELL_M} m cells, ${candidates.length} spots, ${area.length} patches → ` +
      picked
        .map(
          (p, r) =>
            `#${r + 1} ${(p.walkM / 1000).toFixed(2)} km` +
            (p.w
              ? ` max ${p.w.max.toFixed(1)}°, ${(100 * p.w.steepShare).toFixed(1)} % ≥ ${suitSlopeMax}°`
              : " ⚠ walk leaves DTM"),
        )
        .join("; "),
  );
  // Back to lon/lat for the GeoJSON.
  if (picked.length) {
    const { stdout } = await execa(
      "gdaltransform",
      ["-s_srs", local, "-t_srs", "+proj=longlat +R=3396190 +no_defs", "-output_xy"],
      { input: picked.map((p) => `${p.x} ${p.y}`).join("\n") },
    );
    const lonlats = stdout
      .trim()
      .split("\n")
      .map((l) => l.trim().split(/\s+/).map(Number));
    picked.forEach((p, r) => {
      const [lon, lat] = lonlats[r];
      features.push({
        type: "Feature",
        properties: {
          site_id: site.id,
          hirise_id: site.hirise_id,
          rank: r + 1,
          walk_km: Math.round(p.walkM) / 1000,
          max_slope_on_walk_deg: p.w ? Math.round(p.w.max * 10) / 10 : null,
          walk_share_under_suit_limit: p.w ? Math.round((1 - p.w.steepShare) * 1000) / 1000 : null,
          walk_leaves_dtm: p.w === null,
          patch_area_m2: p.patch,
          slope_limit_deg: slopeLimitDeg,
          slope_fallback: slopeFallback,
          walk_time_min_one_way: Math.round(
            (p.walkM / 1000 / Number(config.thresholds.walk_pace_km_h)) * 60,
          ),
          assumptions,
        },
        geometry: {
          type: "Point",
          coordinates: [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7],
        },
      });
    });
  }
}

const out = "public/data/processed/staging-points.geojson";
const previous = only
  ? (
      JSON.parse(readFileSync(out, "utf8")).features as { properties: { site_id: string } }[]
    ).filter((f) => f.properties.site_id !== only)
  : [];
writeFileSync(
  out,
  JSON.stringify(
    {
      type: "FeatureCollection",
      name: "staging-points",
      status:
        "Team parking rule (Sun Nov 15); the app computes its own staging point at runtime with the same rule",
      source: "Derived from HiRISE 1 m DTM slope and roughness (NASA/JPL/University of Arizona)",
      attribution: "NASA/JPL/University of Arizona",
      caveats: [
        "Parking limits are a team decision, not NASA flight rules; NASA sets only the maximum walk back to the rover.",
        "Straight-line walks; walk_km is ground distance on the Mars sphere, not path length over the relief.",
        "Max slope on the walk includes isolated 1 m DTM spikes; check the slope overlay before trusting a single high value.",
        "Not ground-truthed: no rover has operated in Arcadia Planitia.",
      ],
      features: [...previous, ...features],
    },
    null,
    2,
  ) + "\n",
);
