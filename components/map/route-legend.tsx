import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The key to the route on the map. Swatches use the same tokens as the map layers; the words carry the meaning. */
export function RouteLegend({
  mode,
  shortest,
}: {
  mode: "walking" | "drive-walk";
  /** The shortest route is drawn too, for comparison. */
  shortest: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {mode === "walking" ? (
        <>
          <LegendItem swatch="h-1 w-4 bg-primary">Out</LegendItem>
          <LegendItem swatch="w-4 border-t-2 border-dashed border-foreground">Back</LegendItem>
        </>
      ) : (
        <>
          <LegendItem swatch="h-1 w-4 bg-primary">Drive</LegendItem>
          <LegendItem swatch="h-1 w-4 bg-route-walk">Walk</LegendItem>
          <LegendItem swatch="w-4 border-t-2 border-dashed border-foreground">
            Return (dashed)
          </LegendItem>
          <LegendItem swatch="size-2.5 rounded-full bg-foreground">Staging point</LegendItem>
          <LegendItem swatch="size-1.5 rounded-full bg-destructive">
            Boulder (unverified)
          </LegendItem>
        </>
      )}
      {shortest && (
        <LegendItem swatch="w-4 border-t border-dashed border-muted-foreground">
          Shortest route (thin, grey)
        </LegendItem>
      )}
      <LegendItem swatch="size-3 bg-destructive">No-go zone</LegendItem>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden className={cn("forced-color-adjust-none", swatch)} />
      {children}
    </span>
  );
}
