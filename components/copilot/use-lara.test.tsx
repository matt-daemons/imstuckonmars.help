import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SSR supplies real React state/refs; collect effects to exercise ownership without a DOM.
const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));
vi.mock("./lara-bridge", () => ({
  useLaraBridge: () => ({ speaker: () => () => {}, context: () => ({}), run: () => true }),
}));
vi.mock("./training-provider", () => ({ useOptionalTraining: () => null }));

import type { Expedition } from "@/components/expedition/expedition-provider";
import { useLara, type SharedLaraMission } from "./use-lara";

function owner(): SharedLaraMission {
  return {
    access: { id: "shared-mission", token: "fixture-token" },
    // Only the fields read by this hook are needed for this ownership fixture.
    snapshot: {
      revision: 4,
      state: { reasons: [], battery: { eva: { remaining_wh: 900 } } },
    } as unknown as Expedition["snapshot"],
    lastOkAt: 1234,
    link: "live",
    command: vi.fn(async () => ({
      ...owner().snapshot!,
      applied_revision: 4,
      idempotent_replay: false,
    })),
  };
}

function render(shared?: SharedLaraMission) {
  let result!: ReturnType<typeof useLara>;
  function Probe() {
    result = useLara(shared);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return result;
}

describe("LARA shared mission ownership", () => {
  beforeEach(() => {
    effects.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts no session or mission GET poller when the provider is present", async () => {
    const lara = render(owner());
    const cleanups = effects.map((effect) => effect());
    await vi.advanceTimersByTimeAsync(12_000);
    expect(lara.ready).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    cleanups.forEach((cleanup) => cleanup?.());
  });

  it("does not open a demo while waiting for the provider's session", () => {
    const lara = render({ ...owner(), access: null, snapshot: null, lastOkAt: null });
    effects.forEach((effect) => effect());
    expect(lara.ready).toBe(false);
    expect(lara.snapshot).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a fault command's snapshot and link health directly, without a polling delay", () => {
    const shared = owner();
    expect(render(shared).snapshot).toBe(shared.snapshot);
    const afterFault = {
      ...shared,
      snapshot: {
        ...shared.snapshot,
        revision: 5,
        state: { reasons: [], battery: { eva: { remaining_wh: 405 } } },
      } as unknown as Expedition["snapshot"],
      lastOkAt: 5678,
      link: "stale" as const,
    };
    const lara = render(afterFault);
    expect(lara.snapshot).toBe(afterFault.snapshot);
    expect(lara.snapshot?.state.battery.eva.remaining_wh).toBe(405);
    expect(lara.polledAt).toBe(5678);
    expect(lara.readingsStale).toBe(true);
  });

  it("delegates successive commands and report-preserving resets to the same owner", async () => {
    const shared = owner();
    const lara = render(shared);
    await lara.command({ type: "speed", speed: 20 }, "Simulation speed 20×");
    await lara.command({ type: "play" }, "Run simulation");
    await lara.command({ type: "reset" }, "Restart simulation");
    expect(shared.command).toHaveBeenNthCalledWith(
      1,
      { type: "speed", speed: 20 },
      "Simulation speed 20×",
    );
    expect(shared.command).toHaveBeenNthCalledWith(2, { type: "play" }, "Run simulation");
    expect(shared.command).toHaveBeenNthCalledWith(3, { type: "reset" }, "Restart simulation");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report an unaccepted owner command as successful", async () => {
    const shared = { ...owner(), command: vi.fn(async () => null) };
    await expect(render(shared).command({ type: "play" })).rejects.toThrow("Command not accepted");
    expect(fetch).not.toHaveBeenCalled();
  });
});
