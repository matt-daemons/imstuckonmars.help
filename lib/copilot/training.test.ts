import { describe, expect, it } from "vitest";

import type { RoutePlanAction } from "@/components/route/route-plan";

import {
  initialTraining,
  nextItem,
  parseStoredTraining,
  parseTrainingCommand,
  TRAINING_ITEMS,
  trainingCommandLine,
  trainingContext,
  trainingContextSchema,
  trainingNote,
  trainingReducer,
  type TrainingEvent,
  type TrainingState,
} from "./training";

const route = (action: RoutePlanAction): TrainingEvent => ({ type: "route_plan", action });
const apply = (state: TrainingState, ...events: TrainingEvent[]) =>
  events.reduce((s, event, i) => trainingReducer(s, { type: "event", event, at: 1000 + i }), state);

const ALL_REQUIRED: TrainingEvent[] = [
  route({ type: "setMission", mission: "drive-walk", start: [0, 0] }),
  route({ type: "goTo", step: "where" }),
  route({ type: "setEnd", point: [1, 1] }),
  route({ type: "goTo", step: "check" }),
  route({ type: "showShortest", shown: true }),
  { type: "lara_asked", via: "text" },
];

describe("training reducer", () => {
  it("checks off the item an event matches, with its time", () => {
    const state = apply(initialTraining(), route({ type: "goTo", step: "where" }));
    expect(state.done).toEqual({ browse_destinations: 1000 });
    expect(state.status).toBe("active");
  });

  it("keeps an item done when the operator moves on", () => {
    const state = apply(
      initialTraining(),
      route({ type: "goTo", step: "where" }),
      route({ type: "goTo", step: "mission" }),
      route({ type: "goTo", step: "where" }),
    );
    expect(state.done).toEqual({ browse_destinations: 1000 });
  });

  it("ignores route actions that are not on the list", () => {
    const before = initialTraining();
    const after = apply(
      before,
      route({ type: "setStart", point: [1, 1] }),
      route({ type: "showShortest", shown: false }),
      route({ type: "setSampling", minutes: 30 }),
    );
    expect(after).toBe(before);
  });

  it("counts choosing a route as comparing them", () => {
    const state = apply(initialTraining(), route({ type: "chooseRoute", route: "shortest" }));
    expect(state.done.compare_routes).toBeDefined();
  });

  it("checks off both ask items for a wake-word question", () => {
    const state = apply(initialTraining(), { type: "lara_asked", via: "wake_word" });
    expect(Object.keys(state.done).sort()).toEqual(["ask_lara", "wake_word"]);
  });

  it("completes once every required item is done, without the optional ones", () => {
    const almost = apply(initialTraining(), ...ALL_REQUIRED.slice(0, -1));
    expect(almost.status).toBe("active");
    const done = apply(almost, ALL_REQUIRED.at(-1)!);
    expect(done.status).toBe("complete");
    expect(done.done.wake_word).toBeUndefined();
  });

  it("stops counting after completion or dismissal", () => {
    const dismissed = trainingReducer(initialTraining(), { type: "dismiss" });
    expect(dismissed.status).toBe("dismissed");
    expect(apply(dismissed, { type: "lara_asked", via: "text" })).toBe(dismissed);
  });

  it("starts over on reset", () => {
    const state = apply(initialTraining(), ...ALL_REQUIRED);
    expect(trainingReducer(state, { type: "reset" })).toEqual(initialTraining());
  });
});

describe("next item", () => {
  it("suggests the first required item not done", () => {
    const state = apply(initialTraining(), route({ type: "goTo", step: "where" }));
    expect(nextItem(state)?.id).toBe("pick_mission");
  });

  it("suggests optional items once the required ones are done", () => {
    const state: TrainingState = {
      ...initialTraining(),
      done: Object.fromEntries(
        TRAINING_ITEMS.filter((item) => item.required).map((item) => [item.id, 1]),
      ),
    };
    expect(nextItem(state)?.id).toBe("wake_word");
  });
});

describe("stored progress", () => {
  it("reads back what it stored", () => {
    const state = apply(initialTraining(), ...ALL_REQUIRED.slice(0, 3));
    expect(parseStoredTraining(JSON.stringify(state))).toEqual(state);
  });

  it("drops other versions, unknown items, and broken JSON", () => {
    expect(parseStoredTraining(null)).toBeNull();
    expect(parseStoredTraining("{")).toBeNull();
    expect(parseStoredTraining(JSON.stringify({ ...initialTraining(), version: 0 }))).toBeNull();
    expect(
      parseStoredTraining(JSON.stringify({ ...initialTraining(), done: { fly_rover: 1 } })),
    ).toBeNull();
  });
});

describe("training note for LARA", () => {
  it("lists done and open items and the next one, from the item list only", () => {
    const state = apply(initialTraining(), ALL_REQUIRED[0]);
    const note = trainingNote(trainingContext(state))!;
    expect(note).toContain("Done: Pick a mission type.");
    expect(note).toContain("Next item: Browse the destinations.");
  });

  it("is absent unless training is active", () => {
    expect(trainingNote({ status: "complete", done: [] })).toBeNull();
    expect(trainingNote({ status: "dismissed", done: [] })).toBeNull();
  });

  it("rejects item ids that are not on the list", () => {
    expect(trainingContextSchema.safeParse({ status: "active", done: ["x"] }).success).toBe(false);
  });
});

describe("training voice command", () => {
  it.each([
    ["Deactivate training protocol.", "deactivate"],
    ["deactivate the training protocol", "deactivate"],
    ["Deactivate Training Wheels Protocol", "deactivate"],
    ["activate training wheels protocol", "activate"],
    ["Turn off training", "deactivate"],
    ["LARA, stop training mode", "deactivate"],
    ["Activate training protocol", "activate"],
    ["Reactivate training protocol!", "activate"],
    ["restart the training", "activate"],
    ["Turn on training protocol", "activate"],
  ])("reads %j as %s", (text, command) => {
    expect(parseTrainingCommand(text)).toBe(command);
  });

  it.each([
    "What is the training protocol?",
    "How do I stop training the crew on slopes and dust?",
    "Start the simulation",
    "training protocol",
    "Should I deactivate the training protocol now or later?",
  ])("leaves %j to LARA", (text) => {
    expect(parseTrainingCommand(text)).toBeNull();
  });

  it("says whether training was already off", () => {
    expect(trainingCommandLine("deactivate", "active")).toMatch(
      /^Training Wheels Protocol deactivated/,
    );
    expect(trainingCommandLine("deactivate", "dismissed")).toMatch(/already off/);
    expect(trainingCommandLine("activate", "complete")).toContain(TRAINING_ITEMS[0].hint);
  });
});
