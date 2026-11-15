"use client";

import { useCallback, useEffect, useState } from "react";
import { WAKE_WORD_STORAGE_KEY } from "@/lib/browser-data";
import { readWakePreference, writeWakePreference } from "@/lib/copilot/wake-preference";

export function useWakePreference() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const restore = () => {
      try {
        setEnabled(readWakePreference(window.localStorage));
      } catch {
        setEnabled(false);
      }
    };
    restore();
    const changed = (event: StorageEvent) => {
      if (event.key === WAKE_WORD_STORAGE_KEY || event.key === null) restore();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const setPreference = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      writeWakePreference(window.localStorage, value);
    } catch {
      // Accessing localStorage itself can fail in restricted browsers.
    }
  }, []);
  return [enabled, setPreference] as const;
}
