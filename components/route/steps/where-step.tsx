"use client";

import { ChevronDownIcon } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useId, useRef, useState } from "react";

import { ClearZonesButton } from "@/components/map/clear-zones-button";
import { siteLabel } from "@/components/map/drive-controls";
import { formatNumber } from "@/components/map/drive-result";
import { fitPoints } from "@/components/route/camera";
import { FinishZoneButton, PlacementHint } from "@/components/route/placement-hint";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import type { PlaceMode, Placement } from "@/components/route/use-placement";
import { samePoint } from "@/components/route/use-route-plan-result";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup } from "@/components/ui/radio-group";
import { useSidebar } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { marsDistanceM } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import { ChoiceCard } from "./choice-card";

/** Step ②: where the mission goes, picked from a list or set on the map, and its no-go zones. */
export function WhereStep({
  map,
  base,
  target,
  placement,
}: {
  map: MapLibreMap | null;
  base: LngLat;
  target: LngLat;
  placement: Placement;
}) {
  const { inputs, dispatch, destinations } = useRoutePlan();
  const { mission, start, end } = inputs;
  const listLabel = useId();
  // A walk has one preset end, the science stop; a drive + walk ends at one of the sites.
  const choices =
    mission === "drive-walk"
      ? destinations.map((site) => ({
          id: site.id,
          // The sidebar header already says Arcadia, so the titles fit one line.
          title: siteLabel(site).replace(" in Arcadia Planitia", ""),
          center: site.center,
        }))
      : [{ id: "science-stop", title: "Science stop (placeholder)", center: target }];
  const chosen = choices.find((choice) => samePoint(choice.center, end));

  function chooseEnd(id: string) {
    const choice = choices.find((candidate) => candidate.id === id);
    if (!choice) return;
    dispatch({ type: "setEnd", point: choice.center });
    fitPoints(map, [start, choice.center]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 id={listLabel} className="font-heading text-sm font-semibold">
          Destination
        </h3>
        <RadioGroup
          aria-labelledby={listLabel}
          value={chosen?.id ?? null}
          // Safe cast: the values are the choice ids below.
          onValueChange={(id) => chooseEnd(id as string)}
        >
          {choices.map((choice) => (
            <ChoiceCard key={choice.id} value={choice.id} title={choice.title}>
              <span className="font-mono tabular-nums">
                {formatNumber(marsDistanceM(base, choice.center) / 1000, 1)} km
              </span>{" "}
              from the habitat in a straight line
            </ChoiceCard>
          ))}
        </RadioGroup>
        {!chosen && <p className="text-xs">The end is a point set on the map.</p>}
        {mission === "walking" && (
          <p className="text-xs text-muted-foreground">
            To end somewhere else, open Edit route and use Set end.
          </p>
        )}
      </div>
      <EditRoute placement={placement} />
    </div>
  );
}

/** Setting the start or the end on the map and drawing no-go zones. Closed until needed. */
function EditRoute({ placement }: { placement: Placement }) {
  const { inputs } = useRoutePlan();
  const { setOpenMobile } = useSidebar();
  const drawZoneItem = useRef<HTMLButtonElement>(null);
  const { mode } = placement;
  // Starts open while placing, as when the sheet comes back in the middle of drawing a zone.
  const [open, setOpen] = useState(mode !== null);

  function choose(next: PlaceMode | null) {
    // Below md the sidebar is a sheet over the map, so it gets out of the way for the click.
    if (next) setOpenMobile(false);
    placement.arm(next);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={<Button variant="ghost" size="sm" />}
        className="[&[data-panel-open]>svg]:rotate-180"
      >
        Edit route
        <ChevronDownIcon aria-hidden />
      </CollapsibleTrigger>
      {/* -m-1 p-1 leaves room for focus rings, which the panel's overflow-hidden would clip. */}
      <CollapsiblePanel className="-m-1 flex flex-col gap-1 p-1 motion-reduce:transition-none">
        <div className="flex flex-wrap gap-2 pt-2">
          <ToggleGroup
            aria-label="Place on map"
            variant="outline"
            size="sm"
            value={mode ? [mode] : []}
            // Safe cast: the only values are the three items below; [] means none is pressed.
            onValueChange={(value) => choose((value[0] ?? null) as PlaceMode | null)}
          >
            <ToggleGroupItem value="start">Set start</ToggleGroupItem>
            <ToggleGroupItem value="end">Set end</ToggleGroupItem>
            <ToggleGroupItem ref={drawZoneItem} value="zone">
              Draw no-go zone
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === "zone" && <FinishZoneButton placement={placement} />}
          <ClearZonesButton
            zones={inputs.zones}
            onClear={placement.clearZones}
            focusAfterClear={drawZoneItem}
          />
        </div>
        {/* Always mounted while open, so screen readers announce the hint when it changes. */}
        <p aria-live="polite" className={mode ? "text-xs text-muted-foreground" : "sr-only"}>
          {mode && <PlacementHint mode={mode} />}
        </p>
      </CollapsiblePanel>
    </Collapsible>
  );
}
