import * as zod from "zod";

import type { FocusTarget, LaraAction } from "../../components/copilot/lara-bridge";
import {
  MAX_DESTINATIONS,
  powerSourceSchema,
  ROUTE_CHECK_SENTENCE,
  routeChoiceSchema,
  type LaraContext,
} from "../../lib/copilot/lara-context";

/** More actions in one answer than this are refused, so a looping model cannot flood the app. */
const MAX_ACTIONS = 6;

const FOCUS_TARGETS = [
  "base",
  "destination",
  "route",
  "staging",
  "walk",
  "rover",
] as const satisfies readonly FocusTarget[];

const noArgs = zod.object({}).strict();

const argSchemas = {
  show_destinations: noArgs,
  select_destination: zod
    .object({ number: zod.number().int().min(1).max(MAX_DESTINATIONS) })
    .strict(),
  choose_route: zod.object({ route: routeChoiceSchema }).strict(),
  set_power: zod.object({ power: powerSourceSchema }).strict(),
  focus_map: zod.object({ target: zod.enum(FOCUS_TARGETS) }).strict(),
  start_simulation: noArgs,
  pause_simulation: noArgs,
  reset_simulation: noArgs,
};

export type UiActionTool = keyof typeof argSchemas;

const noArgsJson = { type: "object", properties: {}, required: [], additionalProperties: false };

/** OpenAI-compatible function definitions. The model names these actions; the browser carries them out. */
export const UI_ACTION_DEFINITIONS = [
  {
    name: "show_destinations",
    description:
      "Sets the mission to drive and walk, opens the Where step, and fits the map to the base and every destination.",
    parameters: noArgsJson,
  },
  {
    name: "select_destination",
    description:
      "Selects a destination by its number in get_route_plan (1 is nearest to the base). Opens the Check step, which starts route calculation and safety analysis.",
    parameters: {
      type: "object",
      properties: { number: { type: "integer", minimum: 1, maximum: MAX_DESTINATIONS } },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "choose_route",
    description:
      "Chooses the route that the expedition follows: the safest route or the shortest route.",
    parameters: {
      type: "object",
      properties: { route: { type: "string", enum: routeChoiceSchema.options } },
      required: ["route"],
      additionalProperties: false,
    },
  },
  {
    name: "set_power",
    description:
      "Sets the rover's power source for the drive: solar or fission. The app plans the route again with it.",
    parameters: {
      type: "object",
      properties: { power: { type: "string", enum: powerSourceSchema.options } },
      required: ["power"],
      additionalProperties: false,
    },
  },
  {
    name: "focus_map",
    description:
      "Moves the map to show one thing: the base, the destination, the full route, the staging point where the rover parks, the walk, or the crew during the expedition (the map then follows the crew).",
    parameters: {
      type: "object",
      properties: { target: { type: "string", enum: [...FOCUS_TARGETS] } },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "start_simulation",
    description: "Starts or resumes the simulated expedition playback on the chosen route.",
    parameters: noArgsJson,
  },
  {
    name: "pause_simulation",
    description: "Pauses the simulated expedition playback.",
    parameters: noArgsJson,
  },
  {
    name: "reset_simulation",
    description: "Stops the simulated expedition playback and returns it to the start.",
    parameters: noArgsJson,
  },
].map((tool) => ({ type: "function" as const, function: { ...tool, strict: true } }));

export const UI_ACTION_NAMES = UI_ACTION_DEFINITIONS.map(
  (tool) => tool.function.name,
) as UiActionTool[];

/** What the model reads back after it names an action. */
export interface ActionReceipt {
  done: boolean;
  note: string;
  destination?: { number: number; title: string; straight_line_km: number };
}

/**
 * Records the UI actions the model names, for the browser to run after the answer. Nothing runs on
 * the server. A destination number is checked against the route plan the browser sent.
 */
export function uiActionRecorder(context: LaraContext) {
  const actions: LaraAction[] = [];

  const record = (name: UiActionTool, rawArgs: unknown): ActionReceipt => {
    if (actions.length >= MAX_ACTIONS)
      return { done: false, note: `Only ${MAX_ACTIONS} actions are allowed in one answer.` };
    const action = toAction(name, rawArgs);
    if (action.type === "select_destination") return recordDestination(action);
    if (action.type === "start_simulation") {
      const missing = missingForTrip(context);
      if (missing) return { done: false, note: missing };
    }
    actions.push(action);
    return { done: true, note: "The app carries out this action after your reply." };
  };

  const recordDestination = (
    action: Extract<LaraAction, { type: "select_destination" }>,
  ): ActionReceipt => {
    const plan = context.route_plan.status === "present" ? context.route_plan.value : null;
    const destination = plan?.destinations.find((site) => site.number === action.number);
    if (plan && !destination)
      return {
        done: false,
        note: `There is no destination ${action.number}. The plan has ${plan.destinations.length} destinations, numbered from 1.`,
      };
    actions.push(action);
    const note = `The app selects the destination and says "${ROUTE_CHECK_SENTENCE}" Your reply only names the destination. The new route plan is not ready during this reply.`;
    return {
      done: true,
      note,
      ...(destination && {
        destination: {
          number: destination.number,
          title: destination.title,
          straight_line_km: destination.straight_line_km,
        },
      }),
    };
  };

  return { record, actions };
}

/**
 * Why the expedition cannot start yet, from the route plan the browser sent; null when it can, or
 * when no plan was sent. A plan still being calculated can start: the app waits for it.
 */
function missingForTrip(context: LaraContext): string | null {
  if (context.route_plan.status !== "present") return null;
  const plan = context.route_plan.value;
  const notStarted = "The simulation does not start.";
  if (!plan.mission) return `${notStarted} Ask the crew to choose a mission type.`;
  if (plan.destination_number === null && plan.status === "no_destination")
    return `${notStarted} Ask the crew to choose a destination.`;
  if (plan.status === "ok" || plan.status === "planning") return null;
  return `${notStarted} The route plan has status "${plan.status}". Tell the crew that the trip cannot be planned with these choices.`;
}

function toAction(name: UiActionTool, rawArgs: unknown): LaraAction {
  switch (name) {
    case "select_destination":
      return { type: name, ...argSchemas.select_destination.parse(rawArgs) };
    case "choose_route":
      return { type: name, ...argSchemas.choose_route.parse(rawArgs) };
    case "set_power":
      return { type: name, ...argSchemas.set_power.parse(rawArgs) };
    case "focus_map":
      return { type: name, ...argSchemas.focus_map.parse(rawArgs) };
    case "show_destinations":
    case "start_simulation":
    case "pause_simulation":
    case "reset_simulation":
      argSchemas[name].parse(rawArgs);
      return { type: name };
  }
}
