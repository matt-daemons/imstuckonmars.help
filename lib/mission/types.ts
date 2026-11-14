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
}

export type ScenarioEvent = {
  id: string;
  at_s: number;
} & (
  | { type: "generator_failure" | "generator_restore" | "route_blocked" }
  | { type: "oxygen_leak"; target: Location; value: number }
  | { type: "generation_change"; value: number }
  | { type: "battery_failure"; target: Location; value: number }
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
  [field: string]: number | null;
}

export interface OxygenState {
  remaining_g: number;
  produced_g: number;
  consumed_g: number;
  leaked_g: number;
  vented_g: number;
  unmet_g: number;
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
  route_blocked: boolean;
  applied_event_ids: string[];
  reasons: string[];
  observed_sample: MoxieSample | null;
  effective_oxygen_rate_g_h: number | null;
  effective_generator_power_w: number | null;
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
