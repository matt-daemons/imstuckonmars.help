import type { EvaPlan } from "@/lib/flight-rules/evaluate";
import { walkMargins, type Margin } from "@/lib/mars/drive-walk";
import type { RouteSummary } from "@/lib/mars/types";

import type { MissionType } from "./route-plan";

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
  suit_supply: { label: "Suit time with margin", unit: " min", digits: 0 },
  rover_slope: { label: "Rover slope", unit: "°", digits: 1 },
  rover_battery: { label: "Rover battery", unit: "%", digits: 0, floor: true },
  rover_reserve: { label: "Drive-back reserve", unit: " km", digits: 0, floor: true },
  rover_range: { label: "Rover range", unit: " km", digits: 0 },
  trip_length: { label: "Trip length", unit: " sols", digits: 0 },
};

/**
 * The limiting constraint, its margin to the no-go limit (negative once past it), and time to
 * shelter, or back to the start when a walk starts away from the habitat.
 */
export function stripFields(
  margin: RouteSummary["margin"],
  shelterMin: number,
  shelterLabel: "Shelter" | "Back to start" = "Shelter",
): StripField[] {
  // A resource added to the planner later still shows, under its id and unit.
  const { label, unit, digits, floor } = RESOURCES[margin.resource] ?? {
    label: margin.resource,
    unit: ` ${margin.unit}`,
    digits: 1,
  };
  const spare = floor ? margin.value - margin.limit : margin.limit - margin.value;
  const show = (value: number) => `${value.toFixed(digits).replace("-", "−")}${unit}`;
  return [
    { label, value: show(margin.value) },
    { label: "Margin", value: show(spare) },
    { label: shelterLabel, value: `${Math.round(shelterMin)} min` },
  ];
}

/** What the strip says without a verdict: the terrain failed, a plan is on its way, or no route. */
export function noRouteText(
  mission: MissionType,
  walk: { plan: object | null; loadFailed: boolean },
  journey: { plan: object | null; driveFailed: boolean; siteFailed: boolean },
  hasDestination: boolean,
): string {
  if (mission === "walking") {
    if (walk.loadFailed) return "Terrain unavailable";
    return walk.plan ? "No route yet" : "Planning…";
  }
  if (journey.driveFailed || journey.siteFailed) return "Terrain unavailable";
  // The trip's plan is null while its terrain loads or it replans.
  return hasDestination && !journey.plan ? "Planning…" : "No route yet";
}
