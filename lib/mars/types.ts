// Shared data contracts between the pipelines (data/processed) and the app.
// Mirrors the "Data output formats" decision in CLAUDE.md; change both together.

/** Longitude/latitude in degrees on the Mars 2000 sphere, planetocentric, east-positive, -180..180. */
export type LngLat = [lng: number, lat: number];

export type Verdict = "GO" | "CAUTION" | "NO_GO";

export type LayerKind = "raster" | "vector";

export interface LayerSource {
  /** Instrument or product, e.g. "HiRISE DTM", "SWIM". Every layer must show one. */
  name: string;
  url?: string;
}

export interface StableLayer {
  id: string;
  title: string;
  kind: LayerKind;
  /** Path under /data/processed. Raster previews are PNG/WebP; vectors are GeoJSON. */
  path: string;
  /** Raster corners: top-left, top-right, bottom-right, bottom-left. */
  corners?: [LngLat, LngLat, LngLat, LngLat];
  /** Optional COG for click-to-inspect values. */
  cogPath?: string;
  units?: string;
  opacity?: number;
  visible?: boolean;
  source: LayerSource;
}

export interface LayerManifest {
  aoi: { name: string; center: LngLat; zoom: number; bounds: [LngLat, LngLat] };
  /** Projection the COGs were built in, recorded for validity. */
  crs: string;
  layers: StableLayer[];
}

/**
 * One live-feed update. Units follow the team's telemetry table (MEDA, MOXIE, RAD);
 * fields marked PLACEHOLDER have no agreed format yet.
 */
export interface LiveSnapshot {
  /** ISO 8601 UTC. */
  timestamp: string;
  /** PLACEHOLDER — sol numbering/epoch not agreed. */
  sol: number;
  /** PLACEHOLDER — Local Mean Solar Time, "HH:MM:SS"; site not agreed. */
  lmst: string;
  /** RAD absorbed-dose rate, µGy/h. */
  radiation_dose_rate: number;
  /** PLACEHOLDER — levels to be defined from DONKI + flight rules. */
  solar_alert_level: "none" | "watch" | "warning";
  /** MEDA dust optical depth, dimensionless (τ). */
  dust_opacity: number;
  /** MEDA air temperature, K. */
  temp: number;
  /** MEDA wind speed, m/s. */
  wind: number;
  /** PLACEHOLDER — sun elevation, degrees above horizon (unit not in the telemetry table). */
  sun_elevation: number;
  /** Proxy site the values came from, e.g. "Jezero (Perseverance MEDA)". */
  proxy_source: string;
}

export interface RouteResult {
  distance_km: number;
  est_time_min: number;
  max_slope: number;
  verdict: Verdict;
  limiting_factor: string;
  reasons: string[];
}
