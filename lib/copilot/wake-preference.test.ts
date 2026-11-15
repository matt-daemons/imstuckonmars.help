import { describe, expect, it } from "vitest";
import { WAKE_WORD_STORAGE_KEY } from "../browser-data";
import { readWakePreference, writeWakePreference } from "./wake-preference";

describe("wake-word preference", () => {
  it("defaults off and enables only an explicit true value", () => {
    for (const value of [null, "false", "1", "", "invalid"]) {
      expect(readWakePreference({ getItem: () => value })).toBe(false);
    }
    expect(readWakePreference({ getItem: () => "true" })).toBe(true);
  });

  it("persists both toggle states for the next visit", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeWakePreference(storage, true);
    expect(values.get(WAKE_WORD_STORAGE_KEY)).toBe("true");
    expect(readWakePreference(storage)).toBe(true);
    writeWakePreference(storage, false);
    expect(values.get(WAKE_WORD_STORAGE_KEY)).toBe("false");
    expect(readWakePreference(storage)).toBe(false);
  });

  it("tolerates blocked storage without enabling by default", () => {
    expect(
      readWakePreference({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
    expect(() =>
      writeWakePreference(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        true,
      ),
    ).not.toThrow();
  });
});
