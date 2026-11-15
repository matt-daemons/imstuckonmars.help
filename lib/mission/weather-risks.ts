import type { Activity, MissionConfig, ScenarioEvent } from "./types";

export interface WeatherRisks {
  dust: boolean;
  cold: boolean;
}

export interface WeatherRiskEffects {
  extra_exertion_wh: number;
  extra_heater_wh: number;
  extra_oxygen_demand_g: number;
  dust_drill_s: number;
  cold_drill_s: number;
}

export const DUST_EXERTION_FACTOR = 1.25;
/** Assumed extra heater load per two crew, not a measured temperature or suit model. */
export const COLD_EXTRA_HEATER_W = 70;

/** Explicit operator drills only. Last event wins, including equal timestamps. */
export function weatherRisksAt(events: ScenarioEvent[], at: number): WeatherRisks {
  const risks: WeatherRisks = { dust: false, cold: false };
  const latest = { dust: -Infinity, cold: -Infinity };
  for (const event of events) {
    if (event.type !== "weather_risk" || event.at_s > at || event.at_s < latest[event.risk])
      continue;
    risks[event.risk] = event.active;
    latest[event.risk] = event.at_s;
  }
  return risks;
}

export function weatherExertion(risks?: WeatherRisks) {
  return risks?.dust ? DUST_EXERTION_FACTOR : 1;
}

export function extraHeaterPower(config: Pick<MissionConfig, "crew_count">, risks?: WeatherRisks) {
  return risks?.cold ? (COLD_EXTRA_HEATER_W * config.crew_count) / 2 : 0;
}

/** Preserve the original activity load; dust adds exertion, cold adds a fixed heater load. */
export function equipmentPower(
  config: MissionConfig,
  activity: Activity,
  manualFactor: number,
  risks?: WeatherRisks,
) {
  const baseline = config.profiles[activity].power_w * manualFactor;
  if (!config.route || activity === "base") return baseline;
  const fixedPower = Math.max(0, config.profiles[activity].power_w - (30 * config.crew_count) / 2);
  return (
    baseline +
    fixedPower * manualFactor * (weatherExertion(risks) - 1) +
    extraHeaterPower(config, risks)
  );
}
