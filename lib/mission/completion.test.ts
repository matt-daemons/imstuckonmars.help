import { describe, expect, it } from "vitest";
import type { Snapshot } from "./client";
import {
  completionAlreadyShown,
  parseShownCompletion,
  reportKey,
  shownCompletion,
  shelterRecoveryPending,
  simulationFinished,
} from "./completion";

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
  it("retains controls at shelter until the configured recovery is played", () => {
    const sheltered = {
      ...snapshot("paused", 2700),
      config: {
        duration_s: 3600,
        route: { id: "route", legs: [{ activity: "return", end_s: 2700 }] },
      },
      state: { elapsed_s: 2700, status: "ok" },
    } as Snapshot;
    expect(shelterRecoveryPending(sheltered)).toBe(true);
    expect(simulationFinished(sheltered)).toBe(false);
    expect(
      shelterRecoveryPending({ ...sheltered, clock: { ...sheltered.clock, mode: "playing" } }),
    ).toBe(false);
    expect(
      shelterRecoveryPending({ ...sheltered, state: { ...sheltered.state, elapsed_s: 3600 } }),
    ).toBe(false);
    expect(shelterRecoveryPending(snapshot("ended", 2700))).toBe(false);
    expect(shelterRecoveryPending(null)).toBe(false);
  });
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

describe("report shown once per completed run", () => {
  const done = snapshot("ended", 3600);
  it("shows the first completion", () => {
    expect(completionAlreadyShown(null, done)).toBe(false);
  });
  it("does not show it again after a reload or a later command on the same run", () => {
    const shown = parseShownCompletion(JSON.stringify(shownCompletion(done)));
    expect(completionAlreadyShown(shown, done)).toBe(true);
    expect(completionAlreadyShown(shown, { ...done, revision: 5 })).toBe(true);
  });
  it("shows another mission, route or an older record's successor", () => {
    const shown = shownCompletion(done);
    expect(completionAlreadyShown(shown, { ...done, mission_id: "other" })).toBe(false);
    expect(
      completionAlreadyShown(shown, {
        ...done,
        config: { ...done.config, route: { id: "other" } },
      } as Snapshot),
    ).toBe(false);
    expect(completionAlreadyShown({ ...shown, revision: 9 }, done)).toBe(false);
  });
  it("ignores malformed storage", () => {
    expect(parseShownCompletion("{")).toBeNull();
    expect(parseShownCompletion(null)).toBeNull();
    expect(parseShownCompletion('{"mission_id":1}')).toBeNull();
  });
});
