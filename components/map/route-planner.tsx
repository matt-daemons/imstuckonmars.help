"use client";

import { ChevronDownIcon } from "lucide-react";
import type { LngLat as MapboxLngLat, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import { loadBaseGrid } from "@/lib/mars/load-route-grid";
import type { RouteGrid } from "@/lib/mars/route-grid";
import { appendCorner, EXAMPLE_ZONE } from "@/lib/mars/route-zones";
import { MAX_SLOPE_DEG, planWalk, slopeDegrees, wallMask, type NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import {
  collection,
  draftFeatures,
  endFeatures,
  LAYERS,
  routeFeatures,
  setData,
  SOURCES,
  zoneFeature,
} from "./route-layers";
import { RouteResult } from "./route-result";

type Mode = "start" | "end" | "zone" | null;

const MODE_HINTS: Record<Exclude<Mode, null>, string> = {
  start: "Click the map to set the start.",
  end: "Click the map to set the end.",
  zone: "Click the map to add corners. Double-click to finish.",
};

interface RoutePlannerProps {
  map: MapboxMap | null;
  base: LngLat;
  target: LngLat;
}

/** A* walk from start to end and back, avoiding steep ground and no-go zones drawn on the map. */
export function RoutePlanner({ map, base, target }: RoutePlannerProps) {
  const [grid, setGrid] = useState<RouteGrid | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [start, setStart] = useState(base);
  const [end, setEnd] = useState(target);
  const [zones, setZones] = useState<NoGoZone[]>([EXAMPLE_ZONE]);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const zonesDrawn = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    loadBaseGrid(controller.signal).then(setGrid, () => {
      if (!controller.signal.aborted) setLoadFailed(true);
    });
    return () => controller.abort();
  }, []);

  const slope = useMemo(() => grid && slopeDegrees(grid), [grid]);
  const walls = useMemo(() => grid && slope && wallMask(grid, slope, zones), [grid, slope, zones]);
  const plan = useMemo(
    () => grid && slope && walls && planWalk(grid, slope, walls, start, end),
    [grid, slope, walls, start, end],
  );

  useEffect(() => {
    if (!map) return;
    for (const id of SOURCES) map.addSource(id, { type: "geojson", data: collection([]) });
    for (const layer of LAYERS) map.addLayer(layer);
    return () => {
      if (!map.getStyle()) return; // the parent already called map.remove()
      for (const layer of LAYERS) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map]);

  useEffect(() => setData(map, "planned-route", plan ? routeFeatures(plan) : []), [map, plan]);
  useEffect(() => setData(map, "no-go-zones", zones.map(zoneFeature)), [map, zones]);
  useEffect(() => setData(map, "zone-draft", draftFeatures(draft)), [map, draft]);
  useEffect(() => setData(map, "route-ends", endFeatures(start, end)), [map, start, end]);

  function chooseMode(next: Mode) {
    if (next !== "zone") setDraft([]); // a half-drawn zone never outlives drawing mode
    setMode(next);
  }

  // Effect events: the map listeners below read the current mode and draft without re-registering.
  const placePoint = useEffectEvent((lngLat: MapboxLngLat) => {
    // unproject does not wrap, so a click on a world copy can read lng ≈ 184 instead of −176.
    const { lng, lat } = lngLat.wrap();
    const point: LngLat = [lng, lat];
    if (mode === "zone") {
      setDraft((corners) => appendCorner(corners, point));
      return;
    }
    if (mode === "start") setStart(point);
    if (mode === "end") setEnd(point);
    chooseMode(null);
  });
  const cancelMode = useEffectEvent(() => chooseMode(null));
  const finishDrawing = useEffectEvent(() => finishZone());

  const armed = mode !== null;
  useEffect(() => {
    if (!map || !armed) return;
    const canvas = map.getCanvas();
    const onClick = (event: MapMouseEvent) => placePoint(event.lngLat);
    // Keyboard placement: arrow keys pan the focused map, Enter places at its centre.
    const onCanvasKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") placePoint(map.getCenter());
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      // Leave alone an Escape that a focused control already handled with preventDefault.
      if (event.key === "Escape" && !event.defaultPrevented) cancelMode();
    };
    const cursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    map.on("click", onClick);
    canvas.addEventListener("keydown", onCanvasKeyDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      canvas.style.cursor = cursor;
      map.off("click", onClick);
      canvas.removeEventListener("keydown", onCanvasKeyDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [map, armed]);

  const drawing = mode === "zone";
  useEffect(() => {
    if (!map || !drawing) return;
    // Double-click finishes the zone, so it must not also zoom.
    const onDoubleClick = () => finishDrawing();
    map.doubleClickZoom.disable();
    map.on("dblclick", onDoubleClick);
    return () => {
      map.doubleClickZoom.enable();
      map.off("dblclick", onDoubleClick);
    };
  }, [map, drawing]);

  // A draft with fewer than 3 corners is dropped without adding a zone.
  function finishZone() {
    if (draft.length >= 3) {
      zonesDrawn.current += 1;
      const n = zonesDrawn.current;
      setZones((current) => [
        ...current,
        { id: `zone-${n}`, name: `No-go zone ${n}`, ring: draft },
      ]);
    }
    chooseMode(null);
  }

  function clearZones() {
    setZones([]);
    setDraft([]);
  }

  const searchLine = plan?.summary
    ? `Search: A*, ${(plan.outbound.expanded + plan.back.expanded).toLocaleString("en-US")} cells searched.`
    : "Search: A*.";

  return (
    <aside
      aria-labelledby="route-title"
      className="absolute right-4 bottom-12 flex max-h-[max(16rem,calc(100svh-31rem))] w-72 max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border bg-background/90 p-4 text-sm shadow-lg backdrop-blur lg:top-4 lg:right-80 lg:bottom-auto lg:max-h-[calc(100svh-2rem)]"
    >
      <h2 id="route-title" className="font-heading text-sm font-semibold">
        Route
      </h2>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <ToggleGroup
            aria-label="Place on map"
            variant="outline"
            size="sm"
            value={mode ? [mode] : []}
            // Safe cast: the only values are the three items below; [] means none is pressed.
            onValueChange={(value) => chooseMode((value[0] ?? null) as Mode)}
          >
            <ToggleGroupItem value="start">Set start</ToggleGroupItem>
            <ToggleGroupItem value="end">Set end</ToggleGroupItem>
            <ToggleGroupItem value="zone">Draw no-go zone</ToggleGroupItem>
          </ToggleGroup>
          {drawing && (
            <Button
              size="sm"
              disabled={draft.length < 3}
              onClick={() => {
                finishZone();
                map?.getCanvas().focus(); // the button unmounts, so focus would fall to the page
              }}
            >
              {draft.length < 3 ? `Finish zone (${draft.length}/3)` : "Finish zone"}
            </Button>
          )}
          <ClearZonesButton zones={zones} onClear={clearZones} map={map} />
        </div>
        {/* Always mounted, so screen readers announce the hint when it changes. */}
        <p aria-live="polite" className={mode ? "text-xs text-muted-foreground" : "sr-only"}>
          {mode && (
            <>
              {MODE_HINTS[mode]} <Kbd>Enter</Kbd> map centre <Kbd>Esc</Kbd> cancel
            </>
          )}
        </p>
      </div>
      <RouteResult plan={plan} loadFailed={loadFailed} />
      <div className="flex flex-col gap-1">
        <p className="text-xs">
          No-go zones: {zones.length ? zones.map((zone) => zone.name).join(", ") : "none"}
        </p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-1 w-4 bg-primary" />
            Out
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-foreground" />
            Back
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-3 bg-destructive" />
            No-go zone
          </span>
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger render={<Button variant="ghost" size="xs" />}>
          Assumptions and data
          <ChevronDownIcon aria-hidden />
        </CollapsibleTrigger>
        <CollapsiblePanel className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground">
          <p>
            Checks slope, walk-back distance and suit time only. The start point counts as base.
          </p>
          <p>Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.</p>
          <p>
            Ground over {MAX_SLOPE_DEG}° is impassable ({FLIGHT_RULES.slope.applies_to} limit,
            assumed for Mars).
          </p>
          <p>{searchLine}</p>
        </CollapsiblePanel>
      </Collapsible>
    </aside>
  );
}

/** Clearing zones can turn a NO-GO into a GO, so it asks first. */
function ClearZonesButton({
  zones,
  onClear,
  map,
}: {
  zones: NoGoZone[];
  onClear: () => void;
  map: MapboxMap | null;
}) {
  // The zones as they were when the dialog opened, so its copy holds still while it closes.
  const [asked, setAsked] = useState<NoGoZone[]>([]);
  const count = asked.length;
  const includesExample = asked.some((zone) => zone.id === EXAMPLE_ZONE.id);
  return (
    <AlertDialog onOpenChange={(open) => open && setAsked(zones)}>
      <AlertDialogTrigger
        disabled={zones.length === 0}
        render={<Button size="sm" variant="destructive-outline" />}
      >
        Clear zones
      </AlertDialogTrigger>
      {/* After clearing, the trigger is disabled and cannot take focus back, so the map gets it. */}
      <AlertDialogPopup data-hazard finalFocus={() => zones.length > 0 || map?.getCanvas()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Clear {count} no-go {count === 1 ? "zone" : "zones"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Routes will no longer avoid them.{includesExample && " This includes the example zone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />} onClick={onClear}>
            Clear zones
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
