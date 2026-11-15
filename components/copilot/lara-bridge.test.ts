import { describe, expect, it, vi } from "vitest";

import { createLaraBridge } from "./lara-bridge";

describe("createLaraBridge", () => {
  it("runs the registered handler and reports when none is registered", () => {
    const bridge = createLaraBridge();
    const fn = vi.fn();
    const remove = bridge.handle("select_destination", fn);
    expect(bridge.run({ type: "select_destination", number: 2 })).toBe(true);
    expect(fn).toHaveBeenCalledWith({ type: "select_destination", number: 2 });
    remove();
    expect(bridge.run({ type: "select_destination", number: 2 })).toBe(false);
  });

  it("keeps a newer handler when an older one is removed", () => {
    const bridge = createLaraBridge();
    const removeOld = bridge.handle("start_simulation", vi.fn());
    const newer = vi.fn();
    bridge.handle("start_simulation", newer);
    removeOld();
    bridge.run({ type: "start_simulation" });
    expect(newer).toHaveBeenCalledOnce();
  });

  it("reads every registered context key", () => {
    const bridge = createLaraBridge();
    const remove = bridge.provide("route_plan", () => ({ destinations: 4 }));
    bridge.provide("simulation", () => null);
    expect(bridge.context()).toEqual({ route_plan: { destinations: 4 }, simulation: null });
    remove();
    expect(bridge.context()).toEqual({ simulation: null });
  });
});
