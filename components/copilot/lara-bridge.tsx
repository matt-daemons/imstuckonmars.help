"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { RouteChoice } from "@/lib/mars/drive-walk";
import type { PowerSource } from "@/lib/mars/driving";

/** What the map can be fitted to when LARA is asked to show something. */
export type FocusTarget = "base" | "destination" | "route" | "staging" | "walk" | "rover";

/** UI actions LARA can ask the app to carry out. The browser runs them; the model only names them. */
export type LaraAction =
  | { type: "show_destinations" }
  /** 1-based, in the order the Where step lists the destinations (nearest to the base first). */
  | { type: "select_destination"; number: number }
  | { type: "choose_route"; route: RouteChoice }
  | { type: "set_power"; power: PowerSource }
  | { type: "focus_map"; target: FocusTarget }
  | { type: "start_simulation" }
  | { type: "pause_simulation" }
  | { type: "reset_simulation" };

export type LaraActionType = LaraAction["type"];
type ActionOf<T extends LaraActionType> = Extract<LaraAction, { type: T }>;

/** Context keys read before each question and sent to the server with it. */
export type LaraContextKey = "route_plan" | "training";

export interface LaraBridge {
  /**
   * Registers a handler for one action type; returns a function that removes it. One type can have
   * several handlers, for example focus_map for the route and for the rover: each runs, and each
   * ignores what is not its own.
   */
  handle<T extends LaraActionType>(type: T, fn: (action: ActionOf<T>) => void): () => void;
  /** Registers a reader for one context key; returns a function that removes it. */
  provide(key: LaraContextKey, read: () => unknown): () => void;
  /** Runs the action; false when nothing handles it. */
  run(action: LaraAction): boolean;
  /** The current value of every registered context key; a key whose reader throws is left out. */
  context(): Partial<Record<LaraContextKey, unknown>>;
  /** Registers how LARA says a line aloud; returns a function that removes it. */
  speaker(fn: (text: string) => void): () => void;
  /** Says a fixed line in LARA's voice, without the model; false when no speaker is registered. */
  say(text: string): boolean;
}

export function createLaraBridge(): LaraBridge {
  const handlers = new Map<LaraActionType, Set<(action: LaraAction) => void>>();
  const readers = new Map<LaraContextKey, () => unknown>();
  let speak: ((text: string) => void) | null = null;
  return {
    handle(type, fn) {
      const handler = fn as (action: LaraAction) => void;
      const forType = handlers.get(type) ?? new Set();
      handlers.set(type, forType.add(handler));
      return () => {
        forType.delete(handler);
      };
    },
    provide(key, read) {
      readers.set(key, read);
      return () => {
        if (readers.get(key) === read) readers.delete(key);
      };
    },
    run(action) {
      const forType = [...(handlers.get(action.type) ?? [])];
      for (const handler of forType) handler(action);
      return forType.length > 0;
    },
    context() {
      return Object.fromEntries([...readers].flatMap(([key, read]) => readSafely(key, read)));
    },
    speaker(fn) {
      speak = fn;
      return () => {
        if (speak === fn) speak = null;
      };
    },
    say(text) {
      if (!speak) return false;
      speak(text);
      return true;
    },
  };
}

function readSafely(key: LaraContextKey, read: () => unknown): [LaraContextKey, unknown][] {
  try {
    return [[key, read()]];
  } catch {
    return [];
  }
}

const BridgeContext = createContext<LaraBridge | null>(null);

/**
 * One bridge for the page. LARA's session sits above the map, and the route plan and simulation sit
 * inside it, so they register handlers and context readers here instead of sharing React state.
 */
export function LaraBridgeProvider({ children }: { children: ReactNode }) {
  const [bridge] = useState(createLaraBridge);
  return <BridgeContext value={bridge}>{children}</BridgeContext>;
}

export function useLaraBridge(): LaraBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("useLaraBridge needs a LaraBridgeProvider above it.");
  return bridge;
}

/** Handles one action type with the latest `fn`, for as long as the caller is mounted. */
export function useLaraAction<T extends LaraActionType>(
  type: T,
  fn: (action: ActionOf<T>) => void,
) {
  const bridge = useLaraBridge();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => bridge.handle(type, (action) => latest.current(action)), [bridge, type]);
}

/** Reports one context key with the latest `read`, for as long as the caller is mounted. */
export function useLaraContextReader(key: LaraContextKey, read: () => unknown) {
  const bridge = useLaraBridge();
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => bridge.provide(key, () => latest.current()), [bridge, key]);
}
