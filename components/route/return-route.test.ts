import { describe, expect, it } from "vitest";

import type { Plan } from "@/components/map/route-layers";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import { parseRoute } from "@/lib/mission/validation";

import { plannedReturn, returnCheckKey, returnRequest } from "./return-route";

const path = (time_min: number) => ({ status: "ok", time_min }) as Plan["back"];

const walk = {
  outbound: path(60),
  back: path(58.6),
  summary: { distance_km: 5.9, est_time_min: 118.6, max_slope: 0.5, farthest_from_base_km: 5.44 },
} as Plan;

const leg = (
  n: number,
  mode: "drive" | "walk",
  from: string,
  to: string,
  est_time_min: number,
) => ({
  type: "Feature",
  properties: {
    kind: "route-leg",
    route_id: "drive-walk-ESP_033225",
    leg: n,
    mode,
    from,
    to,
    est_time_min,
  },
  geometry: { type: "LineString", coordinates: [] },
});

const trip = {
  collection: {
    features: [
      leg(1, "drive", "base", "staging", 900),
      leg(2, "walk", "staging", "site", 31),
      leg(3, "walk", "site", "staging", 29.4),
      leg(4, "drive", "staging", "base", 900),
      { type: "Feature", properties: { kind: "staging" }, geometry: { type: "Point" } },
    ],
  },
} as unknown as DriveWalkPlan;

describe("plannedReturn", () => {
  it("sends a walk as one return leg: the planned walk back to the habitat", () => {
    expect(plannedReturn("walking", walk, null, true)).toEqual({
      id: "walk-back-to-habitat",
      duration_s: 3516,
    });
  });

  it("sends a drive + walk as the walk back to the rover only", () => {
    expect(plannedReturn("drive-walk", walk, trip, true)).toEqual({
      id: "drive-walk-ESP_033225-walk-back",
      duration_s: 1764,
    });
  });

  it("names a walk that starts away from the habitat as the walk back to the start", () => {
    expect(plannedReturn("walking", walk, null, false)?.id).toBe("walk-back-to-start");
  });

  it("sends nothing without a planned route", () => {
    expect(plannedReturn("walking", null, null, true)).toBeNull();
    expect(plannedReturn("walking", { ...walk, summary: null }, null, true)).toBeNull();
    expect(plannedReturn("drive-walk", walk, null, true)).toBeNull();
    expect(
      plannedReturn("drive-walk", walk, { collection: null } as DriveWalkPlan, true),
    ).toBeNull();
  });
});

describe("returnRequest", () => {
  it("builds a body the backend accepts, for the session's revision, base and clock", () => {
    const planned = { id: "walk-back-to-habitat", duration_s: 3516 };
    const body = returnRequest(planned, { revision: 3, baseId: "hypothetical-base", atS: 1800 });
    expect(body.at_s).toBe(1800);
    expect(parseRoute(body.route)).toEqual({
      id: "walk-back-to-habitat",
      revision: "3516 s",
      mission_revision: 3,
      base_id: "hypothetical-base",
      evaluated_at_s: 1800,
      status: "ok",
      legs: [{ activity: "return", duration_s: 3516 }],
      warnings: [],
    });
  });
});

describe("returnCheckKey", () => {
  const planned = { id: "walk-back-to-habitat", duration_s: 3516 };
  const key = (playing: boolean, atS: number, revision = 3) =>
    returnCheckKey(planned, { revision, playing, atS });

  it("changes every 5 mission minutes while the clock plays", () => {
    expect(key(true, 0)).toBe(key(true, 299));
    expect(key(true, 299)).not.toBe(key(true, 300));
  });

  it("ignores the clock while paused, but not a new revision", () => {
    expect(key(false, 0)).toBe(key(false, 900));
    expect(key(false, 0)).not.toBe(key(false, 0, 4));
  });
});
