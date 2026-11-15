"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useLara } from "./use-lara";

export type Lara = ReturnType<typeof useLara>;

const LaraContext = createContext<Lara | null>(null);

/**
 * Calls useLara once, since it opens a mission session on the backend and polls it, and shares it
 * with the chat, the verdict strip and the Ask LARA button.
 */
export function LaraProvider({ children }: { children: ReactNode }) {
  return <LaraContext value={useLara()}>{children}</LaraContext>;
}

export function useLaraContext(): Lara {
  const lara = useContext(LaraContext);
  if (!lara) throw new Error("useLaraContext needs a LaraProvider above it.");
  return lara;
}
