import type { WeatherRisks, WeatherRiskEffects } from "./weather-risks";

export const MODEL_VERSION = "ares-resource-v1";
export const MAX_DURATION_S = 21_600;

export type Activity = "base" | "travel" | "science" | "rest" | "return";
export type Location = "base" | "eva";

export interface OxygenConfig {
  initial_g: number;
  capacity_g: number;
  reserve_g: number;
  leak_g_h: number;
}

export interface BatteryConfig {
  initial_wh: number;
  capacity_wh: number;
  reserve_wh: number;
  charge_efficiency: number;
  discharge_efficiency: number;
  max_charge_w: number;
  max_discharge_w: number;
}

/** Where the crew shelters: the habitat (with archived MOXIE production) or the parked rover. */
export type ShelterKind = "habitat" | "rover";
export type MarsLngLat = [lng: number, lat: number];

/** One timed leg of an expedition on foot, on the Mars 2000 sphere (east-positive degrees). */
export interface ExpeditionLeg {
  activity: "travel" | "science" | "return";
  start_s: number;
  end_s: number;
  /** Travel and return legs: the walked line. Science legs: the single sampling point. */
  path: MarsLngLat[];
}

/** The planned route a mission follows, so the server owns the crew position too. */
export interface ExpeditionRoute {
  id: string;
  mode: "walking" | "drive_walk";
  shelter: ShelterKind;
  shelter_lnglat: MarsLngLat;
  legs: ExpeditionLeg[];
  /** Sampling time as first launched, kept through replans for the report. */
  planned_sampling_s?: number;
  /** Replans applied during the mission, in order, for the mission report. */
  decisions?: Array<{ at_s: number; option: ReplanOption; title: string }>;
}

export type ReplanOption = "turn_back" | "cut_sampling";

export interface CrewPosition {
  lnglat: MarsLngLat;
  phase: "shelter" | "outbound" | "science" | "inbound";
  /** Index into route.legs, or null at the shelter. */
  leg: number | null;
  /** 0..1 along the current leg; 0 at the shelter. */
  leg_progress: number;
  /** Straight-line Mars distance to the shelter. */
  distance_from_shelter_m: number;
  /** Metres walked so far on this expedition. */
  travelled_m: number;
}

export interface MissionConfig {
  model_version: typeof MODEL_VERSION;
  assumptions_acknowledged: true;
  run_id: string;
  source_start_row: number;
  duration_s: number;
  base: { id: string; latitude_deg: number; longitude_deg: number };
  crew_count: number;
  capture_efficiency: number;
  generation_w: number;
  base_load_w: number;
  transfer_efficiency: number;
  eva_limit_s: number | null;
  oxygen: Record<Location, OxygenConfig>;
  battery: Record<Location, BatteryConfig>;
  profiles: Record<Activity, { oxygen_g_h_per_person: number; power_w: number }>;
  schedule: Array<{ start_s: number; end_s: number; activity: Activity }>;
  /** Optional planned route. Its legs match the schedule's travel, science and return entries. */
  route?: ExpeditionRoute;
  /**
   * What happens when the archived MOXIE trace ends before the mission does. "stop" (default)
   * halts the replay; "no_production" keeps going with no oxygen production credited.
   */
  after_archive?: "stop" | "no_production";
}

export type ScenarioEvent = {
  id: string;
  at_s: number;
} & (
  | { type: "generator_failure" | "generator_restore" | "route_blocked" }
  | { type: "oxygen_leak"; target: Location; value: number }
  | { type: "generation_change"; value: number }
  | { type: "battery_failure"; target: Location; value: number }
  /** Multiplies crew oxygen demand and activity power at the target (1 restores nominal). */
  | { type: "consumption_change"; target: Location; value: number }
  | { type: "weather_risk"; risk: "dust" | "cold"; active: boolean }
  | { type: "transfer_oxygen" | "transfer_energy"; value: number }
);

export interface MoxieSample {
  source_row: number;
  segment_id: number;
  elapsed_ms: number;
  sclk_ms: number | null;
  utc_ms: number | null;
  oxygen_rate_g_h: number | null;
  total_power_w: number | null;
  fault_count?: number | null;
  [field: string]: unknown;
}

export interface OxygenState {
  remaining_g: number;
  produced_g: number;
  consumed_g: number;
  leaked_g: number;
  vented_g: number;
  unmet_g: number;
  /** Everything requested but not delivered, leak included: the full depth of a shortfall. */
  shortfall_g: number;
  transferred_in_g: number;
  transferred_out_g: number;
  first_reserve_crossing_s: number | null;
}

export interface BatteryState {
  remaining_wh: number;
  capacity_wh: number;
  charged_wh: number;
  discharged_wh: number;
  curtailed_wh: number;
  unmet_wh: number;
  failure_loss_wh: number;
  transferred_in_wh: number;
  transferred_out_wh: number;
  transfer_loss_wh: number;
  first_reserve_crossing_s: number | null;
}

export interface Evaluation {
  model_version: string;
  provenance: "assumption-driven simulation";
  requested_s: number;
  elapsed_s: number;
  status: "ok" | "source_unavailable";
  activity: Activity;
  eva_elapsed_s: number;
  oxygen: Record<Location, OxygenState>;
  battery: Record<Location, BatteryState>;
  generator_available: boolean;
  generation_w: number;
  oxygen_leak_g_h: Record<Location, number>;
  /** Consumption multiplier from consumption_change events; 1 is nominal. */
  demand_factor: Record<Location, number>;
  route_blocked: boolean;
  /** Crew position along the configured route, or null when the mission has none. */
  position: CrewPosition | null;
  applied_event_ids: string[];
  reasons: string[];
  observed_sample: MoxieSample | null;
  effective_oxygen_rate_g_h: number | null;
  effective_generator_power_w: number | null;
  weather_risks?: WeatherRisks;
  weather_risk_effects?: WeatherRiskEffects;
}

export interface ReturnRoute {
  id: string;
  revision: string;
  mission_revision: number;
  base_id: string;
  evaluated_at_s: number;
  status: "ok" | "no_path" | "unknown_data";
  legs: Array<{ activity: Exclude<Activity, "base">; duration_s: number }>;
  warnings: string[];
}

export class MissionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503 = 422,
  ) {
    super(message);
  }
}
