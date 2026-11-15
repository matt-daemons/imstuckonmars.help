import { describe, expect, it } from "vitest";
import type { Snapshot } from "./client";
import { reportKey, simulationFinished } from "./completion";

function snapshot(mode: "playing" | "paused" | "ended", time: number, route = true) {
  return {
    mission_id: "mission",
    revision: 2,
    clock: { mode },
    config: { duration_s: 3600, ...(route ? { route: { id: "route" } } : {}) },
    state: { elapsed_s: time },
  } as unknown as Snapshot;
}

describe("simulation completion", () => {
  it("does not hide the controls for idle, paused or source-interrupted runs", () => {
    expect(simulationFinished(null)).toBe(false);
    expect(simulationFinished(snapshot("paused", 0, false))).toBe(false);
    expect(simulationFinished(snapshot("paused", 1200))).toBe(false);
    expect(simulationFinished(snapshot("playing", 3599))).toBe(false);
  });
  it("finishes at the configured end or an explicit operator stop", () => {
    expect(simulationFinished(snapshot("paused", 3600))).toBe(true);
    expect(simulationFinished(snapshot("ended", 100))).toBe(true);
  });
  it("identifies a completed revision separately from a rerun of the same route", () => {
    expect(reportKey(snapshot("ended", 100))).toBe("mission:2");
    expect(reportKey({ ...snapshot("ended", 100), revision: 3 })).not.toBe("mission:2");
  });
});
