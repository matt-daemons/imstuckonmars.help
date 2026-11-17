import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The view does not use the expedition session; its provider needs the vinext router.
vi.mock("@/components/expedition/expedition-provider", () => ({ useExpedition: () => null }));

import type { Lara } from "./lara-context";
import { LaraVitalsView, vitalsFinished } from "./lara-vitals";

const base: NonNullable<Lara["snapshot"]> = {
  revision: 1,
  clock: { mode: "paused", position_s: 90, speed: 20 },
  config: {
    base: { id: "fixture" },
    duration_s: 3600,
    oxygen: { base: { reserve_g: 60 }, eva: { reserve_g: 60 } },
    battery: { base: { reserve_wh: 89 }, eva: { reserve_wh: 89 } },
  },
  state: {
    activity: "eva",
    reasons: [],
    oxygen: { base: { remaining_g: 900 }, eva: { remaining_g: 720 } },
    battery: { base: { remaining_wh: 1200 }, eva: { remaining_wh: 900 } },
  },
  observed: { radiation: { status: "unavailable", observation: null } },
};

const view = (snapshot: Lara["snapshot"], options: { ageSeconds?: number; stale?: boolean } = {}) =>
  renderToStaticMarkup(
    <LaraVitalsView
      snapshot={snapshot}
      ageSeconds={options.ageSeconds ?? 0}
      stale={options.stale}
      pending={false}
      error={null}
      onToggle={() => {}}
    />,
  );

describe("vitals simulation control", () => {
  it("is finished when ended or at the configured end", () => {
    expect(vitalsFinished(null)).toBe(false);
    expect(vitalsFinished(base)).toBe(false);
    expect(vitalsFinished({ ...base, clock: { ...base.clock, mode: "ended" } })).toBe(true);
    expect(vitalsFinished({ ...base, clock: { ...base.clock, position_s: 3600 } })).toBe(true);
  });
  it("offers a restart, not play, once the run is complete", () => {
    const html = view({ ...base, clock: { ...base.clock, mode: "ended" } });
    expect(html).toContain("Simulation complete");
    expect(html).toContain("Restart simulation");
    expect(html).not.toContain("at 20×");
  });
  it("names the base-only simulation until an expedition is loaded", () => {
    expect(view(base)).toContain("Run base simulation at 20×");
    expect(view({ ...base, config: { ...base.config, route: { id: "r" } } })).toContain(
      "Run simulation at 20×",
    );
  });
  it("uses provider link health, not the standalone demo's shorter poll interval", () => {
    const html = view(base, { ageSeconds: 9, stale: false });
    expect(html).toContain("Simulation paused");
    expect(html).not.toContain("readings stale");
    expect(html).not.toContain('disabled=""');
  });
  it("marks provider-stale readings immediately and disables commands", () => {
    const html = view(base, { ageSeconds: 3, stale: true });
    expect(html).toContain("Mission readings stale");
    expect(html).toContain("3 s old");
    expect(html).toContain('disabled=""');
  });
});
