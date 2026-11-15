import type { MissionReport } from "./client";
import { reportKey } from "./completion";

const DATABASE = "ares-simulation-reports";
const STORE = "reports";
export const REPORT_HISTORY_LIMIT = 20;
export const REPORT_HISTORY_CHANGED = "ares-report-history-changed";

export interface SavedReport {
  id: string;
  saved_at_ms: number;
  report: MissionReport;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other ARES tabs and retry saving the report"));
  });
}

/** Immutable server reports only, no session tokens or second simulation state. */
export async function saveReport(report: MissionReport): Promise<SavedReport> {
  const database = await openDatabase();
  try {
    const saved = await new Promise<SavedReport>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      let value: SavedReport = { id: reportKey(report), saved_at_ms: Date.now(), report };
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
      transaction.oncomplete = () => resolve(value);
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
