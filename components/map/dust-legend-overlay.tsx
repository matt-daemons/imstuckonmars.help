import { createPortal } from "react-dom";

import type { DustField } from "@/lib/mars/dust-simulation";

import { DustLegend } from "./dust-legend";

/**
 * The dust legend and its simulation label, drawn on the map itself so they stay in sight while
 * "Scene and dust" is closed or the sidebar is hidden: dust on the map is never read as weather.
 */
export function DustLegendOverlay({
  target,
  field,
}: {
  target: HTMLDivElement | null;
  field: DustField;
}) {
  if (!target) return null;
  // font-sans and text-sm: the map's container sets a font of its own.
  return createPortal(
    <aside
      aria-label="NASA dust simulation legend"
      className="dust-map-legend w-60 space-y-2 border bg-background/90 p-2 font-sans text-sm backdrop-blur"
    >
      <p className="border-l-2 border-info pl-2">
        NASA Ames model simulation · not observed or live weather
      </p>
      <DustLegend field={field} />
    </aside>,
    target,
  );
}
