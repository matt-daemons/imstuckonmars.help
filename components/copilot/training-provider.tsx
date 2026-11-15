"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import {
  initialTraining,
  parseStoredTraining,
  trainingReducer,
  type TrainingEvent,
  type TrainingState,
} from "@/lib/copilot/training";

const STORAGE_KEY = "lara.training";
/** `?training=reset` starts the checklist over, for example before a demo run. */
const RESET_PARAM = "training";

interface Training {
  state: TrainingState;
  /** False until stored progress is read, so the card does not flash the wrong list. */
  loaded: boolean;
  emit: (event: TrainingEvent) => void;
  /** Turns training off, as "Skip training" or "deactivate training protocol" does. */
  dismiss: () => void;
  /** Turns training on again with every item reset. */
  restart: () => void;
}

const TrainingContext = createContext<Training | null>(null);

/** Holds the training checklist for this browser. It sits above everything that reports events. */
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(trainingReducer, undefined, initialTraining);
  const [loaded, setLoaded] = useState(false);

  // Storage is read after the first render, so the server and the browser render the same thing.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(RESET_PARAM) === "reset") {
      url.searchParams.delete(RESET_PARAM);
      window.history.replaceState(null, "", url);
      dispatch({ type: "reset" });
    } else {
      const stored = parseStoredTraining(readStorage());
      if (stored) dispatch({ type: "restore", state: stored });
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeStorage(JSON.stringify(state));
  }, [loaded, state]);

  const emit = useCallback(
    (event: TrainingEvent) => dispatch({ type: "event", event, at: Date.now() }),
    [],
  );
  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);
  const restart = useCallback(() => dispatch({ type: "reset" }), []);
  const value = useMemo(
    () => ({ state, loaded, emit, dismiss, restart }),
    [state, loaded, emit, dismiss, restart],
  );

  return <TrainingContext value={value}>{children}</TrainingContext>;
}

export function useTraining(): Training {
  const training = useContext(TrainingContext);
  if (!training) throw new Error("useTraining needs a TrainingProvider above it.");
  return training;
}

const ignore = () => {};

/** Reports an event to the checklist; does nothing on a page without one. */
export function useTrainingEmit(): (event: TrainingEvent) => void {
  return useContext(TrainingContext)?.emit ?? ignore;
}

/** The checklist, or null on a page without one. */
export function useOptionalTraining(): Training | null {
  return useContext(TrainingContext);
}

// Storage can be missing or blocked (private windows, previews); training then lasts one page load.
function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not stored: see readStorage.
  }
}
