"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import type { PlaceMode, Placement } from "./use-placement";

const MODE_HINTS: Record<PlaceMode, string> = {
  start: "Click the map to set the start.",
  end: "Click the map to set the end.",
  zone: "Click the map to add corners. Double-click to finish.",
};

/** What to do while a placement is armed. */
export function PlacementHint({ mode }: { mode: PlaceMode }) {
  return (
    <>
      {MODE_HINTS[mode]} <Kbd>Enter</Kbd> map centre <Kbd>Esc</Kbd> cancel
    </>
  );
}

/**
 * The hint over the map, for below md: placing closes the sheet that holds step ②'s hint. Mounted
 * while the sidebar is a sheet, so screen readers announce the hint when it appears.
 */
export function MapPlacementHint({ placement, shown }: { placement: Placement; shown: boolean }) {
  const { mode } = placement;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-16 z-10 flex justify-center"
    >
      {shown && mode && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 border bg-background/90 px-3 py-1.5 text-xs backdrop-blur">
          <p>
            <PlacementHint mode={mode} />
          </p>
          {mode === "zone" && <FinishZoneButton placement={placement} />}
        </div>
      )}
    </div>
  );
}

/** Adds the drawn zone; it needs 3 corners first. */
export function FinishZoneButton({ placement }: { placement: Placement }) {
  const corners = placement.draft.length;
  return (
    <Button size="sm" disabled={corners < 3} onClick={placement.finishZone}>
      {corners < 3 ? `Finish zone (${corners}/3)` : "Finish zone"}
    </Button>
  );
}
