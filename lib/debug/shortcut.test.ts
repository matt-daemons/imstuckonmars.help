import { describe, expect, it } from "vitest";
import { isDebugShortcut } from "./shortcut";

const event = {
  key: "D",
  shiftKey: true,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
};

describe("debug shortcut", () => {
  it("requires Shift+D", () => {
    expect(isDebugShortcut(event)).toBe(true);
    expect(isDebugShortcut({ ...event, key: "d" })).toBe(true);
    expect(isDebugShortcut({ ...event, shiftKey: false })).toBe(false);
    expect(isDebugShortcut({ ...event, key: "F" })).toBe(false);
  });
  it("ignores composition, key repeat, handled events and extra modifiers", () => {
    for (const flag of [
      "ctrlKey",
      "altKey",
      "metaKey",
      "repeat",
      "isComposing",
      "defaultPrevented",
    ] as const) {
      expect(isDebugShortcut({ ...event, [flag]: true })).toBe(false);
    }
  });
});
