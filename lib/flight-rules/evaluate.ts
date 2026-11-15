import * as zod from "zod";

import type { Verdict } from "@/lib/mars/types";

import { FLIGHT_RULES, type Factor } from "./rules";
import { SOLAR_ALERT_LEVELS, type SolarAlertLevel } from "./solar-alert";

/**
 * What a walk is checked on. Extra fields are ignored, so a whole route result
 * or live snapshot can be passed in as they are.
 */
export const evaPlanSchema = zod.object({
  route: zod.object({
    // Planned time for the whole walk, out and back, before any margin.
    est_time_min: zod.number().positive(),
    // Steepest slope on the route, in degrees.
    max_slope: zod.number().min(0).max(90),
    // Straight-line distance from base to the farthest point of the route.
    farthest_from_base_km: zod.number().min(0),
  }),
  live: zod.object({
    solar_alert_level: zod.enum(SOLAR_ALERT_LEVELS),
    // Radiation dose rate at the surface, in micrograys per hour.
    radiation_dose_rate: zod.number().min(0),
    // How much the dust in the air dims the Sun (optical depth, tau).
    dust_opacity: zod.number().min(0),
  }),
  // Minutes from the start of the walk until sunset at base. Negative after sunset.
  minutes_until_sunset: zod.number(),
});

export type EvaPlan = zod.infer<typeof evaPlanSchema>;

export type EvaVerdict<F extends string = Factor> = {
  verdict: Verdict;
  /** The rule behind the verdict, or null when the verdict is GO. */
  limiting_factor: F | null;
  /** One sentence per broken rule, most severe first. */
  reasons: string[];
};

/** One broken rule: which rule, how serious, and a sentence explaining it. */
export type Finding<F extends string = Factor> = {
  factor: F;
  verdict: "CAUTION" | "NO_GO";
  reason: string;
};

/** Says where a rule's limit comes from, so every reason admits what is assumed. */
function describeBasis(factor: Factor): string {
  const appliesTo = FLIGHT_RULES[factor].applies_to;
  if (appliesTo === "assumption") {
    return "our assumption, no NASA limit exists";
  }
  return `${appliesTo} limit, assumed for Mars`;
}

function makeFinding(factor: Factor, verdict: Finding["verdict"], explanation: string): Finding {
  return { factor, verdict, reason: `${explanation} (${describeBasis(factor)}).` };
}

function checkSlope(plan: Pick<EvaPlan, "route">): Finding | null {
  const rule = FLIGHT_RULES.slope;
  const slopeDegrees = plan.route.max_slope;
  const shownDegrees = Math.round(slopeDegrees * 10) / 10;
  if (slopeDegrees > rule.no_go_above_degrees) {
    return makeFinding(
      "slope",
      "NO_GO",
      `Steepest slope is ${shownDegrees}°, above the ${rule.no_go_above_degrees}° limit`,
    );
  }
  if (slopeDegrees > rule.caution_above_degrees) {
    return makeFinding(
      "slope",
      "CAUTION",
      `Steepest slope is ${shownDegrees}°, above ${rule.caution_above_degrees}°`,
    );
  }
  return null;
}

function checkWalkBack(plan: Pick<EvaPlan, "route">): Finding | null {
  const rule = FLIGHT_RULES.walk_back;
  const distanceKm = plan.route.farthest_from_base_km;
  if (distanceKm > rule.max_distance_km) {
    return makeFinding(
      "walk_back",
      "NO_GO",
      `The route goes ${Math.round(distanceKm * 100) / 100} km from base, beyond the ${rule.max_distance_km} km walk-back limit`,
    );
  }
  return null;
}

/** Planned walk time in minutes, lengthened by the margin for real terrain. */
function minutesWithMargin(plan: Pick<EvaPlan, "route">): number {
  return plan.route.est_time_min * FLIGHT_RULES.suit_supply.time_margin;
}

function checkSuitSupply(plan: Pick<EvaPlan, "route">): Finding | null {
  const rule = FLIGHT_RULES.suit_supply;
  const minutesNeeded = minutesWithMargin(plan);
  const usableMinutes = rule.primary_minutes - rule.reserve_minutes;
  if (minutesNeeded > usableMinutes) {
    return makeFinding(
      "suit_supply",
      "NO_GO",
      `The walk needs ${Math.round(minutesNeeded)} min with margin, more than the ${usableMinutes} min the suit supplies`,
    );
  }
  if (minutesNeeded > rule.planned_minutes) {
    return makeFinding(
      "suit_supply",
      "CAUTION",
      `The walk needs ${Math.round(minutesNeeded)} min with margin, longer than the planned ${rule.planned_minutes} min`,
    );
  }
  return null;
}

function checkRadiation(plan: {
  live: Pick<EvaPlan["live"], "solar_alert_level">;
}): Finding | null {
  const alertLevel = plan.live.solar_alert_level;
  if (alertLevel === "warning") {
    return makeFinding("radiation", "NO_GO", "Solar alert is at warning: stay in shelter");
  }
  if (alertLevel === "watch") {
    return makeFinding(
      "radiation",
      "CAUTION",
      "Solar alert is at watch: stay within 1 hour of base",
    );
  }
  return null;
}

function checkDoseRate(plan: {
  live: Pick<EvaPlan["live"], "radiation_dose_rate">;
}): Finding | null {
  const rule = FLIGHT_RULES.dose_rate;
  const doseRate = plan.live.radiation_dose_rate;
  if (doseRate >= rule.no_go_at_micrograys_per_hour) {
    return makeFinding(
      "dose_rate",
      "NO_GO",
      `Radiation dose rate is ${doseRate} µGy/h, at or above ${rule.no_go_at_micrograys_per_hour}`,
    );
  }
  if (doseRate >= rule.caution_at_micrograys_per_hour) {
    return makeFinding(
      "dose_rate",
      "CAUTION",
      `Radiation dose rate is ${doseRate} µGy/h, at or above ${rule.caution_at_micrograys_per_hour}`,
    );
  }
  return null;
}

function checkDust(plan: { live: Pick<EvaPlan["live"], "dust_opacity"> }): Finding | null {
  const rule = FLIGHT_RULES.dust;
  const dustOpacity = plan.live.dust_opacity;
  if (dustOpacity >= rule.no_go_at_opacity) {
    return makeFinding(
      "dust",
      "NO_GO",
      `Dust opacity is ${dustOpacity}, at or above ${rule.no_go_at_opacity}`,
    );
  }
  if (dustOpacity >= rule.caution_at_opacity) {
    return makeFinding(
      "dust",
      "CAUTION",
      `Dust opacity is ${dustOpacity}, at or above ${rule.caution_at_opacity}`,
    );
  }
  return null;
}

function checkDaylight(plan: Pick<EvaPlan, "route" | "minutes_until_sunset">): Finding | null {
  const rule = FLIGHT_RULES.daylight;
  const minutesToSpare = plan.minutes_until_sunset - minutesWithMargin(plan);
  if (minutesToSpare < 0) {
    return makeFinding(
      "daylight",
      "NO_GO",
      `The walk ends ${Math.round(-minutesToSpare)} min after sunset`,
    );
  }
  if (minutesToSpare < rule.margin_minutes) {
    return makeFinding(
      "daylight",
      "CAUTION",
      `The walk ends ${Math.round(minutesToSpare)} min before sunset, less than the ${rule.margin_minutes} min margin`,
    );
  }
  return null;
}

const ROUTE_CHECKS = [checkSlope, checkWalkBack, checkSuitSupply];

const CHECKS = [...ROUTE_CHECKS, checkRadiation, checkDoseRate, checkDust, checkDaylight];

/** Checks a planned walk against every flight rule and returns the worst result. */
export function evaluateEva(plan: EvaPlan): EvaVerdict {
  return toVerdict(CHECKS.map((check) => check(plan)));
}

/** Checks only the rules that depend on the route itself: slope, walk-back distance and suit time. */
export function evaluateRoute(route: EvaPlan["route"]): EvaVerdict {
  return toVerdict(ROUTE_CHECKS.map((check) => check({ route })));
}

/** The rules that depend on the weather and the time of day rather than on the route. */
export type StormFactor = "radiation" | "dose_rate" | "dust" | "daylight";

/** The storm inputs of an EvaPlan, each null while it is unknown. */
export interface KnownConditions {
  solar_alert_level: SolarAlertLevel | null;
  /** Micrograys per hour. */
  radiation_dose_rate: number | null;
  dust_opacity: number | null;
  minutes_until_sunset: number | null;
}

/**
 * Checks the route rules, plus each storm rule whose input is known. An unknown input is never
 * taken as fine: its rule is listed in not_checked instead. A label, when given, is appended to
 * that storm rule's reason, so the reason says where its value came from.
 */
export function evaluateWithConditions(
  route: EvaPlan["route"],
  known: KnownConditions,
  labels: Partial<Record<StormFactor, string>> = {},
): EvaVerdict & { not_checked: StormFactor[] } {
  const results = ROUTE_CHECKS.map((check) => check({ route }));
  const notChecked: StormFactor[] = [];
  function checkIfKnown<T>(
    factor: StormFactor,
    value: T | null,
    check: (value: T) => Finding | null,
  ) {
    if (value === null) {
      notChecked.push(factor);
      return;
    }
    const finding = check(value);
    const label = labels[factor];
    results.push(finding && label ? { ...finding, reason: `${finding.reason} ${label}` } : finding);
  }
  // In the same order as CHECKS, so a fully known plan gets evaluateEva's verdict.
  checkIfKnown("radiation", known.solar_alert_level, (level) =>
    checkRadiation({ live: { solar_alert_level: level } }),
  );
  checkIfKnown("dose_rate", known.radiation_dose_rate, (rate) =>
    checkDoseRate({ live: { radiation_dose_rate: rate } }),
  );
  checkIfKnown("dust", known.dust_opacity, (opacity) =>
    checkDust({ live: { dust_opacity: opacity } }),
  );
  checkIfKnown("daylight", known.minutes_until_sunset, (minutes) =>
    checkDaylight({ route, minutes_until_sunset: minutes }),
  );
  return { ...toVerdict(results), not_checked: notChecked };
}

/** Turns check results into a verdict, worst finding first. */
export function toVerdict<F extends string>(results: (Finding<F> | null)[]): EvaVerdict<F> {
  const findings = results.filter((finding) => finding !== null);
  const noGoFindings = findings.filter((finding) => finding.verdict === "NO_GO");
  const cautionFindings = findings.filter((finding) => finding.verdict === "CAUTION");
  const worstFirst = [...noGoFindings, ...cautionFindings];
  const worstFinding: Finding<F> | undefined = worstFirst[0];

  return {
    verdict: worstFinding?.verdict ?? "GO",
    limiting_factor: worstFinding?.factor ?? null,
    reasons: worstFirst.map((finding) => finding.reason),
  };
}
