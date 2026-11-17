import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPanelLayout, mapStackNeedsScroll } from "./map-panel-layout";

const defaults = {
  viewportHeight: 856,
  bottomInset: 100,
  gap: 12,
  criticalHeight: 320,
  summariesHeight: 88,
};

describe("map control/vitals layout", () => {
  it("connects the short-stack fallback to nonshrinking controls and an operable scrollbar", () => {
    const css = readFileSync(new URL("./map-overlays.css", import.meta.url), "utf8");
    expect(css).toMatch(
      /\.map-camera-stack\[data-map-stack-scroll\]\s*\{[^}]*pointer-events:\s*auto;/,
    );
    expect(css).toMatch(
      /\.map-camera-stack\[data-map-stack-scroll\] \.map-control-row\s*\{[^}]*flex:\s*none;[^}]*overflow-y:\s*visible;/,
    );
    expect(css).toMatch(/min-height:\s*var\(--map-controls-min-height,\s*0px\)/);
    expect(css).toMatch(/min-height:\s*var\(--map-legend-min-height,\s*0px\)/);
  });

  it.each([
    [64.4, 44, [180]],
    [64.4, 44, [180, 132]],
    [128.8, 88, [300, 264]],
  ])(
    "preserves controls through whole-stack scrolling in a %ipx stack",
    (stackHeight, controlsMinHeight, legendHeights) => {
      expect(mapStackNeedsScroll({ stackHeight, controlsMinHeight, legendHeights, gap: 12 })).toBe(
        true,
      );
    },
  );

  it("keeps independent legend viewports when controls and both legends fit", () => {
    expect(
      mapStackNeedsScroll({
        stackHeight: 400,
        controlsMinHeight: 44,
        legendHeights: [180, 132],
        gap: 12,
      }),
    ).toBe(false);
  });

  it("treats exact allocation as fitting and counts the gaps for each enabled legend", () => {
    const input = { stackHeight: 100, controlsMinHeight: 44, legendHeights: [44], gap: 12 };
    expect(mapStackNeedsScroll(input)).toBe(false);
    expect(mapStackNeedsScroll({ ...input, stackHeight: 99 })).toBe(true);
    expect(mapStackNeedsScroll({ ...input, legendHeights: [] })).toBe(false);
  });

  it("reproduces the 400px-high viewport regression with fake and dust legends enabled", () => {
    const layout = mapPanelLayout({
      ...defaults,
      viewportHeight: 400,
      controls: { left: 32, right: 390, top: 104, height: 500 },
      panels: { left: 16, right: 374, top: 76, height: 500 },
    })!;
    expect(layout.controlsMaxHeight).toBeCloseTo(64.4);
    expect(
      mapStackNeedsScroll({
        stackHeight: layout.controlsMaxHeight,
        controlsMinHeight: 44,
        legendHeights: [180, 132],
        gap: 12,
      }),
    ).toBe(true);
    expect(layout.panelsTop).toBeLessThan(400 - defaults.bottomInset);
  });

  it.each([
    // Handheld, tablet with sidebar, small desktop with sidebar, wide desktop with sidebar.
    [390, 0, 16, 358],
    [1024, 360, 72, 576],
    [1200, 360, 292, 460],
    [1512, 360, 488, 576],
  ])("separates open Layers at %ipx with a %ipx sidebar", (width, sidebar, left, controlWidth) => {
    const columnWidth = width - sidebar;
    const controls = { left, right: left + controlWidth, top: 104, height: 500 };
    const panels = { left: 16, right: Math.min(400, columnWidth - 16), top: 76, height: 500 };
    const layout = mapPanelLayout({ ...defaults, controls, panels });
    if (controls.left >= panels.right + defaults.gap) {
      expect(layout).toBeNull();
      return;
    }
    expect(layout).not.toBeNull();
    const bottom = controls.top + Math.min(controls.height, layout!.controlsMaxHeight);
    expect(layout!.panelsTop).toBeGreaterThanOrEqual(bottom + defaults.gap);
    expect(
      defaults.viewportHeight - defaults.bottomInset - layout!.panelsTop,
    ).toBeGreaterThanOrEqual(defaults.criticalHeight);
  });

  it("does not move desktop vitals when the actual control bounds are alongside them", () => {
    expect(
      mapPanelLayout({
        ...defaults,
        controls: { left: 860, right: 1424, top: 23, height: 500 },
        panels: { left: 16, right: 400, top: 76, height: 500 },
      }),
    ).toBeNull();
  });

  it("follows actual expanded control height, then reclaims space when it closes", () => {
    const input = {
      ...defaults,
      controls: { left: 32, right: 390, top: 104, height: 120 },
      panels: { left: 16, right: 374, top: 76, height: 500 },
    };
    expect(mapPanelLayout(input)?.panelsTop).toBe(236);
    expect(
      mapPanelLayout({ ...input, controls: { ...input.controls, height: 44 } })?.panelsTop,
    ).toBe(160);
  });

  it.each([390, 1024, 1200, 1512])(
    "keeps both regions reachable at 200%% text size on a %ipx display",
    (width) => {
      const layout = mapPanelLayout({
        viewportHeight: 756,
        bottomInset: 200,
        gap: 24,
        criticalHeight: 640,
        summariesHeight: 176,
        controls: { left: 32, right: width - 32, top: 180, height: 900 },
        panels: { left: 32, right: Math.min(800, width - 32), top: 152, height: 1000 },
      })!;
      expect(layout.controlsMaxHeight).toBeGreaterThan(0);
      expect(layout.panelsTop).toBeGreaterThanOrEqual(180 + layout.controlsMaxHeight + 24);
      expect(layout.panelsTop).toBeLessThan(756 - 200);
    },
  );

  it("remains stable after applying the measured height cap", () => {
    const input = {
      ...defaults,
      controls: { left: 32, right: 390, top: 104, height: 900 },
      panels: { left: 16, right: 374, top: 76, height: 500 },
    };
    const first = mapPanelLayout(input)!;
    const second = mapPanelLayout({
      ...input,
      controls: { ...input.controls, height: first.controlsMaxHeight },
      panels: { ...input.panels, height: 320 },
    });
    expect(second).toEqual(first);
  });
});
