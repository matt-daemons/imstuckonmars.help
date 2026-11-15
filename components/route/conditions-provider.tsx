"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useLaraContext, type Lara } from "@/components/copilot/lara-context";
import { POLL_MS } from "@/components/copilot/use-lara";
import type { SpaceWeatherReport } from "@/lib/flight-rules/donki";
import { PERSEVERANCE_LANDING_UTC } from "@/lib/inference/local-time";
import { readMarsClock } from "@/lib/mars-time/mars-clock";
import type { LngLat } from "@/lib/mars/types";

import {
  mergeConditions,
  minutesUntilSunsetAt,
  NO_DRILL,
  realConditions,
  type Conditions,
  type Drill,
  type SpaceWeatherFeed,
} from "./conditions";

// LARA counts as not answering once three polls in a row have missed.
const STALE_AFTER_MS = 3 * POLL_MS;
const MINUTE_MS = 60_000;
// The server keeps DONKI's answer for 15 minutes, so asking more often would show nothing new.
const SPACE_WEATHER_POLL_MS = 15 * MINUTE_MS;

interface ConditionsContextValue {
  /** The real values, with any drill value in their place. */
  conditions: Conditions;
  drill: Drill;
  setDrill: (drill: Drill) => void;
  /** For the dust playback: the habitat's dust opacity while the simulation is shown, else null. */
  setSimulatedDust: (opacity: number | null) => void;
  /** True once LARA's last successful poll is too old to trust. */
  laraNotAnswering: boolean;
  /** NASA DONKI's last space-weather report, or where fetching it stands. */
  spaceWeather: SpaceWeatherFeed;
}

const ConditionsContext = createContext<ConditionsContextValue | null>(null);

/** Gathers the storm conditions at the habitat and the storm drill, for the strip and step 03. */
export function ConditionsProvider({
  habitat,
  children,
}: {
  habitat: LngLat;
  children: ReactNode;
}) {
  const lara = useLaraContext();
  const [drill, setDrill] = useState<Drill>(NO_DRILL);
  const [simulatedDust, setSimulatedDust] = useState<number | null>(null);
  const spaceWeather = useSpaceWeather();
  const now = useNow(POLL_MS);
  const laraNotAnswering = lara.polledAt !== null && now - lara.polledAt > STALE_AFTER_MS;
  const doseRate = laraDoseRate(lara, laraNotAnswering);
  // The Mars clock is read once a minute: sunset comes no closer than that in between.
  const minute = Math.floor(now / MINUTE_MS);
  const [longitude, latitude] = habitat;

  const value = useMemo(() => {
    // Only the local time and sunset are read, so the landing date, which sets the sol, does not matter.
    const clock = readMarsClock(
      new Date(minute * MINUTE_MS),
      { longitude_east_degrees: longitude, latitude_north_degrees: latitude },
      PERSEVERANCE_LANDING_UTC,
    );
    const real = realConditions({ clock, doseRate, simulatedDust, spaceWeather });
    const conditions = mergeConditions(real, drill, (hour) => minutesUntilSunsetAt(hour, clock));
    return { conditions, drill, setDrill, setSimulatedDust, laraNotAnswering, spaceWeather };
  }, [minute, longitude, latitude, doseRate, simulatedDust, spaceWeather, drill, laraNotAnswering]);

  return <ConditionsContext value={value}>{children}</ConditionsContext>;
}

export function useConditions(): ConditionsContextValue {
  const value = useContext(ConditionsContext);
  if (!value) throw new Error("useConditions needs a ConditionsProvider above it.");
  return value;
}

/** LARA's radiation dose rate in µGy/h, or why there is none. */
function laraDoseRate(lara: Lara, notAnswering: boolean): number | string {
  if (lara.polledAt === null) return lara.error ? "LARA unavailable" : "LARA starting";
  if (notAnswering) return "LARA not answering";
  const perDay = lara.snapshot?.observed.radiation.observation?.dose_rate_e_ugy_day;
  if (perDay == null) return "no radiation reading from LARA";
  // RAD reports a daily dose; the flight rule is per hour. Two decimals keep the reason readable.
  return Math.round((perDay / 24) * 100) / 100;
}

/** NASA DONKI's space weather from /api/space-weather, read on load and every 15 minutes. */
function useSpaceWeather(): SpaceWeatherFeed {
  const [feed, setFeed] = useState<SpaceWeatherFeed>("loading");
  useEffect(() => {
    let mounted = true;
    async function read() {
      let next: SpaceWeatherFeed = "failed";
      try {
        const response = await fetch("/api/space-weather");
        // Safe cast: an OK answer from our own route is a SpaceWeatherReport.
        if (response.ok) next = (await response.json()) as SpaceWeatherReport;
      } catch {
        // Offline, or the route did not answer: the feed shows as failed.
      }
      if (mounted) setFeed(next);
    }
    void read();
    const timer = setInterval(read, SPACE_WEATHER_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  return feed;
}

/** The current time, updated every intervalMs. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
