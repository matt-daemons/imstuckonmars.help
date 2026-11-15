import type { EvaPlan, KnownConditions } from "@/lib/flight-rules/evaluate";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { SolarAlertLevel } from "@/lib/flight-rules/solar-alert";
import { walkMargins, type Margin } from "@/lib/mars/drive-walk";
import type { RouteSummary } from "@/lib/mars/types";

import type { RoutePlanInputs } from "./route-plan";

/** One field of the verdict strip. The value is a number with its unit, set in monospace. */
export interface StripField {
  label: string;
  value: string;
}

/**
 * A walk's margin, picked the way drive + walk picks its own: on the verdict's limiting rule, or
 * on the tightest of slope, walk-back and suit time when the walk is GO.
 */
export function walkMargin(route: EvaPlan["route"], limitingFactor: string | null): Margin {
  const margins = walkMargins(route);
  return (
    margins.find((margin) => margin.factor === limitingFactor) ??
    margins.reduce((tightest, margin) => (margin.used > tightest.used ? margin : tightest))
  );
}

interface Resource {
  label: string;
  unit: string;
  digits: number;
  /** The value must stay above the limit, as the battery's must. */
  floor?: boolean;
}

// Plain names, short units and decimals for the resources drive-walk.ts measures margins on.
const RESOURCES: Partial<Record<string, Resource>> = {
  walk_slope: { label: "Walk slope", unit: "°", digits: 1 },
  walk_back: { label: "Walk-back distance", unit: " km", digits: 2 },
  suit_supply: {
    label: `Walk + sampling ×${FLIGHT_RULES.suit_supply.time_margin}`,
    unit: " min",
    digits: 0,
  },
  rover_slope: { label: "Rover slope", unit: "°", digits: 1 },
  rover_battery: { label: "Rover battery", unit: "%", digits: 0, floor: true },
  rover_reserve: { label: "Drive-back reserve", unit: " km", digits: 0, floor: true },
  rover_range: { label: "Rover range", unit: " km", digits: 0 },
  trip_length: { label: "Trip length", unit: " sols", digits: 0 },
  dose_rate: { label: "Dose rate", unit: " µGy/h", digits: 1 },
  dust: { label: "Dust opacity", unit: "", digits: 2 },
  // Minutes until sunset must stay above the walk's minutes with margin.
  daylight: { label: "Until sunset", unit: " min", digits: 0, floor: true },
};

/** What the strip measures: a margin, or the solar alert's level, which has no number. */
export type Limit = RouteSummary["margin"] | SolarAlertLevel;

/**
 * The limit to show when a storm rule limits the verdict, or null when a route or rover rule does,
 * whose margin is measured as before.
 */
export function stormLimit(
  factor: string | null,
  conditions: KnownConditions,
  route: EvaPlan["route"],
): Limit | null {
  const { solar_alert_level, radiation_dose_rate, dust_opacity, minutes_until_sunset } = conditions;
  const { dose_rate, dust, suit_supply } = FLIGHT_RULES;
  if (factor === "radiation") return solar_alert_level;
  if (factor === "dose_rate" && radiation_dose_rate !== null) {
    const limit = dose_rate.no_go_at_micrograys_per_hour;
    return { resource: "dose_rate", value: radiation_dose_rate, limit, unit: "µGy/h" };
  }
  if (factor === "dust" && dust_opacity !== null) {
    return { resource: "dust", value: dust_opacity, limit: dust.no_go_at_opacity, unit: "" };
  }
  if (factor === "daylight" && minutes_until_sunset !== null) {
    // As the daylight rule counts it: the walk with its terrain margin must end before sunset.
    const walkMinutes = route.est_time_min * suit_supply.time_margin;
    return { resource: "daylight", value: minutes_until_sunset, limit: walkMinutes, unit: "min" };
  }
  return null;
}

/**
 * The limiting constraint, its margin to the no-go limit (negative once past it), and time to
 * shelter, or back to the start when a walk starts away from the habitat.
 */
export function stripFields(
  margin: Limit,
  shelterMin: number,
  shelterLabel: "Shelter" | "Back to start" = "Shelter",
): StripField[] {
  const shelter = { label: shelterLabel, value: `${Math.round(shelterMin)} min` };
  if (typeof margin === "string") {
    const level = `${margin[0].toUpperCase()}${margin.slice(1)}`;
    return [{ label: "Solar alert", value: level }, shelter];
  }
  // A resource added to the planner later still shows, under its id and unit.
  const { label, unit, digits, floor } = RESOURCES[margin.resource] ?? {
    label: margin.resource,
    unit: ` ${margin.unit}`,
    digits: 1,
  };
  const spare = floor ? margin.value - margin.limit : margin.limit - margin.value;
  // Rounded first, so a value that rounds to zero never shows as "−0".
  const show = (value: number) => {
    const text = value.toFixed(digits);
    return `${Number(text) === 0 ? text.replace("-", "") : text.replace("-", "−")}${unit}`;
  };
  // Past sunset, "Until sunset −12 min" reads better as the time since it.
  const afterSunset = margin.resource === "daylight" && Number(margin.value.toFixed(digits)) < 0;
  const value = afterSunset
    ? { label: "After sunset", value: show(-margin.value) }
    : { label, value: show(margin.value) };
  return [value, { label: "Margin", value: show(spare) }, shelter];
}

/** What the strip says without a verdict: the terrain failed, a plan is on its way, or no route. */
export function noRouteText(
  inputs: Pick<RoutePlanInputs, "mission" | "end">,
  walk: { plan: object | null; loadFailed: boolean },
  journey: { plan: object | null; driveFailed: boolean; siteFailed: boolean },
  hasDestination: boolean,
): string {
  if (!inputs.mission) return "No mission selected";
  if (!inputs.end) return "No destination selected";
  if (inputs.mission === "walking") {
    if (walk.loadFailed) return "Terrain unavailable";
    return walk.plan ? "No route yet" : "Planning…";
  }
  if (journey.driveFailed || journey.siteFailed) return "Terrain unavailable";
  // The trip's plan is null while its terrain loads or it replans.
  return hasDestination && !journey.plan ? "Planning…" : "No route yet";
}
