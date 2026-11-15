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
  /** Optional tiled raster source; path remains the dataset's provenance document. */
  tiles?: string[];
  tileBounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
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
  /** Defined in lib/flight-rules/solar-alert.ts from NASA DONKI flares, particle events and storm arrivals. */
  solar_alert_level: "none" | "watch" | "warning";
  /** MEDA dust optical depth, dimensionless (τ). */
  dust_opacity: number;
  /** MEDA air temperature, K. */
  temp: number;
  /** MEDA wind speed, m/s. */
  wind: number;
  /** Sun elevation in degrees above the horizon. Negative at night. */
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

/** How a route leg is travelled: in the pressurized rover, or on foot in suits (EVA). */
export type TravelMode = "drive" | "walk";

/**
 * Properties of one route leg (a GeoJSON LineString, drawn in travel order).
 * A journey is one or more legs, e.g. drive base → staging point, then walk staging → POI.
 * Shape agreed for the sample routes in public/data/samples/routes/; C's real routes use the same.
 */
export interface RouteLegProperties extends Omit<RouteResult, "limiting_factor"> {
  kind: "route-leg";
  route_id: string;
  /** 1-based position in the journey. */
  leg: number;
  mode: TravelMode;
  /** Ids of the leg's start and end points ("base", "staging", or a site DTM id). */
  from: string;
  to: string;
  /** Minutes after departure when this leg starts (for the timeline). */
  start_offset_min: number;
  /** Time spent stopped at the end of the leg (e.g. sampling), not included in est_time_min. */
  stop_min: number;
  /** The rule behind a CAUTION/NO_GO (a flight-rule factor id), null when GO. */
  limiting_factor: string | null;
  /** Worst-case minutes to reach shelter during this leg (the pressurized rover counts as shelter). */
  time_to_shelter_min: number;
  /** True for anything not computed from real data (all sample routes). */
  simulated: boolean;
}

/** Banner-ready summary of the whole journey, stored as the collection's top-level `route` member. */
export interface RouteSummary extends Omit<RouteResult, "limiting_factor"> {
  route_id: string;
  title: string;
  /** Site DTM id from sites.geojson. */
  destination_id: string;
  /** Worst leg's rule, null when GO. */
  limiting_factor: string | null;
  /** Margin on the limiting (or tightest) resource, for "status · limiting constraint · margin". */
  margin: { resource: string; value: number; limit: number; unit: string };
  /** Worst case over all legs. */
  time_to_shelter_min: number;
  simulated: boolean;
  /** Where the numbers came from, e.g. "SAMPLE — hand-made". Show it in the UI. */
  source: string;
}

/** A whole journey as one GeoJSON file: route-leg lines, the staging point, and the banner summary. */
export interface RouteCollection {
  type: "FeatureCollection";
  features: (
    | {
        type: "Feature";
        properties: RouteLegProperties;
        geometry: { type: "LineString"; coordinates: LngLat[] };
      }
    | {
        type: "Feature";
        properties: { kind: "staging" };
        geometry: { type: "Point"; coordinates: LngLat };
      }
  )[];
  route: RouteSummary;
}
