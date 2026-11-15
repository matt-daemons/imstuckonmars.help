// Deterministic outlook for an expedition: the predicted outcome of the current plan and of the
// alternatives the crew can switch to now. Every number comes from the same engine as the
// mission itself; nothing here is a safety verdict.
import { evaluateMission } from "./engine";
import { crewPositionAt, cutPath, pathLengthM, restPath } from "./position";
import type {
  Activity,
  Evaluation,
  ExpeditionLeg,
  MarsLngLat,
  MissionConfig,
  MoxieSample,
  ReplanOption,
  ScenarioEvent,
} from "./types";
import { parseConfig } from "./validation";

export type OutlookOption = "continue" | ReplanOption;
export type OutlookStatus =
  | "modeled_resource_feasible"
  | "modeled_constraint_violation"
  | "unknown";
export type Resource = "suit_oxygen" | "suit_battery" | "eva_time";

interface Segment {
  activity: Activity;
  duration_s: number;
  path?: MarsLngLat[];
}

export interface LegBudget {
  activity: Exclude<Activity, "base" | "rest">;
  start_s: number;
  end_s: number;
  /** Suit oxygen and energy drawn during the leg (leaks and exertion included). */
  oxygen_g: number;
  energy_wh: number;
}

export interface Outcome {
  option: OutlookOption;
  title: string;
  /** One sentence on what changes. */
  summary: string;
  available: boolean;
  unavailable_reason?: string;
  status: OutlookStatus;
  /** Mission time the crew is back at the shelter, or null if it cannot be computed. */
  arrival_s: number | null;
  /** Sampling time left in this option, seconds. */
  sampling_s: number;
  walk_remaining_m: number;
  at_arrival: { oxygen_g: number; energy_wh: number; eva_s: number } | null;
  reserve: { oxygen_g: number; energy_wh: number; eva_limit_s: number | null };
  /** At arrival, above the reserve (negative: below it). */
  margins: { oxygen_g: number; energy_wh: number; eva_time_s: number | null } | null;
  limiting: Resource | null;
  /** First predicted reserve crossing on the suits, mission seconds. */
  crossings: { oxygen_s: number | null; energy_s: number | null };
  reasons: string[];
  budget: LegBudget[];
}

export interface Outlook {
  at_s: number;
  phase: "shelter" | "outbound" | "science" | "inbound";
  departed: boolean;
  returned: boolean;
  options: Outcome[];
  recommended: OutlookOption | null;
  rationale: string;
  method: string;
}

const EPS = 1e-6;

function splitAt(config: MissionConfig, nowS: number) {
  const route = config.route!;
  const prefix: MissionConfig["schedule"] = [];
  const prefixLegs: ExpeditionLeg[] = [];
  const rest: Segment[] = [];
  let legIndex = 0;
  for (const entry of config.schedule) {
    const leg = entry.activity === "base" ? null : route.legs[legIndex++];
    if (entry.end_s <= nowS + EPS) {
      prefix.push(entry);
      if (leg) prefixLegs.push(leg);
      continue;
    }
    if (entry.start_s >= nowS - EPS) {
      rest.push({
        activity: entry.activity,
        duration_s: entry.end_s - entry.start_s,
        path: leg?.path,
      });
      continue;
    }
    const fraction = (nowS - entry.start_s) / (entry.end_s - entry.start_s);
    prefix.push({ ...entry, end_s: nowS });
    if (!leg) {
      rest.push({ activity: "base", duration_s: entry.end_s - nowS });
    } else if (leg.activity === "science") {
      prefixLegs.push({ ...leg, end_s: nowS });
      rest.push({ activity: "science", duration_s: entry.end_s - nowS, path: leg.path });
    } else {
      const along = pathLengthM(leg.path) * fraction;
      prefixLegs.push({ ...leg, end_s: nowS, path: cutPath(leg.path, along) });
      rest.push({
        activity: leg.activity,
        duration_s: entry.end_s - nowS,
        path: restPath(leg.path, along),
      });
    }
  }
  // The recovery time after the last walk is regenerated to fill the mission.
  while (rest.length && rest[rest.length - 1].activity === "base") rest.pop();
  return { prefix, prefixLegs, rest };
}

/** A complete configuration: the unchanged past, then `rest` from now, then shelter time. */
function assemble(
  config: MissionConfig,
  split: ReturnType<typeof splitAt>,
  rest: Segment[],
  nowS: number,
  decision?: { option: ReplanOption; title: string },
): MissionConfig | null {
  const schedule = [...split.prefix];
  const legs = [...split.prefixLegs];
  let t = schedule.length ? schedule[schedule.length - 1].end_s : 0;
  if (Math.abs(t - nowS) > EPS && schedule.length) return null;
  for (const segment of rest) {
    if (segment.duration_s <= EPS) continue;
    const end = t + segment.duration_s;
    schedule.push({ start_s: t, end_s: end, activity: segment.activity });
    if (segment.activity !== "base")
      legs.push({
        activity: segment.activity as ExpeditionLeg["activity"],
        start_s: t,
        end_s: end,
        path: segment.path!,
      });
    t = end;
  }
  if (t > config.duration_s + EPS) return null;
  if (t < config.duration_s - EPS)
    schedule.push({ start_s: t, end_s: config.duration_s, activity: "base" });
  else if (schedule.length) schedule[schedule.length - 1].end_s = config.duration_s;
  const route = {
    ...config.route!,
    legs,
    decisions: decision
      ? [...(config.route!.decisions ?? []), { at_s: nowS, ...decision }]
      : config.route!.decisions,
  };
  return parseConfig({ ...config, schedule, route });
}

function arrivalOf(config: MissionConfig): number | null {
  const returns = config.schedule.filter((entry) => entry.activity === "return");
  if (returns.length) return returns[returns.length - 1].end_s;
  return config.schedule.some((entry) => entry.activity !== "base") ? null : 0;
}

function evaluateOption(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  nowS: number,
): Omit<Outcome, "option" | "title" | "summary" | "available"> {
  const arrival = arrivalOf(config);
  const target = Math.min(config.duration_s, Math.max(nowS, arrival ?? config.duration_s));
  const boundaries = [...new Set(config.schedule.flatMap((e) => [e.start_s, e.end_s]))].filter(
    (time) => time <= target + EPS,
  );
  const states = new Map<number, Evaluation>();
  const state = evaluateMission(config, samples, events, target, {
    times: boundaries,
    record: (s) => states.set(s.elapsed_s, s),
  });
  const at = (time: number) => {
    for (const [key, value] of states) if (Math.abs(key - time) < 1e-3) return value;
    return null;
  };
  const budget: LegBudget[] = [];
  for (const entry of config.schedule) {
    if (entry.activity === "base" || entry.activity === "rest" || entry.end_s > target + EPS)
      continue;
    const a = at(entry.start_s);
    const b = at(entry.end_s);
    if (!a || !b) continue;
    budget.push({
      activity: entry.activity,
      start_s: entry.start_s,
      end_s: entry.end_s,
      oxygen_g: a.oxygen.eva.remaining_g - b.oxygen.eva.remaining_g,
      energy_wh: a.battery.eva.remaining_wh - b.battery.eva.remaining_wh,
    });
  }
  const reserve = {
    oxygen_g: config.oxygen.eva.reserve_g,
    energy_wh: config.battery.eva.reserve_wh,
    eva_limit_s: config.eva_limit_s,
  };
  const rest = splitAt(config, nowS).rest;
  const sampling = rest
    .filter((s) => s.activity === "science")
    .reduce((sum, s) => sum + s.duration_s, 0);
  const walk = rest
    .filter((s) => s.activity === "travel" || s.activity === "return")
    .reduce((sum, s) => sum + pathLengthM(s.path ?? []), 0);
  const crossings = {
    oxygen_s: state.oxygen.eva.first_reserve_crossing_s,
    energy_s: state.battery.eva.first_reserve_crossing_s,
  };
  const common = {
    arrival_s: arrival,
    sampling_s: sampling,
    walk_remaining_m: walk,
    reserve,
    crossings,
    budget,
  };
  if (state.status !== "ok" || arrival === null)
    return {
      ...common,
      status: "unknown",
      at_arrival: null,
      margins: null,
      limiting: null,
      reasons: state.status !== "ok" ? ["source_unavailable"] : ["arrival_unknown"],
    };
  // Unmet demand counts against the margin, so an empty tank still shows the full shortfall.
  const margins = {
    oxygen_g: state.oxygen.eva.remaining_g - state.oxygen.eva.shortfall_g - reserve.oxygen_g,
    energy_wh: state.battery.eva.remaining_wh - state.battery.eva.unmet_wh - reserve.energy_wh,
    eva_time_s: reserve.eva_limit_s === null ? null : reserve.eva_limit_s - state.eva_elapsed_s,
  };
  const reasons: string[] = [];
  if (margins.oxygen_g < 0) reasons.push("oxygen_return_reserve");
  if (margins.energy_wh < 0) reasons.push("energy_return_reserve");
  if (margins.eva_time_s !== null && margins.eva_time_s < 0) reasons.push("time_return_reserve");
  if (state.oxygen.eva.unmet_g > EPS) reasons.push("eva_oxygen_demand_unmet");
  if (state.battery.eva.unmet_wh > EPS) reasons.push("eva_power_demand_unmet");
  const awayNow = crewPositionAt(config.route!, nowS).phase !== "shelter";
  if (state.route_blocked && awayNow) reasons.push("simulated_route_blocked");
  // The share of each usable supply left at arrival; the smallest one limits.
  const shares: Array<[Resource, number]> = [
    ["suit_oxygen", margins.oxygen_g / (config.oxygen.eva.capacity_g - reserve.oxygen_g)],
    ["suit_battery", margins.energy_wh / (config.battery.eva.capacity_wh - reserve.energy_wh)],
  ];
  if (margins.eva_time_s !== null && reserve.eva_limit_s)
    shares.push(["eva_time", margins.eva_time_s / reserve.eva_limit_s]);
  const limiting = shares.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const violated = reasons.some((r) => r !== "simulated_route_blocked");
  return {
    ...common,
    status: reasons.includes("simulated_route_blocked")
      ? "unknown"
      : violated
        ? "modeled_constraint_violation"
        : "modeled_resource_feasible",
    at_arrival: {
      oxygen_g: state.oxygen.eva.remaining_g,
      energy_wh: state.battery.eva.remaining_wh,
      eva_s: state.eva_elapsed_s,
    },
    margins,
    limiting,
    reasons,
  };
}

const minutes = (s: number) => `${Math.round(s / 60)} min`;

/** Candidate configurations at `nowS`, before evaluation. */
function candidates(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  nowS: number,
) {
  const split = splitAt(config, nowS);
  const position = crewPositionAt(config.route!, nowS);
  const departed = split.prefixLegs.length > 0;
  const list: Array<{
    option: OutlookOption;
    title: string;
    summary: string;
    config: MissionConfig | null;
    unavailable?: string;
  }> = [
    {
      option: "continue",
      title: "Continue as planned",
      summary: "Keep the current walk and sampling time.",
      config,
    },
  ];
  // Turn back: retrace the walked path from here, or end sampling and take the planned return.
  if (position.phase === "outbound") {
    const walked = split.prefixLegs
      .filter((leg) => leg.activity === "travel")
      .flatMap((leg, i) => (i === 0 ? leg.path : leg.path.slice(1)));
    const travel = config.route!.legs.filter((leg) => leg.activity === "travel");
    const pace =
      travel.reduce((sum, leg) => sum + pathLengthM(leg.path), 0) /
      travel.reduce((sum, leg) => sum + (leg.end_s - leg.start_s), 0);
    const back = [...walked].reverse();
    const title = "Turn back now";
    list.push({
      option: "turn_back",
      title,
      summary: `Retrace the ${Math.round(position.travelled_m)} m walked so far to the shelter.`,
      config: assemble(
        config,
        split,
        [{ activity: "return", duration_s: pathLengthM(back) / pace, path: back }],
        nowS,
        { option: "turn_back", title },
      ),
    });
  } else if (position.phase === "science") {
    const title = "End sampling, walk back now";
    list.push({
      option: "turn_back",
      title,
      summary: "Stop sampling here and take the planned return path.",
      config: assemble(
        config,
        split,
        split.rest.filter((s) => s.activity !== "science"),
        nowS,
        { option: "turn_back", title },
      ),
    });
  } else {
    list.push({
      option: "turn_back",
      title: "Turn back now",
      summary: "Retrace the walk to the shelter.",
      config: null,
      unavailable:
        position.phase === "inbound"
          ? "The crew is already walking back."
          : departed
            ? "The crew is back at the shelter."
            : "The crew has not left the shelter yet.",
    });
  }
  // Cut sampling: the longest sampling that keeps both suit reserves plus a 10-minute walking
  // buffer; if the plan already has that, halve the sampling for more margin.
  const science = split.rest.find((s) => s.activity === "science");
  if (science && science.duration_s > 1) {
    const now = evaluateMission(config, samples, events, nowS);
    const plan = evaluateOption(config, samples, events, nowS);
    const factor = now.demand_factor.eva;
    const crew = config.crew_count;
    const o2Rate =
      config.profiles.science.oxygen_g_h_per_person * crew * factor + now.oxygen_leak_g_h.eva;
    const whRate =
      (config.profiles.science.power_w * factor) / config.battery.eva.discharge_efficiency;
    const o2Buffer = (config.profiles.travel.oxygen_g_h_per_person * crew * factor) / 6;
    const whBuffer =
      (config.profiles.travel.power_w * factor) / config.battery.eva.discharge_efficiency / 6;
    const needed = plan.margins
      ? Math.max(
          0,
          ((o2Buffer - plan.margins.oxygen_g) / o2Rate) * 3600,
          ((whBuffer - plan.margins.energy_wh) / whRate) * 3600,
        )
      : 0;
    const keep = needed > 0 ? Math.max(0, science.duration_s - needed) : science.duration_s / 2;
    const title =
      keep <= 1
        ? "Skip the remaining sampling"
        : `${needed > 0 ? "Cut" : "Halve"} sampling to ${minutes(keep)}`;
    const shortened = split.rest.map((s) => (s === science ? { ...s, duration_s: keep } : s));
    list.push({
      option: "cut_sampling",
      title,
      summary:
        needed > 0
          ? "The longest sampling that keeps both suit reserves plus a 10 min walking buffer."
          : "The plan already keeps its reserves; half the sampling buys more margin.",
      config:
        position.phase === "science" && keep <= 1
          ? null
          : assemble(config, split, shortened, nowS, { option: "cut_sampling", title }),
      unavailable:
        position.phase === "science" && keep <= 1 ? "Same as ending sampling now." : undefined,
    });
  } else {
    list.push({
      option: "cut_sampling",
      title: "Cut sampling",
      summary: "Shorten the time at the site.",
      config: null,
      unavailable: "No sampling time is left.",
    });
  }
  return { list, position, departed };
}

export function missionOutlook(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  nowS: number,
): Outlook {
  if (!config.route) throw new Error("This mission has no planned route");
  const { list, position, departed } = candidates(config, samples, events, nowS);
  const options: Outcome[] = list.map((candidate) => {
    const base = {
      option: candidate.option,
      title: candidate.title,
      summary: candidate.summary,
    };
    if (!candidate.config)
      return {
        ...base,
        available: false,
        unavailable_reason: candidate.unavailable ?? "This option does not fit the mission time.",
        status: "unknown",
        arrival_s: null,
        sampling_s: 0,
        walk_remaining_m: 0,
        at_arrival: null,
        reserve: {
          oxygen_g: config.oxygen.eva.reserve_g,
          energy_wh: config.battery.eva.reserve_wh,
          eva_limit_s: config.eva_limit_s,
        },
        margins: null,
        limiting: null,
        crossings: { oxygen_s: null, energy_s: null },
        reasons: [],
        budget: [],
      };
    return { ...base, available: true, ...evaluateOption(candidate.config, samples, events, nowS) };
  });
  const returned = departed && position.phase === "shelter";
  const usable = options.filter((o) => o.available && o.status !== "unknown");
  const feasible = usable.filter((o) => o.status === "modeled_resource_feasible");
  const share = (o: Outcome) =>
    o.margins
      ? Math.min(
          o.margins.oxygen_g / (config.oxygen.eva.capacity_g - o.reserve.oxygen_g),
          o.margins.energy_wh / (config.battery.eva.capacity_wh - o.reserve.energy_wh),
        )
      : -Infinity;
  let recommended: OutlookOption | null = null;
  let rationale = "";
  if (returned) {
    rationale = "The crew is back at the shelter; there is nothing to replan.";
  } else if (feasible.length) {
    // Most science first, then the most margin.
    const best = [...feasible].sort(
      (a, b) => b.sampling_s - a.sampling_s || share(b) - share(a),
    )[0];
    recommended = best.option;
    rationale =
      best.option === "continue"
        ? "The plan as it stands keeps every suit reserve, so it keeps the most sampling."
        : `The current plan breaks a suit reserve. ${best.title} is the option that keeps every reserve with the most sampling left.`;
  } else if (usable.length) {
    const best = [...usable].sort((a, b) => share(b) - share(a))[0];
    recommended = best.option;
    rationale = `No option keeps every suit reserve. ${best.title} leaves the most margin on the limiting supply.`;
  } else {
    rationale =
      "No option can be assessed: the simulated return route is blocked or data is missing.";
  }
  return {
    at_s: nowS,
    phase: position.phase,
    departed,
    returned,
    options,
    recommended,
    rationale,
    method:
      "Deterministic replay of the mission engine for each option from now to the crew's return, including leaks, exertion and faults already scheduled. Predictions, not observations; not a safety verdict.",
  };
}

/** The configuration for an applied replan, or a reason it is unavailable. */
export function replanConfig(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  nowS: number,
  option: ReplanOption,
): MissionConfig | string {
  if (!config.route) return "This mission has no planned route";
  const candidate = candidates(config, samples, events, nowS).list.find((c) => c.option === option);
  if (!candidate?.config) return candidate?.unavailable ?? "That option is not available now";
  return candidate.config;
}
