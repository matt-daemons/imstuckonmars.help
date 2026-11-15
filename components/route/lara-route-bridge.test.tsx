import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LaraRouteBridge } from "./lara-route-bridge";

const state = vi.hoisted(() => ({
  handlers: new Map<string, (action: unknown) => boolean | void>(),
  dispatch: vi.fn(),
  focus: vi.fn(() => true),
  setFollow: vi.fn(),
  destinations: [{ center: [-176, 46] }],
}));
vi.mock("@/components/copilot/lara-bridge", () => ({
  useLaraAction: (type: string, handler: (action: unknown) => boolean | void) =>
    state.handlers.set(type, handler),
  useLaraBridge: () => ({ say: vi.fn() }),
  useLaraContextReader: vi.fn(),
}));
vi.mock("./route-plan-provider", () => ({
  useRoutePlan: () => ({
    inputs: { mission: null },
    dispatch: state.dispatch,
    base: [-176, 45],
    destinations: state.destinations,
  }),
}));
vi.mock("./conditions-provider", () => ({ useConditions: () => ({ conditions: {} }) }));
vi.mock("@/components/map/mission-view", () => ({
  useMissionView: () => ({ focus: state.focus }),
}));
vi.mock("@/components/expedition/expedition-provider", () => ({
  useExpedition: () => ({ setFollow: state.setFollow }),
}));

describe("LARA destination camera", () => {
  beforeEach(() => {
    state.handlers.clear();
    state.dispatch.mockClear();
    state.focus.mockClear();
  });
  it("uses the operator's Overview path instead of a separate fit that leaves crew-follow enabled", () => {
    // Only map availability is inspected here; the shared Overview controller owns MapLibre calls.
    const map = {} as Parameters<typeof LaraRouteBridge>[0]["map"];
    renderToStaticMarkup(<LaraRouteBridge map={map} />);
    expect(state.handlers.get("show_destinations")?.({ type: "show_destinations" })).toBe(true);
    expect(state.focus).toHaveBeenCalledWith("overview");
    expect(state.dispatch).toHaveBeenCalledWith({ type: "goTo", step: "where" });
  });
  it("refuses movement before the map is available, without changing the mission", () => {
    renderToStaticMarkup(<LaraRouteBridge map={null} />);
    expect(state.handlers.get("show_destinations")?.({ type: "show_destinations" })).toBe(false);
    expect(state.focus).not.toHaveBeenCalled();
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
