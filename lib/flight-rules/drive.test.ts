import { describe, expect, it } from "vitest";

import type { DriveSummary } from "@/lib/mars/driving";

import { evaluateDrive } from "./drive";

// A short fission trip on gentle ground.
const safeTrip: DriveSummary = {
  one_way_km: 60,
  odometer_km: 156,
  sols: 4,
  hardest_sol_kwh: 65,
  battery_left_percent: 67.5,
  reserve_km: 36,
  max_slope: 3,
  straight_km: 55,
  power: "fission",
  ground_km: { loose_dust: 0, sand_crust: 0, firm: 0, no_data: 120 },
};

function tripWith(changes: Partial<DriveSummary>): DriveSummary {
  return { ...safeTrip, ...changes };
}

describe("evaluateDrive", () => {
  it("gives GO with no limiting factor when every rule is met", () => {
    expect(evaluateDrive(safeTrip)).toEqual({ verdict: "GO", limiting_factor: null, reasons: [] });
  });

  it.each([
    {
      factor: "slope",
      go: { max_slope: 5 },
      caution: { max_slope: 5.1 },
      noGo: { max_slope: 10.1 },
    },
    {
      factor: "battery",
      go: { battery_left_percent: 30 },
      caution: { battery_left_percent: 29.9 },
      noGo: { battery_left_percent: 19.9 },
    },
    {
      factor: "reserve",
      go: { reserve_km: 20 },
      caution: { reserve_km: 19.9 },
      noGo: { reserve_km: 9.9 },
    },
    {
      factor: "range",
      go: { straight_km: 100 },
      caution: { straight_km: 100.1 },
      noGo: { straight_km: 200.1 },
    },
    { factor: "trip_length", go: { sols: 7 }, caution: { sols: 8 }, noGo: { sols: 15 } },
  ] as const)("checks $factor at each edge", ({ factor, go, caution, noGo }) => {
    expect(evaluateDrive(tripWith(go)).verdict).toBe("GO");
    expect(evaluateDrive(tripWith(caution))).toMatchObject({
      verdict: "CAUTION",
      limiting_factor: factor,
    });
    expect(evaluateDrive(tripWith(noGo))).toMatchObject({
      verdict: "NO_GO",
      limiting_factor: factor,
    });
  });

  it("explains each limit and where it comes from", () => {
    expect(evaluateDrive(tripWith({ sols: 18 })).reasons).toEqual([
      "The trip needs 18 sols, more than the 14-sol limit (Mars crewed study limit, assumed for this rover).",
    ]);
    expect(evaluateDrive(tripWith({ max_slope: 7.34 })).reasons).toEqual([
      "Steepest slope is 7.3° on coarse terrain, above 5° (our assumption).",
    ]);
    expect(evaluateDrive(tripWith({ straight_km: 194.4 })).reasons).toEqual([
      "The site is 194 km from base in a straight line, beyond the 100 km zone NASA plans for two rovers (Mars crewed study limit, assumed for this rover).",
    ]);
    expect(evaluateDrive(tripWith({ straight_km: 424 })).reasons).toEqual([
      "The site is 424 km from base in a straight line, beyond the 200 km that any NASA plan reaches with two rovers (our assumption).",
    ]);
  });

  it("puts the worst rule first", () => {
    const result = evaluateDrive(tripWith({ straight_km: 150, sols: 18 }));
    expect(result.limiting_factor).toBe("trip_length");
    expect(result.reasons).toHaveLength(2);
  });
});
