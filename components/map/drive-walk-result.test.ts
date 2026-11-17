import { describe, expect, it } from "vitest";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { PlannedPath } from "@/lib/mars/routing";
import { journeyFailureMessage } from "./drive-walk-result";

const blocked: PlannedPath = {
  status: "start_blocked",
  blocked_by: "zone_or_obstacle",
  path: [],
  distance_m: 0,
  cost: 0,
  max_slope_deg: 0,
  time_min: 0,
  expanded: 0,
};
const trip: DriveWalkPlan = {
  status: "drive_failed",
  collection: null,
  staging: null,
  verdict: null,
  drive: { outbound: blocked, back: blocked, summary: null },
  walk: null,
};

describe("drive + walk rejection feedback", () => {
  it("reports a blocked drive start without attributing it to slope", () => {
    expect(journeyFailureMessage(trip)).toMatch(/^Drive: Start is blocked by a no-go zone/);
    expect(journeyFailureMessage(trip)).not.toContain("steeper");
  });

  it("keeps rover and walk slope limits distinct", () => {
    const steep = { ...blocked, blocked_by: "slope" as const };
    expect(
      journeyFailureMessage({
        ...trip,
        drive: { outbound: steep, back: steep, summary: null },
      }),
    ).toContain("steeper than 10°");
    expect(
      journeyFailureMessage({
        ...trip,
        status: "walk_failed",
        walk: { outbound: steep, back: steep, timing: null, route: null, verdict: null },
      }),
    ).toContain("steeper than 20°");
  });

  it("offers clearing zones for a disconnected route rather than claiming slope alone caused it", () => {
    const noPath = { ...blocked, status: "no_path" as const, blocked_by: undefined };
    const message = journeyFailureMessage({
      ...trip,
      drive: { outbound: noPath, back: noPath, summary: null },
    });
    expect(message).toContain("and the no-go zones");
    expect(message).toContain("clear the zones");
  });
});
