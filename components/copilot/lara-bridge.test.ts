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
    bridge.provide("training", () => null);
    expect(bridge.context()).toEqual({ route_plan: { destinations: 4 }, training: null });
    remove();
    expect(bridge.context()).toEqual({ training: null });
  });

  it("runs every handler of one type, so the route and the rover can share focus_map", () => {
    const bridge = createLaraBridge();
    const route = vi.fn();
    const rover = vi.fn();
    bridge.handle("focus_map", route);
    bridge.handle("focus_map", rover);
    expect(bridge.run({ type: "focus_map", target: "rover" })).toBe(true);
    expect(route).toHaveBeenCalledOnce();
    expect(rover).toHaveBeenCalledOnce();
  });

  it("leaves out a context key whose reader throws", () => {
    const bridge = createLaraBridge();
    bridge.provide("route_plan", () => {
      throw new Error("not ready");
    });
    bridge.provide("training", () => null);
    expect(bridge.context()).toEqual({ training: null });
  });

  it("says a line through the registered speaker", () => {
    const bridge = createLaraBridge();
    expect(bridge.say("Hello.")).toBe(false);
    const speak = vi.fn();
    const remove = bridge.speaker(speak);
    expect(bridge.say("Hello.")).toBe(true);
    expect(speak).toHaveBeenCalledWith("Hello.");
    remove();
    expect(bridge.say("Hello.")).toBe(false);
  });
});
