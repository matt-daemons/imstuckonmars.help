import * as zod from "zod";

import { FLIGHT_RULES } from "./rules";

/**
 * Walk-leg timing: how long a suited walk (EVA leg) keeps the crew in their suits.
 *
 *   suit time = walking distance ÷ walking pace + sampling time + suit reserve
 *
 * The pace (2 km/h) and the 30 min reserve come from the flight rules (Moon and
 * ISS values, assumed for Mars). Sampling time is a planning input, not a NASA
 * value. The 1.3 terrain margin is NOT applied here: `evaluateEva` applies it,
 * so pass `est_time_min` (not `suit_time_min`) into its `route.est_time_min`.
 */
export const walkLegSchema = zod.object({
  // Total distance walked on the leg, out and back, in kilometres.
  walk_distance_km: zod.number().min(0),
  // Time spent sampling at the stop, in minutes.
  sampling_min: zod.number().min(0),
});

export type WalkLeg = zod.infer<typeof walkLegSchema>;

export type WalkLegTiming = {
  /** Time on foot: distance ÷ pace. */
  walking_min: number;
  /** Time spent sampling, as given. */
  sampling_min: number;
  /** Walking + sampling. This is what `evaluateEva` expects as `route.est_time_min`. */
  est_time_min: number;
  /** Suit supply that must be left on return. */
  reserve_min: number;
  /** Walking + sampling + reserve: the suit time the leg uses up. */
  suit_time_min: number;
  /** Main suit supply left after the leg and its reserve. Negative means it does not fit. */
  suit_minutes_left: number;
  /** What the numbers assume, for the UI to show next to them. */
  assumptions: string[];
};

/** Turns a walk leg's distance and sampling time into suit time. */
export function walkLegTiming(leg: WalkLeg): WalkLegTiming {
  const { walk_distance_km, sampling_min } = walkLegSchema.parse(leg);
  const paceKmPerHour = FLIGHT_RULES.walk_back.walking_km_per_hour;
  const suit = FLIGHT_RULES.suit_supply;

  const walkingMin = (walk_distance_km / paceKmPerHour) * 60;
  const estTimeMin = walkingMin + sampling_min;
  const suitTimeMin = estTimeMin + suit.reserve_minutes;

  return {
    walking_min: walkingMin,
    sampling_min,
    est_time_min: estTimeMin,
    reserve_min: suit.reserve_minutes,
    suit_time_min: suitTimeMin,
    suit_minutes_left: suit.primary_minutes - suitTimeMin,
    assumptions: [
      `Walking pace ${paceKmPerHour} km/h (${FLIGHT_RULES.walk_back.applies_to} value, assumed for Mars).`,
      `Suit reserve ${suit.reserve_minutes} min and main supply ${suit.primary_minutes} min (${suit.applies_to} values, assumed for Mars).`,
      "Sampling time is a planning input, not a NASA value.",
      `No terrain margin included; the verdict adds ×${suit.time_margin}.`,
    ],
  };
}
