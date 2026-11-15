export type MetricId = "temperature" | "pressure" | "water_vapor" | "radiation";

export interface ObservationPoint {
  utc_ms: number;
  value: number | null;
  count: number;
}

export interface HomebaseMetric {
  id: MetricId;
  title: string;
  unit: string;
  decimals: number;
  value: number | null;
  observed_utc_ms: number | null;
  status: "available" | "flagged" | "unavailable";
  minimum: number | null;
  maximum: number | null;
  source: { instrument: string; site: string; url: string | null; product_id: string | null };
  note: string;
  cadence_s: number;
  points: ObservationPoint[];
}

export interface LoggedExperiment {
  id: string;
  sol: number;
  oxygen_g: number | null;
  peak_rate_g_h: number | null;
  active_mean_g_h: number | null;
  active_seconds: number | null;
  energy_wh: number | null;
  warnings: string[];
  source_url: string | null;
}

export interface HomebaseData {
  release_id: string;
  demo_today: { sol: number; date: string; utc_ms: number; eligible_sols: number[] };
  coverage: { from_utc_ms: number; to_utc_ms: number; description: string };
  metrics: HomebaseMetric[];
  experiments: LoggedExperiment[];
  limitations: string[];
}
