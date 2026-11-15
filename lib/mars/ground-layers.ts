// Ground-condition overlays: THEMIS thermal inertia (regional) and DTM roughness (per HiRISE site).
// Legend colours mirror the tile ramps in pipelines/stable/thermal-inertia.ts and roughness.ts; they are
// data colours baked into the tiles, not theme colours. Keep them in sync with those pipelines.

/**
 * Thermal-inertia overlay tiles. TODO(R2): the tiles are uploaded (CLAUDE.md, Sun Nov 15) but no public
 * prefix is recorded in the repo yet; every guess 404s. Set this to the R2 root once M confirms it.
 */
export const THERMAL_INERTIA_DATA_ROOT: string | null = null;

/**
 * Roughness tiles per site. Not on R2 yet: null serves local output of pnpm pipe:roughness.
 * TODO(R2): point at `https://tiles.imstuckonmars.help/sites-v2` when M publishes it.
 */
export const ROUGHNESS_DATA_ROOT: string | null = null;

export const THERMAL_INERTIA_ATTRIBUTION = "NASA/JPL-Caltech/Arizona State University/USGS";
export const ROUGHNESS_ATTRIBUTION = "NASA/JPL/University of Arizona (derived)";

/** AOI of the thermal-inertia tiles, split at ±180 (pipeline box 170–196°E, 43–48°N). */
export const THERMAL_INERTIA_BOUNDS: [number, number, number, number][] = [
  [170, 43, 180, 48],
  [-180, 43, -164, 48],
];

/** Absolute tile URL; the map needs absolute URLs, so local roots are prefixed with the origin. */
export function thermalInertiaTiles(origin: string, root = THERMAL_INERTIA_DATA_ROOT) {
  return [`${root ?? `${origin}/data/thermal-inertia`}/{z}/{x}/{y}.webp`];
}

export function roughnessTiles(origin: string, siteId: string, root = ROUGHNESS_DATA_ROOT) {
  return [`${root ?? `${origin}/data`}/sites/${siteId}/roughness/{z}/{x}/{y}.webp`];
}

export interface LegendClass {
  label: string;
  range: string;
  /** CSS colour of the tile class; null = transparent in the tiles. */
  color: string | null;
}

export const THERMAL_INERTIA_LEGEND: LegendClass[] = [
  { label: "fine dust / loose fines", range: "< 150", color: "rgb(200 140 70)" },
  { label: "sand / crusted soil", range: "150–400", color: "rgb(120 170 200)" },
  { label: "firm ground / rock", range: "≥ 400", color: "rgb(70 90 170)" },
];

export const ROUGHNESS_LEGEND: LegendClass[] = [
  { label: "smooth (below DTM noise)", range: "< 0.25 m", color: null },
  { label: "uneven — walk with care", range: "0.25–0.5 m", color: "rgb(250 220 90)" },
  { label: "rough — walking caution", range: "0.5–1 m", color: "rgb(245 150 50)" },
  { label: "very rough — avoid on foot", range: "≥ 1 m", color: "rgb(220 40 30)" },
];

/** public/data/processed/thermal-inertia-sites.json (pipelines/stable/thermal-inertia.ts). */
export interface ThermalInertiaSummary {
  units: string;
  coverage: { aoi_percent: number; note: string };
  caveats: string[];
  sites: {
    id: string;
    coverage_percent: number;
    mean: number;
    mean_range: [number, number];
    class: string;
    class_robust: boolean;
  }[];
}

/** public/data/processed/roughness-sites.json (pipelines/stable/roughness.ts), keyed by DTM id. */
export interface RoughnessSummary {
  note: string;
  sites: Record<string, { mean_m: number; p50_m: number; p90_m: number }>;
}

/** HiRISE observation id inside a DTM id: DTEEC_033225_2250_… → ESP_033225_2250. */
export function hiriseIdOfDtm(dtm: string) {
  const m = /^DTEEC_(\d{6}_\d{4})_/.exec(dtm);
  return m ? `ESP_${m[1]}` : dtm;
}

/** Thermal-inertia row for a site, matched by its HiRISE observation id (or "habitat"). */
export function thermalInertiaFor(summary: ThermalInertiaSummary, siteId: string) {
  const id = siteId === "habitat" ? siteId : hiriseIdOfDtm(siteId);
  return summary.sites.find((s) => s.id === id);
}
