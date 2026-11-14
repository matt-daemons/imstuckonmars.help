export interface MissionClock {
  mode: "paused" | "playing";
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
