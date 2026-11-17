// Display wording shared by the HUD, the run step, pre-flight and the report.
import { CircleCheckIcon, CircleHelpIcon, CircleXIcon, type LucideIcon } from "lucide-react";

import { formatDuration, formatNumber } from "@/lib/mission/format";
import type { Outcome, OutlookStatus, Resource } from "@/lib/mission/outlook";
import type { CrewPosition } from "@/lib/mission/types";

export const STATUS_STYLE: Record<
  OutlookStatus,
  { label: string; variant: "success" | "error" | "warning"; Icon: LucideIcon }
> = {
  modeled_resource_feasible: { label: "Reserves kept", variant: "success", Icon: CircleCheckIcon },
  modeled_constraint_violation: { label: "Reserve breached", variant: "error", Icon: CircleXIcon },
  unknown: { label: "Unknown", variant: "warning", Icon: CircleHelpIcon },
};

/** Energy inventory can stay above reserve while the discharge-power limit leaves load unmet. */
export function outcomeStyle(outcome: Pick<Outcome, "status" | "reasons">) {
  const style = STATUS_STYLE[outcome.status];
  if (outcome.status !== "modeled_constraint_violation") return style;
  const label = outcome.reasons.includes("eva_power_demand_unmet")
    ? "Power demand unmet"
    : outcome.reasons.includes("eva_oxygen_demand_unmet")
      ? "Oxygen demand unmet"
      : outcome.reasons.includes("time_return_reserve")
        ? "EVA time exceeded"
        : style.label;
  return { ...style, label };
}

export function returnedOutcomeText(status: OutlookStatus | undefined): string {
  if (status === "modeled_resource_feasible")
    return "Crew back in the shelter. The report is ready.";
  if (status === "modeled_constraint_violation")
    return "Crew reached shelter, but a modeled suit constraint was violated. Review the report.";
  return "Crew reached shelter; the modeled return outcome is unavailable.";
}

export const RESOURCE_LABEL: Record<Resource, string> = {
  suit_oxygen: "suit oxygen",
  suit_battery: "suit battery",
  eva_time: "EVA time",
};

export const PHASE_LABEL: Record<CrewPosition["phase"], string> = {
  shelter: "At shelter",
  outbound: "Walking out",
  science: "Sampling",
  inbound: "Walking back",
};

export const ACTIVITY_LABEL = {
  base: "At shelter",
  travel: "Walk out",
  science: "Sample",
  rest: "Rest",
  return: "Walk back",
} as const;

/** Mission elapsed time, TM-2: hh:mm:ss with a T+ prefix. */
export const missionTime = (s: number) => `T+${formatDuration(Math.max(0, s))}`;

export const grams = (g: number) => `${formatNumber(g, 0)} g`;
export const wattHours = (wh: number) => `${formatNumber(wh, 0)} Wh`;
export const signed = (value: number, unit: string) => `${formatNumber(value, 0, true)} ${unit}`;

export function metres(m: number) {
  return m >= 1000 ? `${formatNumber(m / 1000, 2)} km` : `${formatNumber(m, 0)} m`;
}

/** "1 h 05 min" for durations people read rather than compare. */
export function span(s: number) {
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
