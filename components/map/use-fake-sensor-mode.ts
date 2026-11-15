import { useEffect, useReducer } from "react";
import {
  FAKE_LAST_FRAME,
  FAKE_SAMPLE_SECONDS,
  INITIAL_FAKE_VISIBILITY,
  type FakeLayer,
  type FakeVisibility,
} from "@/lib/mars/fake-sensors";

export type FakeSensorState =
  | { enabled: false }
  | {
      enabled: true;
      frame: number;
      elapsedSeconds: number;
      playing: boolean;
      speed: number;
      visible: FakeVisibility;
      selected: string | null;
    };
export type FakeSensorAction =
  | { type: "enable"; enabled: boolean }
  | { type: "frame"; frame: number }
  | { type: "layer"; layer: FakeLayer; visible: boolean }
  | { type: "play"; playing: boolean }
  | { type: "speed"; speed: number }
  | { type: "select"; id: string | null }
  | { type: "tick" };

export function fakeSensorReducer(
  state: FakeSensorState,
  action: FakeSensorAction,
): FakeSensorState {
  if (action.type === "enable") {
    if (action.enabled === state.enabled) return state;
    return action.enabled
      ? {
          enabled: true,
          frame: 0,
          elapsedSeconds: 0,
          playing: false,
          speed: 3600,
          visible: { ...INITIAL_FAKE_VISIBILITY },
          selected: null,
        }
      : { enabled: false };
  }
  if (!state.enabled) return state;
  switch (action.type) {
    case "frame":
      return {
        ...state,
        frame: Math.max(0, Math.min(FAKE_LAST_FRAME, Math.round(action.frame))),
        elapsedSeconds:
          Math.max(0, Math.min(FAKE_LAST_FRAME, Math.round(action.frame))) * FAKE_SAMPLE_SECONDS,
        playing: false,
      };
    case "layer":
      return { ...state, visible: { ...state.visible, [action.layer]: action.visible } };
    case "play":
      return {
        ...state,
        playing: action.playing,
        frame: action.playing && state.frame === FAKE_LAST_FRAME ? 0 : state.frame,
        elapsedSeconds:
          action.playing && state.frame === FAKE_LAST_FRAME ? 0 : state.elapsedSeconds,
      };
    case "speed":
      return [60, 3600, 21600].includes(action.speed) ? { ...state, speed: action.speed } : state;
    case "select":
      return { ...state, selected: action.id };
    case "tick": {
      if (!state.playing) return state;
      const elapsedSeconds = state.elapsedSeconds + state.speed / 5;
      const frame = Math.min(FAKE_LAST_FRAME, Math.floor(elapsedSeconds / FAKE_SAMPLE_SECONDS));
      return { ...state, elapsedSeconds, frame, playing: frame < FAKE_LAST_FRAME };
    }
  }
}

export function useFakeSensorMode() {
  const [state, dispatch] = useReducer(fakeSensorReducer, { enabled: false });
  const playing = state.enabled && state.playing;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), 200);
    const pause = () => {
      if (document.hidden) dispatch({ type: "play", playing: false });
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [playing]);
  return { state, dispatch };
}

export type FakeSensorMode = ReturnType<typeof useFakeSensorMode>;
