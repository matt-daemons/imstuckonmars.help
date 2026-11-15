import {
  MAX_DURATION_S,
  MODEL_VERSION,
  MissionError,
  type Activity,
  type ExpeditionRoute,
  type MarsLngLat,
  type MissionConfig,
  type ReturnRoute,
  type ScenarioEvent,
} from "./types";

export function object(value: unknown, name = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MissionError("invalid_input", `${name} must be an object`, 400);
  }
  return value as Record<string, unknown>;
}

export function number(value: unknown, name: string, min = 0, max = 1e9): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new MissionError(
      "invalid_input",
      `${name} must be finite and between ${min} and ${max}`,
      400,
    );
  }
  return value;
}

export function integer(value: unknown, name: string, min = 0, max = 1e9): number {
  const result = number(value, name, min, max);
  if (!Number.isSafeInteger(result)) {
    throw new MissionError("invalid_input", `${name} must be an integer`, 400);
  }
  return result;
}

export function text(value: unknown, name: string, max = 128): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new MissionError(
      "invalid_input",
      `${name} must be a nonempty string of at most ${max} characters`,
      400,
    );
  }
  return value;
}

export function list(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new MissionError(
      "invalid_input",
      `${name} must be an array of at most ${max} items`,
      400,
    );
  }
  return value;
}

export function activity(value: unknown, includeBase = true): Activity {
  if (
    !["travel", "science", "rest", "return", ...(includeBase ? ["base"] : [])].includes(
      String(value),
    )
  ) {
    throw new MissionError("invalid_input", "Unknown activity", 400);
  }
  return value as Activity;
}

export function parseConfig(value: unknown): MissionConfig {
  const input = object(value, "configuration");
  if (input.model_version !== MODEL_VERSION || input.assumptions_acknowledged !== true) {
    throw new MissionError(
      "assumptions_required",
      "Acknowledge the assumption-driven model and use the supported model_version",
      400,
    );
  }
  const base = object(input.base, "base");
  const profiles = object(input.profiles, "profiles");
  const oxygen = object(input.oxygen, "oxygen");
  const battery = object(input.battery, "battery");
  const config: MissionConfig = {
    model_version: MODEL_VERSION,
    assumptions_acknowledged: true,
    run_id: text(input.run_id, "run_id"),
    source_start_row: integer(input.source_start_row, "source_start_row", 1),
    duration_s: number(input.duration_s, "duration_s", 0.001, MAX_DURATION_S),
    base: {
      id: text(base.id, "base.id"),
      latitude_deg: number(base.latitude_deg, "latitude_deg", -90, 90),
      longitude_deg: number(base.longitude_deg, "longitude_deg", -180, 180),
    },
    crew_count: integer(input.crew_count, "crew_count", 1, 20),
    capture_efficiency: number(input.capture_efficiency, "capture_efficiency", 0, 1),
    generation_w: number(input.generation_w, "generation_w"),
    base_load_w: number(input.base_load_w, "base_load_w"),
    transfer_efficiency: number(input.transfer_efficiency, "transfer_efficiency", 0.001, 1),
    eva_limit_s:
      input.eva_limit_s === null ? null : number(input.eva_limit_s, "eva_limit_s", 0, 86_400),
    oxygen: {} as MissionConfig["oxygen"],
    battery: {} as MissionConfig["battery"],
    profiles: {} as MissionConfig["profiles"],
    schedule: [],
  };
  for (const location of ["base", "eva"] as const) {
    const o = object(oxygen[location], `oxygen.${location}`);
    const b = object(battery[location], `battery.${location}`);
    const capacity_g = number(o.capacity_g, "capacity_g", 0.001);
    const capacity_wh = number(b.capacity_wh, "capacity_wh", 0.001);
    config.oxygen[location] = {
      capacity_g,
      initial_g: number(o.initial_g, "initial_g", 0, capacity_g),
      reserve_g: number(o.reserve_g, "reserve_g", 0, capacity_g),
      leak_g_h: number(o.leak_g_h, "leak_g_h"),
    };
    config.battery[location] = {
      capacity_wh,
      initial_wh: number(b.initial_wh, "initial_wh", 0, capacity_wh),
      reserve_wh: number(b.reserve_wh, "reserve_wh", 0, capacity_wh),
      charge_efficiency: number(b.charge_efficiency, "charge_efficiency", 0.001, 1),
      discharge_efficiency: number(b.discharge_efficiency, "discharge_efficiency", 0.001, 1),
      max_charge_w: number(b.max_charge_w, "max_charge_w"),
      max_discharge_w: number(b.max_discharge_w, "max_discharge_w"),
    };
  }
  for (const name of ["base", "travel", "science", "rest", "return"] as const) {
    const profile = object(profiles[name], `profiles.${name}`);
    config.profiles[name] = {
      oxygen_g_h_per_person: number(profile.oxygen_g_h_per_person, "oxygen_g_h_per_person"),
      power_w: number(profile.power_w, "power_w"),
    };
  }
  let cursor = 0;
  config.schedule = list(input.schedule, "schedule", 100).map((entry) => {
    const segment = object(entry, "schedule entry");
    const start_s = number(segment.start_s, "start_s", 0, config.duration_s);
    const end_s = number(segment.end_s, "end_s", 0, config.duration_s);
    if (start_s !== cursor || end_s <= start_s) {
      throw new MissionError(
        "invalid_schedule",
        "Schedule must cover the mission contiguously without overlaps",
        400,
      );
    }
    cursor = end_s;
    return { start_s, end_s, activity: activity(segment.activity) };
  });
  if (cursor !== config.duration_s) {
    throw new MissionError("invalid_schedule", "Schedule must end at duration_s", 400);
  }
  if (input.after_archive !== undefined) {
    if (input.after_archive !== "stop" && input.after_archive !== "no_production")
      throw new MissionError("invalid_input", "after_archive must be stop or no_production", 400);
    config.after_archive = input.after_archive;
  }
  if (input.route !== undefined) config.route = parseExpeditionRoute(input.route, config.schedule);
  return config;
}

export const MAX_ROUTE_POINTS = 2000;

export function point(value: unknown, name: string): MarsLngLat {
  if (!Array.isArray(value) || value.length !== 2)
    throw new MissionError("invalid_input", `${name} must be [longitude, latitude]`, 400);
  return [
    number(value[0], `${name} longitude`, -180, 180),
    number(value[1], `${name} latitude`, -90, 90),
  ];
}

/** A planned route whose legs cover exactly the schedule's away-from-shelter entries. */
export function parseExpeditionRoute(
  value: unknown,
  schedule: MissionConfig["schedule"],
): ExpeditionRoute {
  const input = object(value, "route");
  if (input.mode !== "walking" && input.mode !== "drive_walk")
    throw new MissionError("invalid_input", "route.mode must be walking or drive_walk", 400);
  if (input.shelter !== "habitat" && input.shelter !== "rover")
    throw new MissionError("invalid_input", "route.shelter must be habitat or rover", 400);
  let points = 0;
  const legs = list(input.legs, "route.legs", 20).map((entry, index) => {
    const leg = object(entry, `route.legs[${index}]`);
    const kind = activity(leg.activity, false);
    if (kind === "rest") throw new MissionError("invalid_input", "Route legs cannot rest", 400);
    const path = list(leg.path, `route.legs[${index}].path`, 600).map((p, i) =>
      point(p, `route.legs[${index}].path[${i}]`),
    );
    points += path.length;
    if (kind === "science" ? path.length !== 1 : path.length < 2)
      throw new MissionError(
        "invalid_route",
        "Science legs need one point; walking legs need at least two",
        400,
      );
    return {
      activity: kind as ExpeditionRoute["legs"][number]["activity"],
      start_s: number(leg.start_s, "leg.start_s", 0, MAX_DURATION_S),
      end_s: number(leg.end_s, "leg.end_s", 0, MAX_DURATION_S),
      path,
    };
  });
  if (points > MAX_ROUTE_POINTS)
    throw new MissionError("invalid_route", `A route has at most ${MAX_ROUTE_POINTS} points`, 400);
  const away = schedule.filter((entry) => entry.activity !== "base");
  const matches =
    away.length === legs.length &&
    away.every(
      (entry, i) =>
        entry.activity === legs[i].activity &&
        entry.start_s === legs[i].start_s &&
        entry.end_s === legs[i].end_s,
    );
  if (!matches)
    throw new MissionError(
      "invalid_route",
      "Route legs must match the schedule's travel, science and return entries in order",
      400,
    );
  const route: ExpeditionRoute = {
    id: text(input.id, "route.id"),
    mode: input.mode,
    shelter: input.shelter,
    shelter_lnglat: point(input.shelter_lnglat, "route.shelter_lnglat"),
    legs,
  };
  if (input.planned_sampling_s !== undefined)
    route.planned_sampling_s = number(
      input.planned_sampling_s,
      "route.planned_sampling_s",
      0,
      MAX_DURATION_S,
    );
  if (input.decisions !== undefined)
    route.decisions = list(input.decisions, "route.decisions", 20).map((entry) => {
      const decision = object(entry, "decision");
      if (decision.option !== "turn_back" && decision.option !== "cut_sampling")
        throw new MissionError("invalid_input", "Unknown replan option", 400);
      return {
        at_s: number(decision.at_s, "decision.at_s", 0, MAX_DURATION_S),
        option: decision.option,
        title: text(decision.title, "decision.title", 200),
      };
    });
  return route;
}

export function parseEvent(value: unknown, duration: number): ScenarioEvent {
  const event = object(value, "event");
  const common = { id: text(event.id, "event.id"), at_s: number(event.at_s, "at_s", 0, duration) };
  const target = () => {
    if (event.target !== "base" && event.target !== "eva") {
      throw new MissionError("invalid_input", "Event target must be base or eva", 400);
    }
    return event.target;
  };
  switch (event.type) {
    case "generator_failure":
    case "generator_restore":
    case "route_blocked":
      return { ...common, type: event.type };
    case "generation_change":
    case "transfer_oxygen":
    case "transfer_energy":
      return { ...common, type: event.type, value: number(event.value, "event.value") };
    case "consumption_change":
      return {
        ...common,
        type: event.type,
        target: target(),
        value: number(event.value, "event.value", 0.1, 5),
      };
    case "oxygen_leak":
    case "battery_failure":
      return {
        ...common,
        type: event.type,
        target: target(),
        value: number(event.value, "event.value"),
      };
    default:
      throw new MissionError("invalid_input", "Unknown scenario event", 400);
  }
}

export function parseRoute(value: unknown): ReturnRoute {
  const route = object(value, "route");
  if (!["ok", "no_path", "unknown_data"].includes(String(route.status))) {
    throw new MissionError("invalid_input", "Invalid planner status", 400);
  }
  return {
    id: text(route.id, "route.id"),
    revision: text(route.revision, "route.revision"),
    mission_revision: integer(route.mission_revision, "mission_revision"),
    base_id: text(route.base_id, "base_id"),
    evaluated_at_s: number(route.evaluated_at_s, "evaluated_at_s", 0, MAX_DURATION_S),
    status: route.status as ReturnRoute["status"],
    legs: list(route.legs, "legs", 100).map((value) => {
      const leg = object(value, "leg");
      return {
        activity: activity(leg.activity, false) as Exclude<Activity, "base">,
        duration_s: number(leg.duration_s, "leg.duration_s", 0, MAX_DURATION_S),
      };
    }),
    warnings: list(route.warnings, "warnings", 20).map((warning) => text(warning, "warning", 500)),
  };
}
