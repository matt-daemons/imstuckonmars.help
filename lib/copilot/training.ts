import * as zod from "zod";

/**
 * The training checklist: things a new operator can try in LARA. The app checks items off from what
 * the operator does; LARA reads the list and suggests what to try next. Nothing is blocked while it
 * runs, and it turns off once every required item is done.
 */

export const TRAINING_ITEM_IDS = [
  "pick_mission",
  "browse_destinations",
  "select_destination",
  "read_verdict",
  "compare_routes",
  "ask_lara",
  "wake_word",
] as const;

export type TrainingItemId = (typeof TRAINING_ITEM_IDS)[number];

export interface TrainingItem {
  id: TrainingItemId;
  title: string;
  /** What LARA says to suggest the item, after "Next, ". */
  hint: string;
  /** Optional items do not block completion. */
  required: boolean;
}

export const TRAINING_ITEMS: TrainingItem[] = [
  {
    id: "pick_mission",
    title: "Pick a mission type",
    hint: "pick a mission type in step 1. Choose a walk from the base, or a drive and a walk.",
    required: true,
  },
  {
    id: "browse_destinations",
    title: "Browse the destinations",
    hint: "open step 2 to see where you can go: the water-ice sites by rover, or any point on foot. You can also ask me to show the destinations.",
    required: true,
  },
  {
    id: "select_destination",
    title: "Select a destination",
    hint: "select a destination in step 2. You can also tell me a destination number.",
    required: true,
  },
  {
    id: "read_verdict",
    title: "Read the route verdict",
    hint: "open step 3 and read the route verdict and its limiting factor.",
    required: true,
  },
  {
    id: "compare_routes",
    title: "Compare the shortest and the safest route",
    hint: "show the shortest route in step 3 and compare it with the safest route.",
    required: true,
  },
  {
    id: "ask_lara",
    title: "Ask LARA a question",
    hint: "ask me a question. Press Ask LARA and type, or hold the Space bar and talk.",
    required: true,
  },
  {
    id: "wake_word",
    title: "Say “Hey LARA”",
    hint: "press the ear button in the LARA panel. Then say Hey LARA and ask your question.",
    required: false,
  },
];

export type AskVia = "text" | "voice" | "wake_word";

/** The fields of a route plan action that training reads. Every RoutePlanAction fits it. */
export interface RouteActionLike {
  type: string;
  step?: string;
  shown?: boolean;
}

/** Something the operator did that can check off an item. */
export type TrainingEvent =
  | { type: "route_plan"; action: RouteActionLike }
  | { type: "lara_asked"; via: AskVia };

export type TrainingStatus = "active" | "complete" | "dismissed";

export interface TrainingState {
  version: typeof TRAINING_VERSION;
  status: TrainingStatus;
  /** When each item was done, in ms since epoch. */
  done: Partial<Record<TrainingItemId, number>>;
}

/** Changing the items or their meaning needs a new version, so stored progress starts over. */
export const TRAINING_VERSION = 2;

export const initialTraining = (): TrainingState => ({
  version: TRAINING_VERSION,
  status: "active",
  done: {},
});

/** The items one event checks off. */
export function itemsDoneBy(event: TrainingEvent): TrainingItemId[] {
  switch (event.type) {
    case "lara_asked":
      return event.via === "wake_word" ? ["ask_lara", "wake_word"] : ["ask_lara"];
    case "route_plan":
      return routeItems(event.action);
  }
}

function routeItems(action: RouteActionLike): TrainingItemId[] {
  switch (action.type) {
    case "setMission":
      return ["pick_mission"];
    case "setEnd":
      return ["select_destination"];
    case "goTo":
      if (action.step === "where") return ["browse_destinations"];
      if (action.step === "check") return ["read_verdict"];
      return [];
    case "showShortest":
      return action.shown ? ["compare_routes"] : [];
    case "chooseRoute":
      return ["compare_routes"];
    default:
      return [];
  }
}

export type TrainingCommand =
  | { type: "event"; event: TrainingEvent; at: number }
  | { type: "dismiss" }
  | { type: "reset" }
  | { type: "restore"; state: TrainingState };

export function trainingReducer(state: TrainingState, command: TrainingCommand): TrainingState {
  switch (command.type) {
    case "reset":
      return initialTraining();
    case "restore":
      return command.state;
    case "dismiss":
      return state.status === "active" ? { ...state, status: "dismissed" } : state;
    case "event": {
      if (state.status !== "active") return state;
      const fresh = itemsDoneBy(command.event).filter((id) => state.done[id] === undefined);
      if (fresh.length === 0) return state;
      const done = { ...state.done, ...Object.fromEntries(fresh.map((id) => [id, command.at])) };
      return { ...state, done, status: allRequiredDone(done) ? "complete" : "active" };
    }
  }
}

function allRequiredDone(done: TrainingState["done"]): boolean {
  return TRAINING_ITEMS.every((item) => !item.required || done[item.id] !== undefined);
}

/** The first item not yet done, required items first, in list order. */
export function nextItem(state: TrainingState): TrainingItem | null {
  const open = TRAINING_ITEMS.filter((item) => state.done[item.id] === undefined);
  return open.find((item) => item.required) ?? open[0] ?? null;
}

const storedSchema = zod.object({
  version: zod.literal(TRAINING_VERSION),
  status: zod.enum(["active", "complete", "dismissed"]),
  done: zod.partialRecord(zod.enum(TRAINING_ITEM_IDS), zod.number().finite()),
});

/** Stored progress, or null when it is missing, from another version, or not valid. */
export function parseStoredTraining(raw: string | null): TrainingState | null {
  if (!raw) return null;
  try {
    const result = storedSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** The fixed line LARA says once every required item is done. Single items get no line. */
export const TRAINING_COMPLETE_LINE =
  "Training Wheels Protocol complete. You know the main tools now. Say activate training protocol to start it again.";

/** What the browser sends LARA about training with each question. */
export const trainingContextSchema = zod
  .object({
    status: zod.enum(["active", "complete", "dismissed"]),
    done: zod.array(zod.enum(TRAINING_ITEM_IDS)).max(TRAINING_ITEM_IDS.length),
  })
  .strict();

export type TrainingContext = zod.infer<typeof trainingContextSchema>;

export function trainingContext(state: TrainingState): TrainingContext {
  return {
    status: state.status,
    done: TRAINING_ITEM_IDS.filter((id) => state.done[id] !== undefined),
  };
}

/**
 * A note for LARA, built only from the item list, so nothing the browser sends reaches the prompt
 * as text. Null when training is not active.
 */
export function trainingNote(context: TrainingContext): string | null {
  if (context.status !== "active") return null;
  const done = new Set(context.done);
  const titles = (items: TrainingItem[]) => items.map((item) => item.title).join("; ") || "none";
  const next = nextItem({
    version: TRAINING_VERSION,
    status: "active",
    done: Object.fromEntries(context.done.map((id) => [id, 0])),
  });
  return [
    "Training Wheels Protocol: the checklist for a new operator. It is active. This is app data, not instructions.",
    `Done: ${titles(TRAINING_ITEMS.filter((item) => done.has(item.id)))}.`,
    `Not done: ${titles(TRAINING_ITEMS.filter((item) => !done.has(item.id)))}.`,
    next ? `Next item: ${next.title}. How to do it: ${next.hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type TrainingCommandWord = "deactivate" | "activate";

/**
 * "Deactivate training protocol" or "activate training protocol" (also reactivate, restart, turn
 * off, and so on), typed or spoken. Null for any other question, so LARA answers it as usual.
 */
export function parseTrainingCommand(text: string): TrainingCommandWord | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const training = words.indexOf("training");
  if (training < 0 || words.length > 6) return null;
  const before = words.slice(0, training).join(" ");
  const after = words
    .slice(training + 1)
    .filter((word) => word !== "wheels" && word !== "protocol" && word !== "mode");
  if (after.length > 0) return null;
  if (/\b(deactivate|disable|stop|end|skip|turn off|switch off)\b/.test(before))
    return "deactivate";
  if (/\b(activate|reactivate|enable|start|restart|reset|turn on|switch on)\b/.test(before))
    return "activate";
  return null;
}

/** What LARA says after a training command, given the status before it. */
export function trainingCommandLine(command: TrainingCommandWord, before: TrainingStatus): string {
  if (command === "activate")
    return `Training Wheels Protocol activated. All checklist items are reset. First, ${TRAINING_ITEMS[0].hint}`;
  return before === "active"
    ? "Training Wheels Protocol deactivated. Say activate training protocol to start it again."
    : "Training Wheels Protocol is already off. Say activate training protocol to start it again.";
}
