import { describe, expect, it, vi } from "vitest";

import { readLaraContext, type RoutePlanContext } from "../../lib/copilot/lara-context";
import preset from "../../lib/mission/demo-preset.json";
import { evaluateMission } from "../../lib/mission/engine";
import type { MoxieSample, ScenarioEvent } from "../../lib/mission/types";
import { parseConfig } from "../../lib/mission/validation";
import { contextTools } from "./context-tools";
import { demoMissionConfig } from "./demo-mission";
import { activeConditions, copilotTools, resourceSummary } from "./tools";

const currentSnapshot = vi.hoisted(() => vi.fn());
vi.mock("../mission/service", () => ({ snapshot: currentSnapshot }));

const config = parseConfig(demoMissionConfig(preset));
const samples: MoxieSample[] = Array.from({ length: Math.ceil(config.duration_s) }, (_, i) => ({
  source_row: config.source_start_row + i,
  segment_id: 0,
  elapsed_ms: i * 1000,
  sclk_ms: null,
  utc_ms: null,
  oxygen_rate_g_h: 5,
  total_power_w: 200,
}));

describe("get_status resources after a suit battery cell loss", () => {
  // The Run step's fault: usable capacity drops to 45 % of what is left, applied "now".
  const atS = 1200;
  const before = evaluateMission(config, samples, [], atS);
  const cut = Math.round(before.battery.eva.capacity_wh * 0.45);
  const events: ScenarioEvent[] = [
    { id: "cells", at_s: atS, type: "battery_failure", target: "eva", value: cut },
  ];

  it("reports the reduced capacity and the remaining charge at the moment of the question", () => {
    for (const t of [atS, atS + 60]) {
      const state = evaluateMission(config, samples, events, t);
      const suit = resourceSummary({ config, state }).battery.suit;
      expect(suit.capacity).toBe(cut);
      expect(suit.nominal_capacity).toBe(config.battery.eva.capacity_wh);
      expect(suit.capacity_reduced_by_failure).toBe(true);
      expect(suit.remaining).toBeLessThanOrEqual(cut);
      expect(suit.margin_above_reserve).toBeCloseTo(
        state.battery.eva.remaining_wh - config.battery.eva.reserve_wh,
        0,
      );
      expect(activeConditions({ config, state })).toContain(
        `suit battery cell loss: usable capacity ${cut} of ${config.battery.eva.capacity_wh} Wh`,
      );
    }
  });

  it("reports no fault and no nominal capacity before the cell loss", () => {
    const suit = resourceSummary({ config, state: before }).battery.suit;
    expect(suit.capacity).toBe(config.battery.eva.capacity_wh);
    expect(suit).not.toHaveProperty("nominal_capacity");
    expect(activeConditions({ config, state: before })).toEqual([]);
  });
});

describe("actual mission get_status tool", () => {
  it("binds each question to current engine state, not prior resources or future event descriptions", async () => {
    const atS = 1200;
    const events: ScenarioEvent[] = [
      { id: "cells", at_s: atS, type: "battery_failure", target: "eva", value: 405 },
      { id: "leak", at_s: atS, type: "oxygen_leak", target: "eva", value: 30 },
      { id: "future", at_s: atS + 300, type: "generator_failure" },
    ];
    const db = {} as Parameters<typeof copilotTools>[0];
    const session = { events_json: JSON.stringify(events) } as Parameters<typeof copilotTools>[1];
    const askStatus = async (time: number) => {
      currentSnapshot.mockResolvedValueOnce({
        revision: time < atS ? 1 : 2,
        config,
        clock: { mode: "paused", speed: 1 },
        state: evaluateMission(config, samples, events, time),
        observed: { moxie: null, environment: { status: "unavailable", series: [] } },
        limitations: ["Resources are simulated"],
      });
      const tools = await copilotTools(db, session, undefined);
      return tools.run("get_status", {});
    };
    expect(await askStatus(atS - 1)).toMatchObject({
      active_faults: [],
      resources_simulated: { battery: { suit: { capacity: config.battery.eva.capacity_wh } } },
    });
    const after = await askStatus(atS);
    expect(after).toMatchObject({
      evaluated: expect.stringContaining("Values from earlier answers are out of date"),
      active_faults: [
        `suit battery cell loss: usable capacity 405 of ${config.battery.eva.capacity_wh} Wh`,
        "suit oxygen leak: 30 g/h",
      ],
      resources_simulated: {
        battery: {
          suit: {
            capacity: 405,
            nominal_capacity: config.battery.eva.capacity_wh,
            capacity_reduced_by_failure: true,
          },
        },
      },
      generator: { available: true },
    });
    // A rewind/reset must not retain faults from the previous answer.
    expect(await askStatus(0)).toMatchObject({ active_faults: [] });
    expect(currentSnapshot).toHaveBeenCalledTimes(3);
  });
});

describe("get_route_plan destinations", () => {
  it("states the kind of each site", () => {
    const plan: RoutePlanContext = {
      mission: "drive-walk",
      step: "where",
      route_choice: null,
      power: "fission",
      shortest_on_map: false,
      destinations: [
        {
          number: 3,
          title: "Terraced Bullseye-Like Crater in Arcadia Planitia",
          confirmed: true,
          straight_line_km: 424,
        },
        { number: 4, title: "Ridges in Arcadia Planitia", confirmed: false, straight_line_km: 468 },
      ],
      destination_number: null,
      status: "no_destination",
      routes: { safest: null, shortest: null },
      staging_point: null,
      not_checked: "",
      assumptions: [],
    };
    const output = contextTools(readLaraContext({ route_plan: plan }))("get_route_plan", {}) as {
      destinations: Array<{ number: number; kind: string }>;
    };
    expect(output.destinations.map((site) => [site.number, site.kind])).toEqual([
      [3, "crater"],
      [4, "ridges"],
    ]);
  });
});
