import { describe, expect, it } from "vitest";
import { anchorClock, clockPosition, resolveMissionClock, type MissionClock } from "./clock";
import type { MissionConfig } from "./types";

describe("mission clock", () => {
  it("advances a playing clock but never advances an ended simulation", () => {
    const clock: MissionClock = { mode: "playing", position_s: 1500, speed: 60, anchor_ms: 1000 };
    expect(clockPosition(clock, 2000, 9000)).toBe(1560);
    const ended = anchorClock({ ...clock, mode: "ended" }, 1560, 2000);
    expect(clockPosition(ended, 60000, 9000)).toBe(1560);
    expect(clockPosition(ended, 1000000, 9000)).toBe(1560);
  });

  const config = {
    duration_s: 2400,
    route: { legs: [{ activity: "return", start_s: 1000, end_s: 1500 }] },
  } as MissionConfig;
  const inbound: MissionClock = {
    mode: "playing",
    position_s: 1499.5,
    speed: 60,
    anchor_ms: 1000,
  };

  it("stops exactly at shelter even when a delayed request overshoots the entire recovery", () => {
    expect(resolveMissionClock(inbound, 1005, config).position_s).toBe(1499.8);
    for (const now of [2000, 1_000_000]) {
      expect(resolveMissionClock(inbound, now, config)).toMatchObject({
        mode: "paused",
        position_s: 1500,
      });
    }
  });

  it("lets explicit playback from the arrival boundary consume the retained recovery", () => {
    const paused = resolveMissionClock(inbound, 2000, config);
    expect(resolveMissionClock(paused, 100000, config).position_s).toBe(1500);
    const resumed = { ...paused, mode: "playing" as const };
    expect(resolveMissionClock(resumed, 3000, config).position_s).toBe(1560);
    expect(resolveMissionClock(resumed, 100000, config).position_s).toBe(2400);
  });

  it("re-arms the stop after seeking before arrival, not after seeking into recovery", () => {
    expect(resolveMissionClock({ ...inbound, position_s: 1200 }, 100000, config)).toMatchObject({
      mode: "paused",
      position_s: 1500,
    });
    expect(resolveMissionClock({ ...inbound, position_s: 1600 }, 2000, config)).toMatchObject({
      mode: "playing",
      position_s: 1660,
    });
  });

  it("does not impose a shelter stop on idle missions or returns with no recovery", () => {
    expect(resolveMissionClock(inbound, 2000, { duration_s: 2400 }).position_s).toBe(1559.5);
    expect(resolveMissionClock(inbound, 2000, { ...config, duration_s: 1500 }).mode).toBe(
      "playing",
    );
  });
});
