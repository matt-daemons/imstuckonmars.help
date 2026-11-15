import { describe, expect, it, vi } from "vitest";

import { HOLD_MS, PushToTalk } from "./push-to-talk";

/** A push-to-talk with a manual clock and a log of what it did. */
function harness() {
  const log: string[] = [];
  let pending: { fn: () => void; at: number } | null = null;
  let now = 0;
  const ptt = new PushToTalk(
    {
      start: () => log.push("start"),
      stop: () => log.push("stop"),
      activate: (control) => log.push(`activate ${control.id}`),
    },
    ((fn: () => void, ms: number) => {
      pending = { fn, at: now + ms };
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as never,
    () => (pending = null),
  );
  const wait = (ms: number) => {
    now += ms;
    if (pending && pending.at <= now) {
      const { fn } = pending;
      pending = null;
      fn();
    }
  };
  return { ptt, log, wait };
}

const free = { kind: "free" as const, control: null };
const text = { kind: "text" as const, control: null };
const button = { kind: "control" as const, control: { id: "tab" } as HTMLElement };

describe("PushToTalk", () => {
  it("talks at once away from controls, and stops on release", () => {
    const { ptt, log } = harness();
    expect(ptt.down(free, true)).toBe(true);
    expect(ptt.up()).toBe(true);
    expect(log).toEqual(["start", "stop"]);
  });

  it("leaves Space to text fields and to a busy LARA", () => {
    const { ptt, log } = harness();
    expect(ptt.down(text, true)).toBe(false);
    expect(ptt.up()).toBe(false);
    expect(ptt.down(free, false)).toBe(false);
    expect(log).toEqual([]);
  });

  it("activates a focused control on a tap", () => {
    const { ptt, log, wait } = harness();
    expect(ptt.down(button, true)).toBe(true);
    wait(HOLD_MS - 50);
    expect(ptt.up()).toBe(true);
    expect(log).toEqual(["activate tab"]);
  });

  it("talks when Space is held on a focused control", () => {
    const { ptt, log, wait } = harness();
    ptt.down(button, true);
    wait(HOLD_MS);
    expect(log).toEqual(["start"]);
    ptt.up();
    expect(log).toEqual(["start", "stop"]);
  });

  it("treats key repeats as part of the press in progress", () => {
    const { ptt, log } = harness();
    ptt.down(free, true);
    expect(ptt.down(button, true)).toBe(true);
    ptt.up();
    expect(log).toEqual(["start", "stop"]);
  });

  it("talks on a hold with the default timer", () => {
    vi.useFakeTimers();
    try {
      const log: string[] = [];
      const ptt = new PushToTalk({
        start: () => log.push("start"),
        stop: () => log.push("stop"),
        activate: () => log.push("activate"),
      });
      ptt.down(button, true);
      vi.advanceTimersByTime(HOLD_MS);
      ptt.up();
      expect(log).toEqual(["start", "stop"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends a press whose release never arrives", () => {
    const { ptt, log, wait } = harness();
    ptt.down(free, true);
    ptt.abandon();
    ptt.down(button, true);
    ptt.abandon();
    wait(HOLD_MS * 2);
    expect(log).toEqual(["start", "stop"]);
    expect(ptt.up()).toBe(false);
  });
});
