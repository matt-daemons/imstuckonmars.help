import { describe, expect, it } from "vitest";
import {
  MISSION_STORAGE_KEY,
  resetBrowserData,
  TRAINING_STORAGE_KEY,
  WAKE_WORD_STORAGE_KEY,
} from "./browser-data";

function fixture() {
  const local = new Map([
    [TRAINING_STORAGE_KEY, "progress"],
    [WAKE_WORD_STORAGE_KEY, "true"],
    ["unrelated", "keep"],
  ]);
  const session = new Map([
    [MISSION_STORAGE_KEY, "session"],
    ["unrelated", "keep"],
  ]);
  const document = { cookie: "" };
  return {
    local,
    session,
    document,
    browser: {
      localStorage: {
        removeItem: (key: string) => {
          local.delete(key);
        },
      },
      sessionStorage: {
        removeItem: (key: string) => {
          session.delete(key);
        },
      },
      document,
    },
  };
}

describe("browser data reset", () => {
  it("clears only app-owned records after report deletion succeeds", async () => {
    const f = fixture();
    let finish = () => {};
    const deletion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const reset = resetBrowserData(f.browser, () => deletion);
    expect(f.local.get(TRAINING_STORAGE_KEY)).toBe("progress");
    expect(f.local.get(WAKE_WORD_STORAGE_KEY)).toBe("true");
    finish();
    await reset;
    expect([...f.local]).toEqual([["unrelated", "keep"]]);
    expect(f.local.has(WAKE_WORD_STORAGE_KEY)).toBe(false);
    expect([...f.session]).toEqual([["unrelated", "keep"]]);
    expect(f.document.cookie).toContain("sidebar_state=; Max-Age=0");
  });

  it("reports failed deletion without clearing session or training", async () => {
    const f = fixture();
    const reset = resetBrowserData(f.browser, () =>
      Promise.reject(new Error("Close other ARES tabs")),
    );
    await expect(reset).rejects.toThrow("Close other ARES tabs");
    expect(f.session.get(MISSION_STORAGE_KEY)).toBe("session");
    expect(f.local.get(TRAINING_STORAGE_KEY)).toBe("progress");
  });
});
