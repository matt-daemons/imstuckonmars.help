"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useExpeditionAccess } from "@/components/expedition/expedition-provider";

import { useLara } from "./use-lara";
import { useWakeWord } from "./use-wake-word";
import { useWakePreference } from "./use-wake-preference";

export type Lara = ReturnType<typeof useLaraController>;
function useLaraController() {
  const lara = useLara(useExpeditionAccess());
  const [wakeOn, setWakeOn] = useWakePreference();
  const wake = useWakeWord({
    enabled: wakeOn && lara.ready,
    paused: lara.status !== "idle",
    ...lara.wakeHandlers,
  });
  return {
    ...lara,
    wakeOn,
    setWakeOn,
    wakeState: wake.state,
    finishListening: () => {
      if (wakeOn) wake.finish();
      lara.stopListening();
    },
  };
}

const LaraContext = createContext<Lara | null>(null);

/**
 * Shares mission and voice state with the chat, vitals, verdict strip and launcher.
 * LARA reads the page's expedition session (ExpeditionProvider), so the map, the HUD and LARA
 * describe the same mission.
 */
export function LaraProvider({ children }: { children: ReactNode }) {
  return <LaraContext value={useLaraController()}>{children}</LaraContext>;
}

export function useLaraContext(): Lara {
  const lara = useContext(LaraContext);
  if (!lara) throw new Error("useLaraContext needs a LaraProvider above it.");
  return lara;
}
