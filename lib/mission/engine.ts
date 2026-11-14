import {
  MODEL_VERSION,
  MissionError,
  type BatteryConfig,
  type BatteryState,
  type Evaluation,
  type MissionConfig,
  type MoxieSample,
  type OxygenState,
  type ReturnRoute,
  type ScenarioEvent,
} from "./types";

const EPSILON = 1e-9;

function oxygenState(initial: number, reserve: number): OxygenState {
  return {
    remaining_g: initial,
    produced_g: 0,
    consumed_g: 0,
    leaked_g: 0,
    vented_g: 0,
    unmet_g: 0,
    transferred_in_g: 0,
    transferred_out_g: 0,
    first_reserve_crossing_s: initial <= reserve ? 0 : null,
  };
}

function batteryState(config: BatteryConfig): BatteryState {
  return {
    remaining_wh: config.initial_wh,
    capacity_wh: config.capacity_wh,
    charged_wh: 0,
    discharged_wh: 0,
    curtailed_wh: 0,
    unmet_wh: 0,
    failure_loss_wh: 0,
    transferred_in_wh: 0,
    transferred_out_wh: 0,
    transfer_loss_wh: 0,
    first_reserve_crossing_s: config.initial_wh <= config.reserve_wh ? 0 : null,
  };
}

function recordCrossing(
  before: number,
  after: number,
  reserve: number,
  start: number,
  dt: number,
): number | null {
  if (before <= reserve) return start;
  if (after > reserve) return null;
  return start + (dt * (before - reserve)) / (before - after);
}

function advanceOxygen(
  state: OxygenState,
  capacity: number,
  reserve: number,
  production: number,
  consumption: number,
  leak: number,
  start: number,
  dt: number,
) {
  const hours = dt / 3600;
  const produced = production * hours;
  const requested = (consumption + leak) * hours;
  const deliveredFraction =
    requested > 0 ? Math.min(1, (state.remaining_g + produced) / requested) : 1;
  const consumed = consumption * hours * deliveredFraction;
  const leaked = leak * hours * deliveredFraction;
  const remaining = state.remaining_g + produced - consumed - leaked;
  const vented = Math.max(0, remaining - capacity);
  const next = Math.max(0, remaining - vented);
  state.first_reserve_crossing_s ??= recordCrossing(
    state.remaining_g,
    state.remaining_g + produced - requested,
    reserve,
    start,
    dt,
  );
  state.remaining_g = next;
  state.produced_g += produced;
  state.consumed_g += consumed;
  state.leaked_g += leaked;
  state.vented_g += vented;
  state.unmet_g += consumption * hours - consumed;
}

function advanceBattery(
  state: BatteryState,
  config: BatteryConfig,
  generation: number,
  load: number,
  start: number,
  dt: number,
) {
  const before = state.remaining_wh;
  const hours = dt / 3600;
  const net = generation - load;
  if (net >= 0) {
    const stored = Math.min(
      state.capacity_wh - before,
      Math.min(net, config.max_charge_w) * config.charge_efficiency * hours,
    );
    state.remaining_wh += stored;
    state.charged_wh += stored;
    state.curtailed_wh += net * hours - stored / config.charge_efficiency;
  } else {
    const delivered =
      Math.min(-net, config.max_discharge_w, (before * config.discharge_efficiency) / hours) *
      hours;
    const removed = delivered / config.discharge_efficiency;
    state.remaining_wh = Math.max(0, before - removed);
    state.discharged_wh += removed;
    state.unmet_wh += -net * hours - delivered;
  }
  const unconstrained =
    net < 0
      ? before - (Math.min(-net, config.max_discharge_w) * hours) / config.discharge_efficiency
      : state.remaining_wh;
  state.first_reserve_crossing_s ??= recordCrossing(
    before,
    unconstrained,
    config.reserve_wh,
    start,
    dt,
  );
}

function activityAt(config: MissionConfig, time: number) {
  return (
    config.schedule.find((entry) => entry.start_s <= time && time < entry.end_s) ??
    config.schedule[config.schedule.length - 1]
  );
}

/** Pure replay: source row 1 supplies [0, 1), matching the inclusive archive sum. */
export function evaluateMission(
  config: MissionConfig,
  samples: MoxieSample[],
  events: ScenarioEvent[],
  requestedS: number,
): Evaluation {
  if (!Number.isFinite(requestedS) || requestedS < 0 || requestedS > config.duration_s) {
    throw new MissionError(
      "invalid_time",
      "Simulation time is outside the configured mission",
      400,
    );
  }
  const state: Evaluation = {
    model_version: MODEL_VERSION,
    provenance: "assumption-driven simulation",
    requested_s: requestedS,
    elapsed_s: 0,
    status: "ok",
    activity: activityAt(config, 0).activity,
    eva_elapsed_s: 0,
    oxygen: {
      base: oxygenState(config.oxygen.base.initial_g, config.oxygen.base.reserve_g),
      eva: oxygenState(config.oxygen.eva.initial_g, config.oxygen.eva.reserve_g),
    },
    battery: { base: batteryState(config.battery.base), eva: batteryState(config.battery.eva) },
    generator_available: true,
    generation_w: config.generation_w,
    oxygen_leak_g_h: { base: config.oxygen.base.leak_g_h, eva: config.oxygen.eva.leak_g_h },
    route_blocked: false,
    applied_event_ids: [],
    reasons: [],
    observed_sample: null,
    effective_oxygen_rate_g_h: null,
    effective_generator_power_w: null,
  };
  const orderedEvents = [...events].sort((a, b) => a.at_s - b.at_s);
  const leaks = state.oxygen_leak_g_h;
  let eventIndex = 0;
  const addReason = (reason: string) => {
    if (!state.reasons.includes(reason)) state.reasons.push(reason);
  };
  const applyEvent = (event: ScenarioEvent) => {
    state.applied_event_ids.push(event.id);
    switch (event.type) {
      case "generator_failure":
        state.generator_available = false;
        break;
      case "generator_restore":
        state.generator_available = true;
        break;
      case "generation_change":
        state.generation_w = event.value;
        break;
      case "oxygen_leak":
        leaks[event.target] = event.value;
        break;
      case "route_blocked":
        state.route_blocked = true;
        break;
      case "battery_failure": {
        const battery = state.battery[event.target];
        if (event.value > battery.capacity_wh) {
          throw new MissionError("invalid_event", "A failure cannot increase battery capacity");
        }
        battery.capacity_wh = event.value;
        const lost = Math.max(0, battery.remaining_wh - event.value);
        battery.remaining_wh -= lost;
        battery.failure_loss_wh += lost;
        if (battery.remaining_wh <= config.battery[event.target].reserve_wh) {
          battery.first_reserve_crossing_s ??= event.at_s;
        }
        break;
      }
      case "transfer_oxygen":
      case "transfer_energy": {
        if (activityAt(config, event.at_s).activity !== "base") {
          throw new MissionError(
            "invalid_transfer",
            "Transfers require the crew to be at the base",
          );
        }
        if (event.type === "transfer_oxygen") {
          const base = state.oxygen.base;
          const eva = state.oxygen.eva;
          if (
            event.value > base.remaining_g + EPSILON ||
            event.value > config.oxygen.eva.capacity_g - eva.remaining_g + EPSILON
          ) {
            throw new MissionError(
              "invalid_transfer",
              "Oxygen transfer exceeds inventory or portable capacity",
            );
          }
          base.remaining_g -= event.value;
          base.transferred_out_g += event.value;
          eva.remaining_g += event.value;
          eva.transferred_in_g += event.value;
          if (base.remaining_g <= config.oxygen.base.reserve_g)
            base.first_reserve_crossing_s ??= event.at_s;
        } else {
          const base = state.battery.base;
          const eva = state.battery.eva;
          const received = event.value * config.transfer_efficiency;
          if (
            event.value > base.remaining_wh + EPSILON ||
            received > eva.capacity_wh - eva.remaining_wh + EPSILON
          ) {
            throw new MissionError(
              "invalid_transfer",
              "Energy transfer exceeds inventory or portable capacity",
            );
          }
          base.remaining_wh -= event.value;
          base.transferred_out_wh += event.value;
          base.transfer_loss_wh += event.value - received;
          eva.remaining_wh += received;
          eva.transferred_in_wh += received;
          if (base.remaining_wh <= config.battery.base.reserve_wh)
            base.first_reserve_crossing_s ??= event.at_s;
        }
        break;
      }
    }
  };
  while (
    state.elapsed_s < requestedS - EPSILON ||
    (eventIndex < orderedEvents.length && orderedEvents[eventIndex].at_s <= requestedS)
  ) {
    while (
      eventIndex < orderedEvents.length &&
      orderedEvents[eventIndex].at_s <= state.elapsed_s + EPSILON
    ) {
      applyEvent(orderedEvents[eventIndex++]);
    }
    if (state.elapsed_s >= requestedS - EPSILON) break;
    const second = Math.floor(state.elapsed_s + EPSILON);
    const sample = samples[second];
    const first = samples[0];
    if (
      !sample ||
      sample.source_row !== config.source_start_row + second ||
      sample.segment_id !== first.segment_id ||
      sample.elapsed_ms !== first.elapsed_ms + second * 1000 ||
      sample.oxygen_rate_g_h === null ||
      sample.total_power_w === null
    ) {
      state.status = "source_unavailable";
      addReason("source_gap_or_unavailable_derived_output");
      break;
    }
    state.observed_sample = sample;
    const schedule = activityAt(config, state.elapsed_s);
    state.activity = schedule.activity;
    let dt = Math.min(
      requestedS - state.elapsed_s,
      second + 1 - state.elapsed_s,
      schedule.end_s - state.elapsed_s,
      (orderedEvents[eventIndex]?.at_s ?? Infinity) - state.elapsed_s,
    );
    const profile = config.profiles[schedule.activity];
    const crewAtBase = schedule.activity === "base";
    const baseLoad = config.base_load_w + (crewAtBase ? profile.power_w : 0);
    const battery = state.battery.base;
    const batteryConfig = config.battery.base;
    const availablePower =
      state.generation_w + (battery.remaining_wh > EPSILON ? batteryConfig.max_discharge_w : 0);
    if (state.generator_available && availablePower + EPSILON < baseLoad + sample.total_power_w) {
      state.generator_available = false;
      addReason("generator_power_shutdown_latched_until_restore");
    }
    const generatorPower = state.generator_available ? sample.total_power_w : 0;
    const production = state.generator_available
      ? sample.oxygen_rate_g_h * config.capture_efficiency
      : 0;
    const deficit = baseLoad + generatorPower - state.generation_w;
    // Resolve depletion before the next source/event boundary, not after an oversized step.
    if (deficit > 0 && battery.remaining_wh > EPSILON) {
      const deliveredPower = Math.min(deficit, batteryConfig.max_discharge_w);
      if (deliveredPower > 0)
        dt = Math.min(
          dt,
          (battery.remaining_wh * batteryConfig.discharge_efficiency * 3600) / deliveredPower,
        );
    }
    if (dt <= EPSILON) {
      throw new MissionError("integration_error", "No progress at a model boundary");
    }
    const start = state.elapsed_s;
    const demand = profile.oxygen_g_h_per_person * config.crew_count;
    advanceOxygen(
      state.oxygen.base,
      config.oxygen.base.capacity_g,
      config.oxygen.base.reserve_g,
      production,
      crewAtBase ? demand : 0,
      leaks.base,
      start,
      dt,
    );
    advanceOxygen(
      state.oxygen.eva,
      config.oxygen.eva.capacity_g,
      config.oxygen.eva.reserve_g,
      0,
      crewAtBase ? 0 : demand,
      leaks.eva,
      start,
      dt,
    );
    advanceBattery(
      battery,
      batteryConfig,
      state.generation_w,
      baseLoad + generatorPower,
      start,
      dt,
    );
    advanceBattery(
      state.battery.eva,
      config.battery.eva,
      0,
      crewAtBase ? 0 : profile.power_w,
      start,
      dt,
    );
    state.elapsed_s += dt;
    if (!crewAtBase) state.eva_elapsed_s += dt;
    state.effective_oxygen_rate_g_h = production;
    state.effective_generator_power_w = generatorPower;
  }
  state.activity = activityAt(config, state.elapsed_s).activity;
  for (const location of ["base", "eva"] as const) {
    if (state.oxygen[location].remaining_g < config.oxygen[location].reserve_g)
      addReason(`${location}_oxygen_below_reserve`);
    if (state.battery[location].remaining_wh < config.battery[location].reserve_wh)
      addReason(`${location}_battery_below_reserve`);
    if (state.oxygen[location].unmet_g > EPSILON) addReason(`${location}_oxygen_demand_unmet`);
    if (state.battery[location].unmet_wh > EPSILON) addReason(`${location}_power_demand_unmet`);
  }
  return state;
}

export function assessReturn(
  config: MissionConfig,
  snapshot: Evaluation,
  route: ReturnRoute,
  revision: number,
  events: ScenarioEvent[] = [],
) {
  const reasons: string[] = [];
  if (
    route.mission_revision !== revision ||
    route.base_id !== config.base.id ||
    Math.abs(route.evaluated_at_s - snapshot.elapsed_s) > 0.001
  )
    reasons.push("stale_route_or_different_base");
  if (snapshot.status !== "ok") reasons.push("source_unavailable");
  if (route.status !== "ok") reasons.push(route.status);
  if (snapshot.route_blocked) reasons.push("simulated_route_blocked");
  if (route.legs.length === 0) reasons.push("return_legs_missing");
  if (config.eva_limit_s === null) reasons.push("eva_time_limit_unknown");
  let duration = 0;
  let oxygen = 0;
  let energy = 0;
  for (const leg of route.legs) {
    const profile = config.profiles[leg.activity];
    duration += leg.duration_s;
    oxygen += (profile.oxygen_g_h_per_person * config.crew_count * leg.duration_s) / 3600;
    energy += (profile.power_w * leg.duration_s) / 3600 / config.battery.eva.discharge_efficiency;
    if (profile.power_w > config.battery.eva.max_discharge_w)
      reasons.push("portable_discharge_power_limit");
  }
  oxygen += (snapshot.oxygen_leak_g_h.eva * duration) / 3600;
  if (
    events.some(
      (event) => event.at_s > snapshot.elapsed_s && event.at_s <= snapshot.elapsed_s + duration,
    )
  ) {
    reasons.push("future_scenario_events_not_projected");
  }
  if (
    Object.values(snapshot.oxygen).some((inventory) => inventory.unmet_g > EPSILON) ||
    Object.values(snapshot.battery).some((inventory) => inventory.unmet_wh > EPSILON)
  ) {
    reasons.push("prior_unmet_resource_demand");
  }
  const margins = {
    oxygen_g: snapshot.oxygen.eva.remaining_g - oxygen - config.oxygen.eva.reserve_g,
    energy_wh: snapshot.battery.eva.remaining_wh - energy - config.battery.eva.reserve_wh,
    time_s:
      config.eva_limit_s === null ? null : config.eva_limit_s - snapshot.eva_elapsed_s - duration,
  };
  const failed =
    margins.oxygen_g < 0 ||
    margins.energy_wh < 0 ||
    (margins.time_s !== null && margins.time_s < 0) ||
    reasons.includes("portable_discharge_power_limit") ||
    reasons.includes("prior_unmet_resource_demand");
  const unknown = reasons.some(
    (reason) => !["portable_discharge_power_limit", "prior_unmet_resource_demand"].includes(reason),
  );
  return {
    status: unknown
      ? "unknown"
      : failed
        ? "modeled_constraint_violation"
        : "modeled_resource_feasible",
    scope: "oxygen, electrical energy and configured time only; not operational EVA safety",
    route_id: route.id,
    route_revision: route.revision,
    mission_revision: revision,
    requirements: { oxygen_g: oxygen, energy_wh: energy, duration_s: duration },
    margins,
    reasons: [
      ...new Set([
        ...reasons,
        ...(margins.oxygen_g < 0 ? ["oxygen_return_reserve"] : []),
        ...(margins.energy_wh < 0 ? ["energy_return_reserve"] : []),
        ...(margins.time_s !== null && margins.time_s < 0 ? ["time_return_reserve"] : []),
      ]),
    ],
    planner_warnings: route.warnings,
    limitations: [
      "Route and terrain validity are supplied by the external planner",
      "CO2 removal, thermal control and physiology are not validated",
    ],
  };
}
