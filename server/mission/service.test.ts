import { describe, expect, it } from "vitest";

import { MissionError } from "../../lib/mission/types";

import { requireUnfinishedFor } from "./service";

const DURATION_S = 3_600;

describe("requireUnfinishedFor", () => {
  it.each(["play", "speed", "event", "replan"])(
    "rejects %s once the run has played to its end",
    (type) => {
      expect(() => requireUnfinishedFor(type, DURATION_S, DURATION_S)).toThrow(
        expect.objectContaining({ code: "simulation_ended", status: 409 }),
      );
    },
  );

  it.each(["reset", "plan", "seek", "pause", "end"])("still allows %s at the end", (type) => {
    expect(() => requireUnfinishedFor(type, DURATION_S, DURATION_S)).not.toThrow();
  });

  it("allows every command while time is left", () => {
    for (const type of ["play", "speed", "event", "replan"])
      expect(() => requireUnfinishedFor(type, DURATION_S - 1, DURATION_S)).not.toThrow();
  });

  it("treats a run a rounding error short of the end as finished", () => {
    expect(() => requireUnfinishedFor("speed", DURATION_S - 1e-9, DURATION_S)).toThrow(
      MissionError,
    );
  });
});
