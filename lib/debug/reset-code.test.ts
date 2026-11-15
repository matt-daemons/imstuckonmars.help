import { describe, expect, it } from "vitest";
import { ResetCode } from "./reset-code";

const keyEvent = (key: string) => ({
  key,
  repeat: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
});
const sequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"];

describe("local reset code", () => {
  it("requires the exact sequence and resets after activation", () => {
    const code = new ResetCode();
    expect(sequence.map((key, i) => code.press(keyEvent(key), i * 100))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(code.press(keyEvent("ArrowDown"), 500)).toBe(false);
  });
  it("supports overlapping starts without accepting intervening keys", () => {
    const code = new ResetCode();
    expect(
      ["ArrowUp", ...sequence].map((key, i) => code.press(keyEvent(key), i * 100)).at(-1),
    ).toBe(true);
    expect(
      ["ArrowUp", "x", "ArrowUp", "ArrowDown", "ArrowDown"].some((key, i) =>
        code.press(keyEvent(key), i * 100),
      ),
    ).toBe(false);
  });
  it("expires partial input and can abandon a sequence on blur or editing", () => {
    const code = new ResetCode();
    code.press(keyEvent("ArrowUp"), 0);
    code.press(keyEvent("ArrowUp"), 100);
    expect(code.press(keyEvent("ArrowDown"), 2000)).toBe(false);
    expect(code.press(keyEvent("ArrowDown"), 2100)).toBe(false);
    code.press(keyEvent("ArrowUp"), 2200);
    code.reset();
    expect(sequence.slice(1).some((key, i) => code.press(keyEvent(key), 2300 + i * 100))).toBe(
      false,
    );
  });
  it("ignores repeat, composition and modifiers", () => {
    for (const flag of [
      "repeat",
      "isComposing",
      "altKey",
      "ctrlKey",
      "metaKey",
      "shiftKey",
    ] as const) {
      const code = new ResetCode();
      expect(
        sequence.some((key, i) => code.press({ ...keyEvent(key), [flag]: true }, i * 100)),
      ).toBe(false);
    }
  });
});
