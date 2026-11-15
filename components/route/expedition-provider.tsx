"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useLaraAction, useLaraContextReader } from "@/components/copilot/lara-bridge";
import {
  buildTimeline,
  expeditionLegs,
  advancePlayback,
  stateAt,
  type ExpeditionState,
  type ExpeditionTimeline,
} from "@/lib/mars/expedition";
import type { LngLat } from "@/lib/mars/types";

import { followedRoute, simulationSummary, type FollowedRoute, type Playback } from "./expedition";
import { useRoutePlan } from "./route-plan-provider";

/** Playback speeds, as multiples of 1×, which plays the trip in about 75 s. */
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

// A frame after a stall (a background tab) advances at most this far, so the rover never jumps.
const MAX_FRAME_SECONDS = 1;

export interface Expedition {
  followed: FollowedRoute;
  /** Null when there is no trip to play. */
  timeline: ExpeditionTimeline | null;
  state: ExpeditionState | null;
  playback: Playback;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  /** Plays from where it is, or from the start once the trip is over; waits for a trip being planned. */
  play: () => void;
  pause: () => void;
  reset: () => void;
  /** Where the rover, or the crew on foot, is now; null when there is no trip. Reads the latest frame. */
  roverPosition: () => LngLat | null;
}

/** The clock of one timeline. A clock kept for another timeline counts as reset. */
interface Clock {
  timeline: ExpeditionTimeline | null;
  elapsedMin: number;
  playing: boolean;
}

const ExpeditionContext = createContext<Expedition | null>(null);

/**
 * Plays the planned drive + walk back as a SIMULATED expedition, on a requestAnimationFrame clock.
 * It follows the route the operator chose and starts over whenever the plan changes. Mount it
 * inside RoutePlanProvider; it registers LARA's start, pause and reset actions and the
 * "simulation" context.
 */
export function ExpeditionProvider({ children }: { children: ReactNode }) {
  const { inputs, dispatch, journey } = useRoutePlan();
  const followed = followedRoute(journey, inputs.route);
  const timeline = useTimeline(followed.plan, journey.driveGrid);
  const [stored, setClock] = useState<Clock>({ timeline: null, elapsedMin: 0, playing: false });
  const [speed, setSpeed] = useState<Speed>(1);
  const clock = clockFor(stored, timeline);
  const state = timeline ? stateAt(timeline, clock.elapsedMin) : null;
  const playback = playbackOf(clock, timeline);

  useAnimationClock(timeline, clock.playing, speed, setClock);

  const play = useCallback(
    () =>
      setClock((previous) => {
        const current = clockFor(previous, timeline);
        const isOver = timeline !== null && current.elapsedMin >= timeline.totalMin;
        return { ...current, elapsedMin: isOver ? 0 : current.elapsedMin, playing: true };
      }),
    [timeline],
  );
  const pause = useCallback(
    () => setClock((previous) => ({ ...clockFor(previous, timeline), playing: false })),
    [timeline],
  );
  const reset = useCallback(
    () => setClock({ timeline, elapsedMin: 0, playing: false }),
    [timeline],
  );
  const position = useRef<LngLat | null>(null);
  position.current = state?.position ?? null;
  const roverPosition = useCallback(() => position.current, []);

  useLaraAction("start_simulation", () => {
    dispatch({ type: "goTo", step: "go" });
    play();
  });
  useLaraAction("pause_simulation", pause);
  useLaraAction("reset_simulation", reset);
  useLaraContextReader("simulation", () =>
    timeline && state ? simulationSummary(timeline, state, playback, followed) : null,
  );

  const value: Expedition = {
    followed,
    timeline,
    state,
    playback,
    speed,
    setSpeed,
    play,
    pause,
    reset,
    roverPosition,
  };
  return <ExpeditionContext value={value}>{children}</ExpeditionContext>;
}

export function useExpedition(): Expedition {
  const expedition = useContext(ExpeditionContext);
  if (!expedition) throw new Error("useExpedition needs an ExpeditionProvider above it.");
  return expedition;
}

function useTimeline(
  plan: FollowedRoute["plan"],
  driveGrid: Parameters<typeof expeditionLegs>[1] | null,
): ExpeditionTimeline | null {
  return useMemo(() => {
    const power = plan?.drive?.summary?.power;
    const legs = plan && driveGrid && power ? expeditionLegs(plan, driveGrid) : null;
    return legs && power ? buildTimeline(legs, power) : null;
  }, [plan, driveGrid]);
}

/**
 * The stored clock if it belongs to this timeline; otherwise a reset one. A play pressed while
 * no trip was planned carries over to the trip once it arrives.
 */
function clockFor(clock: Clock, timeline: ExpeditionTimeline | null): Clock {
  if (clock.timeline === timeline) return clock;
  return { timeline, elapsedMin: 0, playing: clock.timeline === null && clock.playing };
}

function playbackOf(clock: Clock, timeline: ExpeditionTimeline | null): Playback {
  if (timeline && clock.elapsedMin >= timeline.totalMin) return "done";
  if (clock.playing && timeline) return "playing";
  return clock.elapsedMin > 0 ? "paused" : "idle";
}

/** Advances the clock every animation frame while playing, and stops it at the end of the trip. */
function useAnimationClock(
  timeline: ExpeditionTimeline | null,
  playing: boolean,
  speed: Speed,
  setClock: (update: (previous: Clock) => Clock) => void,
) {
  useEffect(() => {
    if (!timeline || !playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const seconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;
      setClock((previous) => {
        const current = clockFor(previous, timeline);
        if (!current.playing) return current;
        const elapsedMin = advancePlayback(timeline, current.elapsedMin, seconds * speed);
        return { ...current, elapsedMin, playing: elapsedMin < timeline.totalMin };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timeline, playing, speed, setClock]);
}
