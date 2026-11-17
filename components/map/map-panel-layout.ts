type Bounds = Pick<DOMRect, "left" | "right" | "top" | "height">;

/** Nonshrinking legends must never leave a zero-height controls scroller. */
export function mapStackNeedsScroll({
  stackHeight,
  controlsMinHeight,
  legendHeights,
  gap,
}: {
  stackHeight: number;
  controlsMinHeight: number;
  legendHeights: number[];
  gap: number;
}) {
  return (
    controlsMinHeight + legendHeights.reduce((sum, height) => sum + height + gap, 0) > stackHeight
  );
}

/** Reserve real control/readout dimensions, not a guessed height for an open disclosure. */
export function mapPanelLayout({
  controls,
  panels,
  viewportHeight,
  bottomInset,
  gap,
  criticalHeight,
  summariesHeight,
}: {
  controls: Bounds;
  panels: Bounds;
  viewportHeight: number;
  bottomInset: number;
  gap: number;
  criticalHeight: number;
  summariesHeight: number;
}) {
  const shared = controls.left < panels.right + gap && controls.right + gap > panels.left;
  if (!shared) return null;
  const available = Math.max(0, viewportHeight - bottomInset - controls.top - gap);
  // If enlarged text cannot fit both regions, both retain proportional scroll areas.
  // Normally the whole vitals readout + simulation command stays above the fold.
  const reserved = Math.min(Math.max(0, criticalHeight), available * 0.65);
  const controlsMaxHeight = Math.max(
    Math.min(summariesHeight, available * 0.35),
    available - reserved,
  );
  return {
    controlsMaxHeight,
    panelsTop: Math.max(
      panels.top,
      controls.top + Math.min(controls.height, controlsMaxHeight) + gap,
    ),
  };
}

/** Existing map DOM stays in place; resize, disclosures, portals and text reflow update its bounds. */
export function observeMapPanelLayout(column: HTMLElement) {
  let frame = 0;
  const scrollRegions = new Map<HTMLElement, Map<string, string | null>>();
  const makeScrollable = (element: HTMLElement, label?: string) => {
    if (scrollRegions.has(element)) return;
    const attributes: Record<string, string> = { tabindex: "0" };
    if (label) Object.assign(attributes, { role: "group", "aria-label": label });
    scrollRegions.set(
      element,
      new Map(Object.keys(attributes).map((name) => [name, element.getAttribute(name)])),
    );
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  const update = () => {
    frame = 0;
    const viewport = column.querySelector<HTMLElement>(".map-overlay-viewport");
    const controls = column.querySelector<HTMLElement>(".map-camera-stack");
    const panels = column.querySelector<HTMLElement>(".map-left-panels");
    if (!viewport || !controls || !panels) return;
    const critical = panels.querySelector<HTMLElement>(".lara-vitals dl")?.nextElementSibling;
    const summaries = [...controls.querySelectorAll<HTMLElement>(".map-disclosure > summary")];
    const legends = [
      ...controls.querySelectorAll<HTMLElement>(".fake-sensor-legend, .dust-map-legend"),
    ];
    const labels = legends.map((legend) => legend.firstElementChild);
    for (const element of [
      column,
      viewport,
      controls,
      panels,
      panels.firstElementChild,
      column.querySelector(".map-top-left-controls"),
      critical,
      ...summaries,
      ...legends,
      ...labels,
    ]) {
      if (element) observer.observe(element);
    }
    const origin = viewport.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const panelsRect = panels.getBoundingClientRect();
    const criticalRect = critical?.getBoundingClientRect();
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const controlsMinHeight = Math.max(0, ...summaries.map((summary) => summary.offsetHeight));
    controls.style.setProperty("--map-controls-min-height", `${controlsMinHeight}px`);
    makeScrollable(controls, "Map controls and enabled legends");
    for (const legend of legends) {
      makeScrollable(legend);
      const style = getComputedStyle(legend);
      const labelHeight = legend.firstElementChild?.getBoundingClientRect().height ?? 0;
      const lineHeight =
        Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
      legend.style.setProperty(
        "--map-legend-min-height",
        // Leave a readable body line below the sticky label, even at enlarged text sizes.
        `${labelHeight + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) + lineHeight}px`,
      );
    }
    const baseTop =
      Number.parseFloat(column.style.getPropertyValue("--map-top-row-height") || "44") + 2 * rem;
    const layout = mapPanelLayout({
      controls: { ...rectBounds(controlsRect), top: controlsRect.top - origin.top },
      panels: { ...rectBounds(panelsRect), top: baseTop },
      viewportHeight: origin.height,
      bottomInset: 6.25 * rem,
      gap: 0.75 * rem,
      criticalHeight: criticalRect?.height
        ? criticalRect.bottom - panelsRect.top + panels.scrollTop + rem
        : Math.min(panels.scrollHeight, origin.height),
      summariesHeight: summaries.reduce((height, summary) => height + summary.offsetHeight, 0),
    });
    column.toggleAttribute("data-shared-map-panels", layout !== null);
    if (layout) {
      column.style.setProperty("--map-shared-controls-height", `${layout.controlsMaxHeight}px`);
      column.style.setProperty("--map-shared-panels-top", `${layout.panelsTop}px`);
    }
    // Read the effective CSS cap, which can be lower than the shared-space allocation.
    controls.toggleAttribute(
      "data-map-stack-scroll",
      mapStackNeedsScroll({
        stackHeight: controls.getBoundingClientRect().height,
        controlsMinHeight,
        legendHeights: legends.map((legend) => legend.getBoundingClientRect().height),
        gap: 0.75 * rem,
      }),
    );
  };
  const mutations = new MutationObserver(schedule);
  mutations.observe(column, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  observer.observe(column);
  update();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    mutations.disconnect();
    for (const [element, attributes] of scrollRegions) {
      for (const [name, value] of attributes) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  };
}

function rectBounds(rect: DOMRect): Bounds {
  return { left: rect.left, right: rect.right, top: rect.top, height: rect.height };
}
