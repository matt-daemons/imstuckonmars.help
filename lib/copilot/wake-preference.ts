import { WAKE_WORD_STORAGE_KEY } from "../browser-data";

export function readWakePreference(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(WAKE_WORD_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Storage may be blocked; the current page can still honor the toggle. */
export function writeWakePreference(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  try {
    storage.setItem(WAKE_WORD_STORAGE_KEY, String(enabled));
  } catch {
    // Memory-only preference when browser storage is unavailable.
  }
}
