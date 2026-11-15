import { describe, expect, it } from "vitest";
import { activeAlerts, annunciating, reconcileAlerts, secondsToReserve, suitRates } from "./alerts";
import { evaluateMission } from "./engine";
import { buildExpeditionConfig } from "./expedition";
import { missionOutlook } from "./outlook";
import type { ScenarioEvent } from "./types";

const config = buildExpeditionConfig(
  {
    id: "alerts-test",
    mode: "walking",
    shelter_lnglat: [-176.05, 45.97],
    outbound: {
      path: [
        [-176.05, 45.97],
        [-176.04, 45.97],
      ],
      duration_s: 1800,
    },
    sampling_s: 3600,
    back: {
      path: [
        [-176.04, 45.97],
        [-176.05, 45.97],
      ],
      duration_s: 1800,
    },
  },
  "fixture",
  1,
);
const trace = [
  {
    source_row: 1,
    segment_id: 0,
    elapsed_ms: 0,
    sclk_ms: null,
    utc_ms: null,
    oxygen_rate_g_h: 0,
    total_power_w: 0,
  },
];
const leak: ScenarioEvent = {
  id: "leak",
  type: "oxygen_leak",
  target: "eva",
  value: 600,
  at_s: 1500,
};

describe("expedition alerts", () => {
  it("does not describe a discharge-power failure as an empty battery or reserve breach", () => {
    const state = evaluateMission(config, trace, [], 1500);
    state.battery.eva.unmet_wh = 1;
    state.reasons.push("eva_power_demand_unmet");
    const projected = missionOutlook(config, trace, [], 1500);
    const outlook = {
      mission_id: "fixture",
      revision: 1,
      ...projected,
      recommended: "continue" as const,
      options: projected.options.map((option) => ({
        ...option,
        status: "modeled_constraint_violation" as const,
        reasons: ["eva_power_demand_unmet"],
      })),
    };
    const alerts = activeAlerts({ config, state }, outlook);
    expect(alerts.find((alert) => alert.code === "eva_power_demand_unmet")).toMatchObject({
      name: "Suit power demand unmet",
      detail: expect.stringContaining("discharge-power limit"),
    });
    const returning = alerts.find((alert) => alert.code === "no_option_keeps_reserves");
    expect(returning?.name).toBe("No feasible return option");
    expect(returning?.detail).not.toContain("under a suit reserve");
  });

  it("warns before return reserves are lost, with a deterministic response", () => {
    const state = evaluateMission(config, trace, [leak], 1500);
    const outlook = {
      mission_id: "fixture",
      revision: 1,
      ...missionOutlook(config, trace, [leak], 1500),
    };
    const alerts = activeAlerts({ config, state }, outlook);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "return_reserve_at_risk",
          level: "error",
          response: expect.any(String),
        }),
        expect.objectContaining({ code: "eva_oxygen_leak", level: "warning" }),
      ]),
    );
    expect(state.oxygen.eva.remaining_g).toBeGreaterThan(config.oxygen.eva.reserve_g);
  });

  it("retains acknowledgments, but reannunciates a cleared fault that recurs", () => {
    const state = evaluateMission(config, trace, [leak], 1500);
    const initial = reconcileAlerts([], activeAlerts({ config, state }, null), 1500);
    const acknowledged = initial.map((a) => ({ ...a, acknowledged: true }));
    expect(
      reconcileAlerts(acknowledged, activeAlerts({ config, state }, null), 1600).some(annunciating),
    ).toBe(false);
    const cleared = reconcileAlerts(acknowledged, [], 1700);
    expect(cleared.every((a) => !a.active)).toBe(true);
    expect(
      reconcileAlerts(cleared, activeAlerts({ config, state }, null), 1800).some(annunciating),
    ).toBe(true);
  });

  it("keeps suppressed and inhibited alerts in the log without annunciation", () => {
    const state = evaluateMission(config, trace, [leak], 1500);
    const alerts = reconcileAlerts([], activeAlerts({ config, state }, null), 1500);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => annunciating({ ...a, suppressed: true }))).toBe(false);
    expect(alerts.some((a) => annunciating({ ...a, inhibited: true }))).toBe(false);
  });

  it("uses the engine's activity rates and does not drain suits at shelter", () => {
    const state = evaluateMission(config, trace, [leak], 1500);
    expect(suitRates({ config, state }).oxygen_g_h).toBe(720);
    const home = evaluateMission(config, trace, [leak], config.duration_s);
    expect(suitRates({ config, state: home })).toEqual({ oxygen_g_h: 0, energy_wh_h: 0 });
    expect(secondsToReserve(120, 60, 120)).toBe(1800);
    expect(secondsToReserve(60, 60, 120)).toBeNull();
  });
});
