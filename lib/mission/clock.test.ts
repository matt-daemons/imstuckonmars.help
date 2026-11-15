import { describe, expect, it } from "vitest";
import { anchorClock, clockPosition, type MissionClock } from "./clock";

describe("mission clock", () => {
  it("advances a playing clock but never advances an ended simulation", () => {
    const clock: MissionClock = { mode: "playing", position_s: 1500, speed: 60, anchor_ms: 1000 };
    expect(clockPosition(clock, 2000, 9000)).toBe(1560);
    const ended = anchorClock({ ...clock, mode: "ended" }, 1560, 2000);
    expect(clockPosition(ended, 60000, 9000)).toBe(1560);
    expect(clockPosition(ended, 1000000, 9000)).toBe(1560);
  });
});
