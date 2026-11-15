import type { MissionReport } from "./client";
import { reportKey } from "./completion";

import { REPORTS_DATABASE as DATABASE } from "../browser-data";
const STORE = "reports";
const REMOVED_STORE = "removed-reports";
export const REPORT_HISTORY_LIMIT = 20;
export const REPORT_HISTORY_CHANGED = "ares-report-history-changed";
export const REPORT_REMOVED = "ares-report-removed";

export interface SavedReport {
  id: string;
  saved_at_ms: number;
  report: MissionReport;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(REMOVED_STORE))
        request.result.createObjectStore(REMOVED_STORE);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other LARA tabs and retry saving the report"));
  });
}

/** Immutable server reports only, no session tokens or second simulation state. */
export async function saveReport(report: MissionReport): Promise<SavedReport | null> {
  const database = await openDatabase();
  try {
    const saved = await new Promise<SavedReport | null>((resolve, reject) => {
      const transaction = database.transaction([STORE, REMOVED_STORE], "readwrite");
      const store = transaction.objectStore(STORE);
      let value: SavedReport = { id: reportKey(report), saved_at_ms: Date.now(), report };
      let removed = false;
      const deletion = transaction.objectStore(REMOVED_STORE).get(value.id);
      deletion.onsuccess = () => {
        removed = deletion.result === true;
        if (removed) return;
        const request = store.getAll();
        request.onsuccess = () => {
          const rows = request.result as SavedReport[];
          value = rows.find((row) => row.id === value.id) ?? value;
          store.put(value);
          const retained = [...rows.filter((row) => row.id !== value.id), value].sort(
            (a, b) => b.saved_at_ms - a.saved_at_ms,
          );
          for (const row of retained.slice(REPORT_HISTORY_LIMIT)) store.delete(row.id);
        };
      };
      transaction.oncomplete = () => resolve(removed ? null : value);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Report storage was interrupted"));
      transaction.onerror = () => reject(transaction.error);
    });
    window.dispatchEvent(new Event(REPORT_HISTORY_CHANGED));
    return saved;
  } finally {
    database.close();
  }
}

/** Remember explicit removal so resuming the finished mission cannot restore the copy. */
export async function removeReport(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE, REMOVED_STORE], "readwrite");
      transaction.objectStore(STORE).delete(id);
      transaction.objectStore(REMOVED_STORE).put(true, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Report removal was interrupted"));
      transaction.onerror = () => reject(transaction.error);
    });
    window.dispatchEvent(new CustomEvent(REPORT_REMOVED, { detail: id }));
    window.dispatchEvent(new Event(REPORT_HISTORY_CHANGED));
  } finally {
    database.close();
  }
}

export async function listReports(): Promise<SavedReport[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).getAll();
      transaction.oncomplete = () =>
        resolve((request.result as SavedReport[]).sort((a, b) => b.saved_at_ms - a.saved_at_ms));
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
