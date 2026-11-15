import type { Database } from "../db";
import { command, sessionFor } from "../mission/service";
import type { ScenarioEvent } from "../../lib/mission/types";

/** The habitat in public/data/processed/stops.geojson. Keep the two in step. */
export const ARCADIA_HABITAT = { latitude_deg: 45.97, longitude_deg: -176.05 };

/** The RAD observation that covers the first 52 seconds is flagged, so it has no dose rate. */
export const DEMO_START_S = 60;

export interface DemoScenario {
  title: string;
  description: string;
  events: ScenarioEvent[];
}

/** Scripted demo scenarios. Their numbers come from the engine tests in demo-mission.test.ts. */
export const DEMO_SCENARIOS = {
  nominal: {
    title: "Nominal walk",
    description: "Out to the science stop and back with no failures.",
    events: [],
  },
  "suit-battery-failure": {
    title: "Suit battery module failure",
    description:
      "At the science stop, a suit battery module fails and capacity drops to 220 Wh. The suit crosses its 150 Wh reserve during the walk back.",
    events: [
      { id: "demo-suit-battery", at_s: 1800, type: "battery_failure", target: "eva", value: 220 },
    ],
  },
} satisfies Record<string, DemoScenario>;

export type DemoScenarioId = keyof typeof DEMO_SCENARIOS;
export const DEMO_SCENARIO_IDS = Object.keys(DEMO_SCENARIOS) as [
  DemoScenarioId,
  ...DemoScenarioId[],
];
export const DEFAULT_SCENARIO: DemoScenarioId = "suit-battery-failure";

/** The preset with its base moved to the Arcadia habitat. The base id stays the same. */
export function demoMissionConfig(preset: unknown): unknown {
  const config = structuredClone(preset) as { base?: Record<string, unknown> };
  return { ...config, base: { ...config.base, ...ARCADIA_HABITAT } };
}

/** Adds the scenario's events to a new mission, then moves its clock to the demo start. */
export async function prepareDemoMission(
  db: Database,
  mission: { id: string; token: string },
  scenario: DemoScenario,
) {
  const commands = [
    ...scenario.events.map((event) => ({ type: "event", event })),
    { type: "seek", at_s: DEMO_START_S },
  ];
  for (const body of commands) {
    const session = await sessionFor(db, mission.id, `Bearer ${mission.token}`);
    await command(db, session, {
      command_id: crypto.randomUUID(),
      expected_revision: session.revision,
      ...body,
    });
  }
}
