// Turns a planned route into a validated mission configuration: one schedule, one route and one
// set of resource assumptions, so position, oxygen, battery and time come from a single owner.
import { ROVER, ROVER_RULES } from "../flight-rules/rover-rules";
import { FLIGHT_RULES } from "../flight-rules/rules";
import preset from "./demo-preset.json";
import { MAX_DURATION_S, MissionError, type MarsLngLat, type MissionConfig } from "./types";
import { list, number, object, parseConfig, point, text } from "./validation";

/** The hypothetical Arcadia habitat; matches the "base" stop in public/data/processed/stops.geojson. */
export const HABITAT_LNGLAT: MarsLngLat = [-176.05, 45.97];

/** Suit checks and egress at the shelter before walking out (an assumption). */
export const PREP_S = 600;
/** Time back at the shelter after the walk, so the report shows recovery (an assumption). */
export const RECOVERY_S = 900;
export const MAX_LEG_POINTS = 600;

export interface ExpeditionPlan {
  id: string;
  mode: "walking" | "drive_walk";
  shelter_lnglat: MarsLngLat;
  outbound: { path: MarsLngLat[]; duration_s: number };
  sampling_s: number;
  back: { path: MarsLngLat[]; duration_s: number };
  /** Drive + walk only: the rover the crew parks and shelters in. */
  rover?: { power: "fission" | "solar"; battery_percent: number };
}

/** Validates a client plan. Paths are bounded; the server derives every resource figure. */
export function parsePlan(value: unknown): ExpeditionPlan {
  const input = object(value, "plan");
  if (input.mode !== "walking" && input.mode !== "drive_walk")
    throw new MissionError("invalid_input", "plan.mode must be walking or drive_walk", 400);
  const leg = (name: "outbound" | "back") => {
    const raw = object(input[name], `plan.${name}`);
    const path = list(raw.path, `plan.${name}.path`, MAX_LEG_POINTS).map((p, i) =>
      point(p, `plan.${name}.path[${i}]`),
    );
    if (path.length < 2)
      throw new MissionError("invalid_route", `plan.${name} needs at least two points`, 400);
    return {
      path,
      duration_s: number(raw.duration_s, `plan.${name}.duration_s`, 1, MAX_DURATION_S),
    };
  };
  const plan: ExpeditionPlan = {
    id: text(input.id, "plan.id"),
    mode: input.mode,
    shelter_lnglat: point(input.shelter_lnglat, "plan.shelter_lnglat"),
    outbound: leg("outbound"),
    sampling_s: number(input.sampling_s, "plan.sampling_s", 0, MAX_DURATION_S),
    back: leg("back"),
  };
  if (plan.mode === "drive_walk") {
    const rover = object(input.rover, "plan.rover");
    if (rover.power !== "fission" && rover.power !== "solar")
      throw new MissionError("invalid_input", "plan.rover.power must be fission or solar", 400);
    plan.rover = {
      power: rover.power,
      battery_percent: number(rover.battery_percent, "plan.rover.battery_percent", 0, 100),
    };
  }
  return plan;
}

/** Seconds the expedition needs on the mission clock, shelter time included. */
export function expeditionDuration(plan: Pick<ExpeditionPlan, "outbound" | "sampling_s" | "back">) {
  return PREP_S + plan.outbound.duration_s + plan.sampling_s + plan.back.duration_s + RECOVERY_S;
}

/**
 * Suit supplies sized to the flight rules: the main supply lasts primary_minutes at the travel
 * rate and the reserve is reserve_minutes of it. The simulator's grams and watt-hours then mean
 * the same thing as the planner's suit minutes.
 */
export function suitSizing(base: Pick<MissionConfig, "profiles" | "crew_count" | "battery">) {
  const suit = FLIGHT_RULES.suit_supply;
  const oxygenPerHour = base.profiles.travel.oxygen_g_h_per_person * base.crew_count;
  const energyPerHour = base.profiles.travel.power_w / base.battery.eva.discharge_efficiency;
  // Whole grams and watt-hours, the reserve rounded up so rounding never shrinks it.
  return {
    oxygen_g: Math.round((oxygenPerHour * suit.primary_minutes) / 60),
    oxygen_reserve_g: Math.ceil((oxygenPerHour * suit.reserve_minutes) / 60),
    energy_wh: Math.round((energyPerHour * suit.primary_minutes) / 60),
    energy_reserve_wh: Math.ceil((energyPerHour * suit.reserve_minutes) / 60),
    eva_limit_s: suit.primary_minutes * 60,
  };
}

/** The validated configuration for one expedition on the given archived run. */
export function buildExpeditionConfig(
  plan: ExpeditionPlan,
  runId: string,
  traceRows: number,
): MissionConfig {
  const duration = expeditionDuration(plan);
  if (duration > MAX_DURATION_S)
    throw new MissionError(
      "expedition_too_long",
      `The expedition needs ${Math.round(duration / 60)} min; the simulator runs at most ${MAX_DURATION_S / 60} min. Shorten sampling or choose a closer end`,
      422,
    );
  const base = structuredClone(preset) as unknown as MissionConfig;
  const sizing = suitSizing(base);
  const legs: NonNullable<MissionConfig["route"]>["legs"] = [];
  let t = PREP_S;
  const add = (activity: "travel" | "science" | "return", seconds: number, path: MarsLngLat[]) => {
    if (seconds <= 0) return;
    legs.push({ activity, start_s: t, end_s: t + seconds, path });
    t += seconds;
  };
  add("travel", plan.outbound.duration_s, plan.outbound.path);
  add("science", plan.sampling_s, [plan.outbound.path[plan.outbound.path.length - 1]]);
  add("return", plan.back.duration_s, plan.back.path);
  const rover = plan.mode === "drive_walk";
  const config = {
    ...base,
    run_id: runId,
    // Align the walk with the end of the archived run, where MOXIE produced oxygen; a longer
    // mission keeps running after the archive ends with no production credited.
    source_start_row: Math.max(1, traceRows - duration + 1),
    duration_s: duration,
    base: {
      id: rover ? "parked-rover" : "arcadia-habitat",
      latitude_deg: plan.shelter_lnglat[1],
      longitude_deg: plan.shelter_lnglat[0],
    },
    eva_limit_s: sizing.eva_limit_s,
    after_archive: "no_production" as const,
    oxygen: {
      base: base.oxygen.base,
      eva: {
        initial_g: sizing.oxygen_g,
        capacity_g: sizing.oxygen_g,
        reserve_g: sizing.oxygen_reserve_g,
        leak_g_h: 0,
      },
    },
    battery: {
      base: rover
        ? {
            ...base.battery.base,
            capacity_wh: ROVER.battery_kwh * 1000,
            initial_wh: (ROVER.battery_kwh * 1000 * plan.rover!.battery_percent) / 100,
            reserve_wh: (ROVER.battery_kwh * 1000 * ROVER_RULES.battery.no_go_below_percent) / 100,
            max_charge_w: 20_000,
            max_discharge_w: 20_000,
          }
        : base.battery.base,
      eva: {
        ...base.battery.eva,
        initial_wh: sizing.energy_wh,
        capacity_wh: sizing.energy_wh,
        reserve_wh: sizing.energy_reserve_wh,
      },
    },
    // In the rover, life support draws the hotel load; deployed fission power covers it, while
    // no solar charging is credited during the walk (a conservative assumption).
    base_load_w: rover ? ROVER.hotel_kw * 1000 : base.base_load_w,
    generation_w: rover
      ? plan.rover!.power === "fission"
        ? ROVER.hotel_kw * 1000
        : 0
      : base.generation_w,
    schedule: [
      { start_s: 0, end_s: PREP_S, activity: "base" as const },
      ...legs.map(({ activity, start_s, end_s }) => ({ activity, start_s, end_s })),
      { start_s: t, end_s: duration, activity: "base" as const },
    ],
    route: {
      id: plan.id,
      mode: plan.mode,
      shelter: rover ? ("rover" as const) : ("habitat" as const),
      shelter_lnglat: plan.shelter_lnglat,
      legs,
      planned_sampling_s: plan.sampling_s,
    },
  };
  return parseConfig(config);
}

/** An idle configuration at the shelter: the session exists before any plan is launched. */
export function idleConfig(runId: string, traceRows: number, shelter: MarsLngLat): MissionConfig {
  const base = structuredClone(preset) as unknown as MissionConfig;
  const duration = Math.min(traceRows, MAX_DURATION_S);
  return parseConfig({
    ...base,
    run_id: runId,
    source_start_row: 1,
    duration_s: duration,
    base: { id: "arcadia-habitat", latitude_deg: shelter[1], longitude_deg: shelter[0] },
    schedule: [{ start_s: 0, end_s: duration, activity: "base" }],
  });
}
