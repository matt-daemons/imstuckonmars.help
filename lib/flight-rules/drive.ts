import type { DriveSummary } from "@/lib/mars/driving";

import { toVerdict, type EvaVerdict, type Finding } from "./evaluate";
import { ROVER_RULES, type RoverFactor } from "./rover-rules";

type RoverFinding = Finding<RoverFactor>;

/** Says where a rule's limit comes from, so every reason admits what is assumed. */
function describeBasis(factor: RoverFactor): string {
  const appliesTo = ROVER_RULES[factor].applies_to;
  return appliesTo === "assumption"
    ? "our assumption"
    : `${appliesTo} limit, assumed for this rover`;
}

function makeFinding(
  factor: RoverFactor,
  verdict: RoverFinding["verdict"],
  explanation: string,
): RoverFinding {
  return { factor, verdict, reason: `${explanation} (${describeBasis(factor)}).` };
}

function checkSlope(trip: DriveSummary): RoverFinding | null {
  const rule = ROVER_RULES.slope;
  const shownDegrees = Math.round(trip.max_slope * 10) / 10;
  if (trip.max_slope > rule.no_go_above_degrees) {
    return makeFinding(
      "slope",
      "NO_GO",
      `Steepest slope is ${shownDegrees}° on coarse terrain, above the ${rule.no_go_above_degrees}° limit`,
    );
  }
  if (trip.max_slope > rule.caution_above_degrees) {
    return makeFinding(
      "slope",
      "CAUTION",
      `Steepest slope is ${shownDegrees}° on coarse terrain, above ${rule.caution_above_degrees}°`,
    );
  }
  return null;
}

function checkBattery(trip: DriveSummary): RoverFinding | null {
  const rule = ROVER_RULES.battery;
  const shownPercent = Math.round(trip.battery_left_percent);
  if (trip.battery_left_percent < rule.no_go_below_percent) {
    return makeFinding(
      "battery",
      "NO_GO",
      `After the hardest sol the battery is down to ${shownPercent}%, below the ${rule.no_go_below_percent}% floor`,
    );
  }
  if (trip.battery_left_percent < rule.caution_below_percent) {
    return makeFinding(
      "battery",
      "CAUTION",
      `After the hardest sol the battery is down to ${shownPercent}%, below ${rule.caution_below_percent}%`,
    );
  }
  return null;
}

function checkReserve(trip: DriveSummary): RoverFinding | null {
  const rule = ROVER_RULES.reserve;
  const shownKm = Math.round(trip.reserve_km);
  if (trip.reserve_km < rule.no_go_below_km) {
    return makeFinding(
      "reserve",
      "NO_GO",
      `The battery keeps only ${shownKm} km of bad-terrain driving in reserve, less than the ${rule.no_go_below_km} km limit`,
    );
  }
  if (trip.reserve_km < rule.caution_below_km) {
    return makeFinding(
      "reserve",
      "CAUTION",
      `The battery keeps only ${shownKm} km of bad-terrain driving in reserve, less than ${rule.caution_below_km} km`,
    );
  }
  return null;
}

function checkRange(trip: DriveSummary): RoverFinding | null {
  const rule = ROVER_RULES.range;
  const shownKm = Math.round(trip.straight_km);
  if (trip.straight_km > rule.no_go_above_km) {
    return makeFinding(
      "range",
      "NO_GO",
      `The site is ${shownKm} km from base in a straight line, beyond the ${rule.no_go_above_km} km that any NASA plan reaches with two rovers`,
    );
  }
  if (trip.straight_km > rule.caution_above_km) {
    return makeFinding(
      "range",
      "CAUTION",
      `The site is ${shownKm} km from base in a straight line, beyond the ${rule.caution_above_km} km zone NASA plans for two rovers`,
    );
  }
  return null;
}

function checkTripLength(trip: DriveSummary): RoverFinding | null {
  const rule = ROVER_RULES.trip_length;
  if (trip.sols > rule.no_go_above_sols) {
    return makeFinding(
      "trip_length",
      "NO_GO",
      `The trip needs ${trip.sols} sols, more than the ${rule.no_go_above_sols}-sol limit`,
    );
  }
  if (trip.sols > rule.caution_above_sols) {
    return makeFinding(
      "trip_length",
      "CAUTION",
      `The trip needs ${trip.sols} sols, longer than ${rule.caution_above_sols} sols`,
    );
  }
  return null;
}

const CHECKS = [checkSlope, checkBattery, checkReserve, checkRange, checkTripLength];

/** Checks a planned drive against every rover rule and returns the worst result. */
export function evaluateDrive(trip: DriveSummary): EvaVerdict<RoverFactor> {
  return toVerdict(CHECKS.map((check) => check(trip)));
}
