// Boulder (rock) check around each HiRISE POI, from rock shadows in the 0.25 m RED ortho — the walking-EVA hazard
// that the 1 m DTM cannot see (roughness.ts). Shadow method after Golombek et al. (2008, 2012), used to pick the
// Phoenix (northern plains) and MSL landing sites; size-frequency model from Golombek & Rapp (1997).
//   1. Cut the ortho to a local metre grid, RADIUS_M around the POI (walk-back rule allows 2 km; this is the work area).
//   2. Shadow = pixel darker than SHADOW_RATIO × local background brightness (BACKGROUND_M mean).
//   3. False-positive filters (ours): drop streaks (length/width > MAX_ASPECT); keep a shadow only if the pixels just
//      sunward of it are brighter than background (the rock's lit face) AND brighter than the pixels just beyond it.
//      A pit or polygon trough is the mirror image: its lit wall lies beyond the shadow.
//   4. Candidate diameter = shadow width across the sun direction; height = shadow length × tan(sun elevation).
//   5. Human check. These sites are ice-rich, polygonised, pitted mantle: the automatic step still flags pits and
//      trough shading. A seeded random sample of REVIEW_N candidates is drawn into a gallery
//      (data/interim/hirise/<dtm>/boulders-review.png, 12 m chips, crosshair = candidate). The reviewer records how
//      many are real rocks in pipelines/stable/boulders-review.json. Golombek et al. (2012) likewise checked automated
//      counts against manual counts.
//   6. Rocks ≥ COMPLETE_M ≤ upper precision × candidates (precision bound: "rule of three", 3/n, when 0 of n confirmed —
//      Hanley & Lippman-Hand 1983; else a 95 % Wilson bound). Fit k to that area with F(D) = k·exp(−q·D),
//      q = 1.79 + 0.152/k (Golombek & Rapp 1997): k ("rock abundance") then predicts how many smaller rocks —
//      below what HiRISE resolves — a walker meets per 100 m². All rock numbers are therefore UPPER BOUNDS.
// Sun geometry (SUB_SOLAR_AZIMUTH, NORTH_AZIMUTH, INCIDENCE_ANGLE) is read from each observation's PDS RDR label.
// Outputs:
//   public/data/processed/boulders.geojson       — automated candidates (D ≥ REPORT_M): diameter_m, height_m (unverified)
//   public/data/processed/boulders-sites.json    — per POI: candidates, review, k upper bound, rocks per 100 m² bound
//   data/interim/hirise/<dtm>/boulders-qa.png    — ortho with accepted shadows red, rejected shadows blue
//   data/interim/hirise/<dtm>/boulders-review.png — review gallery (see 5)
// Usage: pnpm pipe:boulders [dtm-id]   (all 4 sites by default)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";

const R = 3396190;
const PX = 0.25; // m, HiRISE RED ortho
const RADIUS_M = 500;
const BACKGROUND_M = 8; // > rock size, < polygon size
const SHADOW_RATIO = 0.35; // ASSUMPTION — tuned on the QA images: hummock/polygon shading stays above ~0.5
const LIT_RATIO = 1.1; // ASSUMPTION — lit face must be ≥ 10 % brighter than background
const MIN_SHADOW_PX = 4; // 0.25 m²
const MAX_SHADOW_PX = 800; // ~50 m²; bigger shadows are crater walls, not rocks
const MAX_ASPECT = 3; // rock shadows are compact; longer streaks are trough/ridge shading
const REPORT_M = 1.0;
const COMPLETE_M = 1.5; // ~6 px: counts are complete above this (Golombek et al. 2008)
const WALKER_SIZES_M = [0.3, 0.5, 1.0]; // ASSUMPTION — sizes a suited walker steps around; agree with team role A
const REVIEW_N = 36;
const REVIEW_CHIP_PX = 48; // 12 m
const reviewPath = "pipelines/stable/boulders-review.json";
type Review = {
  candidates: number;
  sampled: number;
  confirmed: number;
  reviewer: string;
  date: string;
  note?: string;
};
const reviews: Record<string, Review> = readJson(reviewPath, {});

type Site = { id: string; hirise: string; lon: number; lat: number };
const sites: Site[] = JSON.parse(readFileSync("public/data/processed/sites.geojson", "utf8"))
  .features.filter((f: { geometry: { type: string } }) => f.geometry.type === "Point")
  .map(
    (f: {
      properties: { id: string; hirise_id: string };
      geometry: { coordinates: number[] };
    }) => ({
      id: f.properties.id,
      hirise: f.properties.hirise_id,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }),
  );
const only = process.argv[2];
const todo = only ? sites.filter((s) => s.id === only) : sites;
if (todo.length === 0) throw new Error(`unknown dtm ${only}`);

const geojsonPath = "public/data/processed/boulders.geojson";
const summaryPath = "public/data/processed/boulders-sites.json";
type Feature = { properties: { site: string } & Record<string, unknown> } & Record<string, unknown>;
const geojson = readJson<{ type: string; features: Feature[] }>(geojsonPath, {
  type: "FeatureCollection",
  features: [],
});
const summary = readJson<{ method?: string; sites: Record<string, unknown> }>(summaryPath, {
  sites: {},
});

for (const site of todo) {
  const work = join("data/interim/hirise", site.id);
  const sun = await sunGeometry(site.hirise);
  const local = `+proj=eqc +lat_ts=${site.lat} +lat_0=${site.lat} +lon_0=${site.lon} +R=${R} +units=m +no_defs`;
  const chip = join(work, "boulders-chip.tif");
  const bg = join(work, "boulders-background.tif");
  const r = String(RADIUS_M);
  await execa("gdalwarp", [
    "-q",
    "-overwrite",
    "-t_srs",
    local,
    "-te",
    `-${r}`,
    `-${r}`,
    r,
    r,
    "-tr",
    String(PX),
    String(PX),
    "-r",
    "bilinear",
    "-srcnodata",
    "0",
    "-dstnodata",
    "0",
    join(work, "ortho-fixed.vrt"),
    chip,
  ]);
  const coarse = join(work, "boulders-background-coarse.tif");
  await execa("gdalwarp", [
    "-q",
    "-overwrite",
    "-tr",
    String(BACKGROUND_M),
    String(BACKGROUND_M),
    "-r",
    "average",
    "-srcnodata",
    "0",
    "-dstnodata",
    "0",
    chip,
    coarse,
  ]);
  const n = (2 * RADIUS_M) / PX;
  await execa("gdalwarp", [
    "-q",
    "-overwrite",
    "-te",
    `-${r}`,
    `-${r}`,
    r,
    r,
    "-ts",
    String(n),
    String(n),
    "-r",
    "bilinear",
    "-srcnodata",
    "0",
    "-dstnodata",
    "0",
    coarse,
    bg,
  ]);
  const img = await band(chip);
  const back = await band(bg);

  // Valid = inside the circle and inside the image.
  const c = n / 2;
  const valid = new Uint8Array(n * n);
  let validPx = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (img[i] > 0 && back[i] > 0 && (x - c) ** 2 + (y - c) ** 2 <= (RADIUS_M / PX) ** 2) {
        valid[i] = 1;
        validPx++;
      }
    }
  const shadow = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) if (valid[i] && img[i] < SHADOW_RATIO * back[i]) shadow[i] = 1;

  // Direction towards the sun in image space (column → east, row → south).
  const az = (sun.azimuthFromNorth * Math.PI) / 180;
  const toSun = [Math.sin(az), -Math.cos(az)];
  const across = [-toSun[1], toSun[0]];
  const tanElevation = Math.tan(((90 - sun.incidence) * Math.PI) / 180);

  const label = new Int32Array(n * n).fill(-1);
  const rocks: { x: number; y: number; d: number; h: number }[] = [];
  const status = new Uint8Array(n * n); // 1 accepted, 2 rejected (QA image)
  let rejected = 0;
  for (let start = 0; start < n * n; start++) {
    if (!shadow[start] || label[start] >= 0) continue;
    const px = flood(start);
    if (px.length < MIN_SHADOW_PX || px.length > MAX_SHADOW_PX) continue;
    let alongMin = Infinity;
    let alongMax = -Infinity;
    let acrossMin = Infinity;
    let acrossMax = -Infinity;
    let sx = 0;
    let sy = 0;
    for (const i of px) {
      const x = i % n;
      const y = (i - x) / n;
      const a = x * toSun[0] + y * toSun[1];
      const b = x * across[0] + y * across[1];
      alongMin = Math.min(alongMin, a);
      alongMax = Math.max(alongMax, a);
      acrossMin = Math.min(acrossMin, b);
      acrossMax = Math.max(acrossMax, b);
      sx += x;
      sy += y;
    }
    const length = (alongMax - alongMin + 1) * PX;
    const d = (acrossMax - acrossMin + 1) * PX;
    // Brightness just sunward of the shadow (a rock's lit face) and just beyond it on the far side (a pit's lit wall).
    const cx = sx / px.length;
    const cy = sy / px.length;
    const centre = cx * toSun[0] + cy * toSun[1];
    const depth = Math.max(2, d / PX);
    const sunward = sideBrightness(cx, cy, alongMax - centre + 1, 1, depth);
    const farside = sideBrightness(cx, cy, centre - alongMin + 1, -1, depth);
    const aspect = Math.max(length, d) / Math.min(length, d);
    const ok = aspect <= MAX_ASPECT && sunward >= LIT_RATIO && sunward - farside >= LIT_RATIO - 1;
    for (const i of px) status[i] = ok ? 1 : 2;
    if (!ok) {
      rejected++;
      continue;
    }
    if (d >= REPORT_M) rocks.push({ x: cx, y: cy, d, h: length * tanElevation });
  }

  // Rock area ≥ COMPLETE_M, bounded by the reviewed precision; k is fitted to that bound.
  const areaM2 = validPx * PX * PX;
  const complete = rocks.filter((k) => k.d >= COMPLETE_M);
  const candidateArea = complete.reduce((a, k) => a + (Math.PI * k.d ** 2) / 4, 0) / areaM2;
  const sample = seededSample(complete.length, REVIEW_N, site.id);
  writeGallery(
    join(work, "boulders-review.png"),
    img,
    sample.map((i) => complete[i]),
  );
  const review = reviews[site.id];
  const stale = review && review.candidates !== complete.length;
  let bound: {
    precision_max: number;
    k_max: number;
    rocks_per_100m2_max: Record<string, number>;
  } | null = null;
  if (review && !stale) {
    const precision = precisionUpper(review.confirmed, review.sampled);
    // With no candidates at all, bound by a zero count: 3 rocks of COMPLETE_M (95 % Poisson limit).
    const area = complete.length
      ? precision * candidateArea
      : (3 * Math.PI * COMPLETE_M ** 2) / 4 / areaM2;
    const k = solveK(area, COMPLETE_M);
    bound = {
      precision_max: round(precision),
      k_max: round(k, 4),
      rocks_per_100m2_max: Object.fromEntries(
        WALKER_SIZES_M.map((D) => [`ge_${D}m`, round(100 * cumulativeNumber(k, D), 3)]),
      ),
    };
  }

  geojson.features = geojson.features.filter(
    (f: { properties: { site: string } }) => f.properties.site !== site.id,
  );
  for (const k of rocks) {
    const xm = (k.x - c + 0.5) * PX;
    const ym = (c - k.y - 0.5) * PX;
    geojson.features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          round(site.lon + (xm / (R * Math.cos((site.lat * Math.PI) / 180))) * (180 / Math.PI), 7),
          round(site.lat + (ym / R) * (180 / Math.PI), 7),
        ],
      },
      properties: { site: site.id, diameter_m: round(k.d, 2), height_m: round(k.h, 2) },
    });
  }
  summary.sites[site.id] = {
    hirise_id: site.hirise,
    radius_m: RADIUS_M,
    area_m2: Math.round(areaM2),
    sun,
    candidates_ge_report_m: rocks.length,
    candidates_ge_complete_m: complete.length,
    shadows_rejected: rejected,
    review: review ?? null,
    review_stale: Boolean(stale),
    upper_bound: bound,
  };
  writeQa(join(work, "boulders-qa.png"), img, status, valid);
  console.log(
    `${site.id}: ${complete.length} candidates ≥ ${COMPLETE_M} m (${rejected} shadows rejected); ` +
      (bound
        ? `k ≤ ${(100 * bound.k_max).toFixed(2)} %, per 100 m² ≤ ${JSON.stringify(bound.rocks_per_100m2_max)}`
        : stale
          ? `REVIEW STALE (reviewed ${review.candidates} candidates) — re-review the gallery`
          : `NOT REVIEWED — check ${join(work, "boulders-review.png")}, record in ${reviewPath}`),
  );

  function sideBrightness(cx: number, cy: number, reach: number, sign: number, depth: number) {
    let sum = 0;
    let count = 0;
    for (let s = 0; s <= depth; s++)
      for (let t = -1; t <= 1; t++) {
        const x = Math.round(cx + sign * toSun[0] * (reach + s) + across[0] * t);
        const y = Math.round(cy + sign * toSun[1] * (reach + s) + across[1] * t);
        const i = y * n + x;
        if (x < 0 || y < 0 || x >= n || y >= n || !valid[i] || shadow[i]) continue;
        sum += img[i] / back[i];
        count++;
      }
    return count ? sum / count : 0;
  }

  function flood(start: number) {
    const id = start;
    const out: number[] = [];
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      out.push(i);
      const x = i % n;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const j = i + dy * n + dx;
          if (xx < 0 || xx >= n || j < 0 || j >= n * n || !shadow[j] || label[j] >= 0) continue;
          label[j] = id;
          stack.push(j);
        }
    }
    return out;
  }
}

summary.method =
  "Shadow-based rock candidates on 0.25 m HiRISE RED orthos (after Golombek et al. 2008, 2012), lit-face and " +
  `pit filters, human review of ${REVIEW_N} random candidates per POI; rock abundance k is an UPPER BOUND from the ` +
  "reviewed precision, with the Golombek & Rapp (1997) model F(D) = k·exp(−(1.79 + 0.152/k)·D) predicting rocks " +
  `below HiRISE resolution. Thresholds are Role B ASSUMPTIONS. Source: NASA/JPL/University of Arizona.`;
writeFileSync(geojsonPath, `${JSON.stringify(geojson)}\n`);
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

async function sunGeometry(hirise: string) {
  const orbit = Number(hirise.slice(4, 10));
  const lo = Math.floor(orbit / 100) * 100;
  const dir = `ORB_${String(lo).padStart(6, "0")}_${String(lo + 99).padStart(6, "0")}`;
  const url = `https://hirise.lpl.arizona.edu/PDS/RDR/ESP/${dir}/${hirise}/${hirise}_RED.LBL`;
  const text = await (await fetch(url)).text();
  const value = (key: string) => Number(new RegExp(`${key}\\s*=\\s*([\\d.]+)`).exec(text)?.[1]);
  const subSolar = value("SUB_SOLAR_AZIMUTH");
  const north = value("NORTH_AZIMUTH");
  const incidence = value("INCIDENCE_ANGLE");
  if (![subSolar, north, incidence].every(Number.isFinite))
    throw new Error(`no sun geometry in ${url}`);
  // Label azimuths are clockwise from the image's +sample (right) direction.
  return {
    azimuthFromNorth: round((((subSolar - north) % 360) + 360) % 360, 2),
    incidence,
    label: url,
  };
}

async function band(path: string) {
  const tiff = await fromFile(path);
  const [data] = (await (await tiff.getImage()).readRasters()) as unknown as ArrayLike<number>[];
  return Float32Array.from(data);
}

// Upper 95 % bound on the share of candidates that are real rocks.
function precisionUpper(confirmed: number, sampled: number) {
  if (sampled === 0) return 1;
  if (confirmed === 0) return Math.min(1, 3 / sampled); // rule of three
  const z = 1.96;
  const p = confirmed / sampled;
  const centre = p + (z * z) / (2 * sampled);
  const spread = z * Math.sqrt((p * (1 - p)) / sampled + (z * z) / (4 * sampled * sampled));
  return Math.min(1, (centre + spread) / (1 + (z * z) / sampled));
}

// Deterministic sample (mulberry32 seeded by the DTM id), so the gallery matches the recorded review.
function seededSample(count: number, k: number, seed: string) {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2654435761), 1);
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = Array.from({ length: count }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

function writeGallery(path: string, img: Float32Array, picks: { x: number; y: number }[]) {
  const n = Math.sqrt(img.length);
  const W = REVIEW_CHIP_PX;
  const Z = 3;
  const cols = 6;
  const rows = Math.max(1, Math.ceil(picks.length / cols));
  const png = new PNG({ width: cols * W * Z, height: rows * W * Z });
  picks.forEach((p, k) => {
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let j = 0; j < W * Z; j++)
      for (let i = 0; i < W * Z; i++) {
        const sx = cx - W / 2 + Math.floor(i / Z);
        const sy = cy - W / 2 + Math.floor(j / Z);
        let v = sx >= 0 && sy >= 0 && sx < n && sy < n ? img[sy * n + sx] : 0;
        const mid = (W * Z) / 2;
        if (i === 0 || j === 0) v = 255; // chip border
        if ((i === mid && Math.abs(j - mid) < 4) || (j === mid && Math.abs(i - mid) < 4)) v = 255;
        const o = ((Math.floor(k / cols) * W * Z + j) * png.width + (k % cols) * W * Z + i) * 4;
        png.data.set([v, v, v, 255], o);
      }
  });
  writeFileSync(path, PNG.sync.write(png));
}

// Golombek & Rapp (1997): cumulative fractional area of rocks ≥ D.
function cumulativeArea(k: number, d: number) {
  return k * Math.exp(-(1.79 + 0.152 / k) * d);
}

function solveK(area: number, d: number) {
  let lo = 1e-4;
  let hi = 0.4;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cumulativeArea(mid, d) < area) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Rocks ≥ D per m²: number density n(D) = −dF/dD · 4 / (π D²), integrated numerically.
function cumulativeNumber(k: number, d0: number) {
  const q = 1.79 + 0.152 / k;
  let total = 0;
  const step = 0.005;
  for (let d = d0 + step / 2; d < d0 + 20; d += step)
    total += ((k * q * Math.exp(-q * d) * 4) / (Math.PI * d * d)) * step;
  return total;
}

function writeQa(path: string, img: Float32Array, status: Uint8Array, valid: Uint8Array) {
  const n = Math.sqrt(img.length);
  const png = new PNG({ width: n, height: n });
  for (let i = 0; i < img.length; i++) {
    const v = valid[i] ? img[i] : 0;
    const [r, g, b] = status[i] === 1 ? [255, 0, 0] : status[i] === 2 ? [40, 120, 255] : [v, v, v];
    png.data.set([r, g, b, 255], i * 4);
  }
  writeFileSync(path, PNG.sync.write(png));
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function round(v: number, digits = 3) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
