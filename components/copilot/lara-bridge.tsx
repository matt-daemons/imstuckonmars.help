"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { RouteChoice } from "@/lib/mars/drive-walk";

/** What the map can be fitted to when LARA is asked to show something. */
export type FocusTarget = "base" | "destination" | "route" | "staging" | "walk" | "rover";

/** UI actions LARA can ask the app to carry out. The browser runs them; the model only names them. */
export type LaraAction =
  | { type: "show_destinations" }
  /** 1-based, in the order the Where step lists the destinations (nearest to the base first). */
  | { type: "select_destination"; number: number }
  | { type: "choose_route"; route: RouteChoice }
  | { type: "focus_map"; target: FocusTarget }
  | { type: "start_simulation" }
  | { type: "pause_simulation" }
  | { type: "reset_simulation" };

export type LaraActionType = LaraAction["type"];
type ActionOf<T extends LaraActionType> = Extract<LaraAction, { type: T }>;

/** Context keys read before each question and sent to the server with it. */
export type LaraContextKey = "route_plan" | "simulation";

/** The simulated expedition, as the "simulation" context reports it. Every value is simulated. */
export interface SimulationSummary {
  state: "idle" | "playing" | "paused" | "done";
  phase: "drive_out" | "walk_out" | "sampling" | "walk_back" | "drive_back" | "done";
  elapsed_min: number;
  total_min: number;
  distance_done_km: number;
  distance_total_km: number;
  rover_battery_wh: { remaining: number; reserve: number; capacity: number } | null;
  suit_oxygen_min: { remaining: number; reserve: number } | null;
  /** Plain-language caveats, for example that the values are simulated. */
  labels: string[];
}

export interface LaraBridge {
  /** Registers the handler for one action type; returns a function that removes it. */
  handle<T extends LaraActionType>(type: T, fn: (action: ActionOf<T>) => void): () => void;
  /** Registers a reader for one context key; returns a function that removes it. */
  provide(key: LaraContextKey, read: () => unknown): () => void;
  /** Runs the action; false when nothing handles it. */
  run(action: LaraAction): boolean;
  /** The current value of every registered context key. */
  context(): Partial<Record<LaraContextKey, unknown>>;
}

export function createLaraBridge(): LaraBridge {
  const handlers = new Map<LaraActionType, (action: LaraAction) => void>();
  const readers = new Map<LaraContextKey, () => unknown>();
  return {
    handle(type, fn) {
      const handler = fn as (action: LaraAction) => void;
      handlers.set(type, handler);
      return () => {
        if (handlers.get(type) === handler) handlers.delete(type);
      };
    },
    provide(key, read) {
      readers.set(key, read);
      return () => {
        if (readers.get(key) === read) readers.delete(key);
      };
    },
    run(action) {
      const handler = handlers.get(action.type);
      if (!handler) return false;
      handler(action);
      return true;
    },
    context() {
      return Object.fromEntries([...readers].map(([key, read]) => [key, read()]));
    },
  };
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
