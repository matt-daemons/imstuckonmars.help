// Deterministic expedition alerts: derived from the backend snapshot and outlook, never from AI.
// Display state (acknowledged, suppressed, inhibited) is local and never changes the model.
import type { MissionOutlook, Snapshot } from "./client";

type ResourceSnapshot = Pick<Snapshot, "config" | "state">;

export type AlertLevel = "emergency" | "error" | "warning" | "info";
export const ALERT_PRIORITY: Record<AlertLevel, number> = {
  emergency: 0,
  error: 1,
  warning: 2,
  info: 3,
};
export const ALERT_LABEL: Record<AlertLevel, string> = {
  emergency: "Emergency",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/** A reserve less than this much mission time away raises a warning (a display assumption). */
export const RESERVE_WARNING_S = 30 * 60;

export interface AlertInstance {
  code: string;
  id: string;
  level: AlertLevel;
  name: string;
  system: string;
  detail: string;
  /** What to do. Required for Emergency and Error (AL-5). */
  response?: string;
}

export interface MissionAlert extends AlertInstance {
  first_s: number;
  active: boolean;
  acknowledged: boolean;
  suppressed: boolean;
  inhibited: boolean;
}

const REPLAN = "Open ④ Run and apply the recommended replan, or end sampling and walk back.";

/** Suit draw per hour at the current activity, the same terms the engine integrates. */
export function suitRates(snapshot: ResourceSnapshot) {
  const { config, state } = snapshot;
  if (state.activity === "base")
    return { oxygen_g_h: config.route ? 0 : state.oxygen_leak_g_h.eva, energy_wh_h: 0 };
  const profile = config.profiles[state.activity];
  const factor = state.demand_factor.eva;
  return {
    oxygen_g_h:
      profile.oxygen_g_h_per_person * config.crew_count * factor + state.oxygen_leak_g_h.eva,
    energy_wh_h: (profile.power_w * factor) / config.battery.eva.discharge_efficiency,
  };
}

/** Mission seconds until a draining supply reaches its reserve, or null when it is not draining. */
export function secondsToReserve(remaining: number, reserve: number, perHour: number) {
  if (perHour <= 1e-9 || remaining <= reserve) return null;
  return ((remaining - reserve) / perHour) * 3600;
}

const shelterName = (snapshot: ResourceSnapshot) =>
  snapshot.config.route?.shelter === "rover" ? "Rover" : "Habitat";

export function activeAlerts(
  snapshot: ResourceSnapshot,
  outlook: MissionOutlook | null,
): AlertInstance[] {
  const { state, config } = snapshot;
  const shelter = shelterName(snapshot);
  const alerts: AlertInstance[] = [];
  const add = (alert: AlertInstance) => alerts.push(alert);
  const reasons = new Set(state.reasons);
  if (reasons.has("eva_oxygen_demand_unmet"))
    add({
      code: "eva_oxygen_demand_unmet",
      id: "OXS-3",
      level: "emergency",
      name: "Suit oxygen exhausted",
      system: "Suits",
      detail: "The suit supply is empty, so crew oxygen demand is not met.",
      response: "End the walk now and take the shortest return. Inject no further faults.",
    });
  if (reasons.has("eva_power_demand_unmet"))
    add({
      code: "eva_power_demand_unmet",
      id: "PWS-3",
      level: "emergency",
      name: "Suit power exhausted",
      system: "Suits",
      detail: "The suit batteries cannot cover suit loads.",
      response: "End the walk now and take the shortest return.",
    });
  if (reasons.has("eva_oxygen_below_reserve"))
    add({
      code: "eva_oxygen_below_reserve",
      id: "OXS-2",
      level: "error",
      name: "Suit oxygen below reserve",
      system: "Suits",
      detail: `Suit oxygen is ${Math.round(state.oxygen.eva.remaining_g)} g, under the ${Math.round(config.oxygen.eva.reserve_g)} g reserve.`,
      response: REPLAN,
    });
  if (reasons.has("eva_battery_below_reserve"))
    add({
      code: "eva_battery_below_reserve",
      id: "PWS-2",
      level: "error",
      name: "Suit battery below reserve",
      system: "Suits",
      detail: `Suit battery is ${Math.round(state.battery.eva.remaining_wh)} Wh, under the ${Math.round(config.battery.eva.reserve_wh)} Wh reserve.`,
      response: REPLAN,
    });
  for (const [code, id, name] of [
    ["base_oxygen_below_reserve", "OXB-2", `${shelter} oxygen below reserve`],
    ["base_battery_below_reserve", "PWB-2", `${shelter} battery below reserve`],
  ] as const)
    if (reasons.has(code))
      add({
        code,
        id,
        level: "error",
        name,
        system: shelter,
        detail: `The ${shelter.toLowerCase()} stock is under its configured reserve.`,
        response: "Stop any shelter leak and restore generation before the stock runs out.",
      });
  // The outlook: will the crew reach shelter with every reserve?
  const plan = outlook?.options.find((o) => o.option === "continue");
  if (outlook && plan && !outlook.returned && plan.status === "modeled_constraint_violation") {
    const best = outlook.options.find((o) => o.option === outlook.recommended);
    const rescue = best && best.status === "modeled_resource_feasible";
    const short = plan.margins
      ? [
          plan.margins.oxygen_g < 0 ? `oxygen ${Math.round(-plan.margins.oxygen_g)} g` : null,
          plan.margins.energy_wh < 0 ? `battery ${Math.round(-plan.margins.energy_wh)} Wh` : null,
        ]
          .filter(Boolean)
          .join(" and ")
      : "";
    add({
      code: rescue ? "return_reserve_at_risk" : "no_option_keeps_reserves",
      id: rescue ? "RTN-2" : "RTN-3",
      level: rescue ? "error" : "emergency",
      name: rescue ? "Return reserve at risk" : "No option keeps the reserves",
      system: "Return",
      detail: rescue
        ? `As planned, the crew reaches the ${shelter.toLowerCase()} ${short} under reserve. ${best!.title} keeps every reserve.`
        : `Every option ends under a suit reserve. ${best ? `${best.title} leaves the most margin.` : ""}`,
      response: rescue
        ? `Apply “${best!.title}” in ④ Run.`
        : "Apply the option with the most margin now and stop sampling.",
    });
  }
  if (state.route_blocked && !outlook?.returned)
    add({
      code: "route_blocked",
      id: "RTN-1",
      level: "warning",
      name: "Return route blocked",
      system: "Return",
      detail: "A simulated blockage makes every return prediction unknown.",
    });
  if (state.oxygen_leak_g_h.eva > 0)
    add({
      code: "eva_oxygen_leak",
      id: "OXS-1",
      level: "warning",
      name: "Suit oxygen leak",
      system: "Suits",
      detail: `Simulated leak of ${Math.round(state.oxygen_leak_g_h.eva)} g/h on top of crew demand.`,
    });
  if (state.demand_factor.eva > 1)
    add({
      code: "eva_exertion",
      id: "EXS-1",
      level: "warning",
      name: "Crew exertion raised",
      system: "Suits",
      detail: `Suit oxygen and power draw at ×${state.demand_factor.eva.toFixed(1)} of the activity profile.`,
    });
  if (state.battery.eva.capacity_wh < config.battery.eva.capacity_wh)
    add({
      code: "eva_battery_fault",
      id: "PWS-1",
      level: "warning",
      name: "Suit battery capacity reduced",
      system: "Suits",
      detail: `Simulated cell loss: ${Math.round(state.battery.eva.capacity_wh)} of ${Math.round(config.battery.eva.capacity_wh)} Wh usable.`,
    });
  if (!state.generator_available && shelter === "Habitat")
    add({
      code: "generator_offline",
      id: "GEN-1",
      level: "warning",
      name: "Habitat oxygen generator offline",
      system: "Habitat",
      detail: "MOXIE production is not credited until the generator is restored.",
    });
  const rates = suitRates(snapshot);
  for (const [kind, remaining, reserve, perHour, id] of [
    [
      "oxygen",
      state.oxygen.eva.remaining_g,
      config.oxygen.eva.reserve_g,
      rates.oxygen_g_h,
      "OXS-R",
    ],
    [
      "battery",
      state.battery.eva.remaining_wh,
      config.battery.eva.reserve_wh,
      rates.energy_wh_h,
      "PWS-R",
    ],
  ] as const) {
    const left = secondsToReserve(remaining, reserve, perHour);
    if (left !== null && left < RESERVE_WARNING_S && state.activity !== "base")
      add({
        code: `eva_${kind}_reserve_near`,
        id,
        level: "warning",
        name: `Suit ${kind} reserve within 30 min`,
        system: "Suits",
        detail: `At the current draw the reserve is reached in ${Math.max(1, Math.round(left / 60))} min of mission time.`,
      });
  }
  if (reasons.has("archive_ended_no_production_credited"))
    add({
      code: "archive_ended",
      id: "DAT-2",
      level: "info",
      name: "Archived MOXIE run ended",
      system: "Archive replay",
      detail: "The NASA run is over, so no further habitat oxygen production is credited.",
    });
  if (reasons.has("source_gap_or_unavailable_derived_output"))
    add({
      code: "source_gap",
      id: "DAT-1",
      level: "warning",
      name: "Replay stopped at a NASA data gap",
      system: "Archive replay",
      detail: "The archived MOXIE trace has no derived sample here. Rewind to continue.",
    });
  return alerts.sort((a, b) => ALERT_PRIORITY[a.level] - ALERT_PRIORITY[b.level]);
}

/** Keeps local display state across snapshots; a cleared alert that returns annunciates again. */
export function reconcileAlerts(previous: MissionAlert[], incoming: AlertInstance[], atS: number) {
  const codes = new Set(incoming.map((a) => a.code));
  const next = previous.map((a) => ({ ...a, active: codes.has(a.code) }));
  for (const item of incoming) {
    const old = next.find((a) => a.code === item.code);
    if (!old) {
      next.push({
        ...item,
        first_s: atS,
        active: true,
        acknowledged: false,
        suppressed: false,
        inhibited: false,
      });
      continue;
    }
    const wasActive = previous.find((a) => a.code === item.code)?.active;
    Object.assign(old, item, { active: true });
    if (!wasActive) Object.assign(old, { first_s: atS, acknowledged: false, suppressed: false });
  }
  return next.sort(
    (a, b) => ALERT_PRIORITY[a.level] - ALERT_PRIORITY[b.level] || b.first_s - a.first_s,
  );
}

export const annunciating = (a: MissionAlert) =>
  a.active && !a.acknowledged && !a.suppressed && !a.inhibited;
