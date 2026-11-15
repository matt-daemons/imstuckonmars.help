export const TRAINING_STORAGE_KEY = "lara.training";
export const WAKE_WORD_STORAGE_KEY = "lara.wakeWord";
export const MISSION_STORAGE_KEY = "imstuckonmars.expedition";
export const REPORTS_DATABASE = "ares-simulation-reports";

/** Only app-owned state, never unrelated origin storage or downloaded model caches. */
export async function resetBrowserData(
  browser: {
    localStorage: Pick<Storage, "removeItem">;
    sessionStorage: Pick<Storage, "removeItem">;
    document: Pick<Document, "cookie">;
  },
  deleteReports: () => Promise<void> = deleteSavedReports,
) {
  await deleteReports();
  browser.localStorage.removeItem(TRAINING_STORAGE_KEY);
  browser.localStorage.removeItem(WAKE_WORD_STORAGE_KEY);
  browser.sessionStorage.removeItem(MISSION_STORAGE_KEY);
  browser.document.cookie = "sidebar_state=; Max-Age=0; Path=/; SameSite=Lax";
}

function deleteSavedReports(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(REPORTS_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Saved reports could not be cleared."));
    request.onblocked = () => reject(new Error("Close other LARA tabs, then retry the reset."));
  });
}
