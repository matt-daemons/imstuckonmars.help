import type { MissionConfig } from "./types";

export interface MissionClock {
  mode: "paused" | "playing" | "ended";
  position_s: number;
  speed: number;
  anchor_ms: number;
}

export function clockPosition(clock: MissionClock, nowMs: number, durationS: number) {
  const elapsed =
    clock.mode === "playing" ? (Math.max(0, nowMs - clock.anchor_ms) * clock.speed) / 1000 : 0;
  return Math.min(durationS, clock.position_s + elapsed);
}

export function anchorClock(clock: MissionClock, positionS: number, nowMs: number): MissionClock {
  return { ...clock, position_s: positionS, anchor_ms: nowMs };
}

export function shelterArrivalS(config: Pick<MissionConfig, "route">): number | null {
  return config.route?.legs.findLast((leg) => leg.activity === "return")?.end_s ?? null;
}

/**
 * Crossing shelter arrival pauses before recovery, even without a request at the boundary.
 * Reads derive the same stop from the persisted anchor; Play at arrival explicitly resumes.
 */
export function resolveMissionClock(
  clock: MissionClock,
  nowMs: number,
  config: Pick<MissionConfig, "route" | "duration_s">,
): MissionClock {
  const position = clockPosition(clock, nowMs, config.duration_s);
  const arrival = shelterArrivalS(config);
  if (
    clock.mode === "playing" &&
    arrival !== null &&
    arrival < config.duration_s &&
    clock.position_s < arrival &&
    position >= arrival
  )
    return { ...clock, mode: "paused", position_s: arrival, anchor_ms: nowMs };
  return anchorClock(clock, position, nowMs);
}
