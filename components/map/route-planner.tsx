"use client";

import { ChevronDownIcon } from "lucide-react";
import type { LngLat as MapLibreLngLat, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PowerSource } from "@/lib/mars/driving";
import { loadBaseGrid, loadDriveGrid } from "@/lib/mars/load-route-grid";
import { appendCorner, EXAMPLE_ZONE } from "@/lib/mars/route-zones";
import { planWalk, slopeDegrees, wallMask, type NoGoZone } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import { ClearZonesButton } from "./clear-zones-button";
import { DriveControls, nearestFirst } from "./drive-controls";
import { DriveAssumptions, DriveResult } from "./drive-result";
import { MapPanel } from "./map-panel";
import { useDrivePlan, useLoadedGrid } from "./route-hooks";
import {
  collection,
  draftFeatures,
  endFeatures,
  routeFeatures,
  routeLayers,
  setData,
  SOURCES,
  zoneFeature,
} from "./route-layers";
import { RouteResult, WalkAssumptions } from "./route-result";
import type { SitePoi } from "./scene-panel";

type Mission = "walking" | "driving";
type Mode = "start" | "end" | "zone" | null;

const MODE_HINTS: Record<Exclude<Mode, null>, string> = {
  start: "Click the map to set the start.",
  end: "Click the map to set the end.",
  zone: "Click the map to add corners. Double-click to finish.",
};

interface RoutePlannerProps {
  map: MapLibreMap | null;
  base: LngLat;
  target: LngLat;
  sites: SitePoi[];
}

/** A* walk or drive from start to end and back, avoiding steep ground and no-go zones drawn on the map. */
export function RoutePlanner({ map, base, target, sites }: RoutePlannerProps) {
  const [mission, setMission] = useState<Mission>("walking");
  const [power, setPower] = useState<PowerSource>("fission");
  const [start, setStart] = useState(base);
  const [end, setEnd] = useState(target);
  const [zones, setZones] = useState<NoGoZone[]>([EXAMPLE_ZONE]);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const zonesDrawn = useRef(0);
  const drawZoneItem = useRef<HTMLButtonElement>(null);
  const driving = mission === "driving";
  const { grid, failed: loadFailed } = useLoadedGrid(loadBaseGrid, true);
  const drive = useLoadedGrid(loadDriveGrid, driving);
  const destinations = useMemo(() => nearestFirst(sites, base), [sites, base]);
  const destination = destinations.find((site) => samePoint(site.center, end)) ?? null;

  const slope = useMemo(() => grid && slopeDegrees(grid), [grid]);
  const walls = useMemo(() => grid && slope && wallMask(grid, slope, zones), [grid, slope, zones]);
  const walkPlan = useMemo(
    () => grid && slope && walls && planWalk(grid, slope, walls, start, end),
    [grid, slope, walls, start, end],
  );
  const drivePlan = useDrivePlan(drive.grid, { start, end, power, zones }, driving);
  // While a new drive is being planned the old one is stale, so neither the panel nor the map shows it.
  const shownDrive = drivePlan.planning ? null : drivePlan.plan;
  const plan = driving ? shownDrive : walkPlan;

  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    const layers = routeLayers((name) => css.getPropertyValue(name).trim());
    for (const id of SOURCES) map.addSource(id, { type: "geojson", data: collection([]) });
    // Under the stop labels, so text, the route ends and the habitat model stay on top.
    const beforeId = map.getLayer("stops-label") ? "stops-label" : undefined;
    for (const layer of layers) map.addLayer(layer, beforeId);
    return () => {
      if (!map.getStyle()) return; // the parent already called map.remove()
      for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map]);

  useEffect(() => setData(map, "planned-route", plan ? routeFeatures(plan) : []), [map, plan]);
  useEffect(() => setData(map, "no-go-zones", zones.map(zoneFeature)), [map, zones]);
  useEffect(() => setData(map, "zone-draft", draftFeatures(draft)), [map, draft]);
  useEffect(() => setData(map, "route-ends", endFeatures(start, end)), [map, start, end]);

  // Each mission starts from its defaults: walking to the science stop, driving to the nearest site.
  function chooseMission(next: Mission) {
    const nextEnd = next === "driving" ? (destinations[0]?.center ?? target) : target;
    setMission(next);
    setStart(base);
    setEnd(nextEnd);
    if (next === "driving") map?.fitBounds(bounds(base, nextEnd), { padding: panelPadding() });
    else map?.flyTo({ center: base, zoom: 12 });
  }

  function chooseMode(next: Mode) {
    if (next !== "zone") setDraft([]); // a half-drawn zone never outlives drawing mode
    setMode(next);
  }

  // Effect events: the map listeners below read the current mode and draft without re-registering.
  const placePoint = useEffectEvent((lngLat: MapLibreLngLat) => {
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
    canvas.dataset.placing = "true"; // tells the map's click-to-fly to stand down
    map.on("click", onClick);
    canvas.addEventListener("keydown", onCanvasKeyDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      canvas.style.cursor = cursor;
      delete canvas.dataset.placing;
      map.off("click", onClick);
      canvas.removeEventListener("keydown", onCanvasKeyDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [map, armed]);

  const drawing = mode === "zone";
  useEffect(() => {
    if (!map || !drawing) return;
    const canvas = map.getCanvas();
    // Double-click finishes the zone, so it must not also zoom.
    const onDoubleClick = () => finishDrawing();
    map.doubleClickZoom.disable();
    map.on("dblclick", onDoubleClick);
    return () => {
      map.doubleClickZoom.enable();
      map.off("dblclick", onDoubleClick);
      // Finish zone unmounts with drawing mode; if it had focus, hand focus to the map.
      if (document.activeElement === document.body) canvas.focus();
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

  // From lg up it can sit over the bottom centre, so it ends above the hide-panels toggle there.
  return (
    <MapPanel
      title="Route"
      className="absolute right-4 bottom-12 max-h-[max(16rem,calc(100svh-31rem))] w-72 max-w-[calc(100%-2rem)] overflow-y-auto text-sm lg:top-4 lg:right-80 lg:bottom-auto lg:max-h-[calc(100svh-6.5rem)]"
      bodyClassName="mt-2 flex flex-col gap-3"
    >
      <ToggleGroup
        aria-label="Mission type"
        variant="outline"
        size="sm"
        value={[mission]}
        // Pressing the pressed item empties the value; the mission stays as it is then.
        // Safe cast: the only values are the two items below.
        onValueChange={(value) => value[0] && chooseMission(value[0] as Mission)}
      >
        <ToggleGroupItem value="walking">Walking</ToggleGroupItem>
        <ToggleGroupItem value="driving">Driving</ToggleGroupItem>
      </ToggleGroup>
      {driving && (
        <DriveControls
          sites={destinations}
          destination={destination}
          onDestination={(site) => setEnd(site.center)}
          power={power}
          onPower={setPower}
        />
      )}
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
            <ToggleGroupItem ref={drawZoneItem} value="zone">
              Draw no-go zone
            </ToggleGroupItem>
          </ToggleGroup>
          {drawing && (
            <Button size="sm" disabled={draft.length < 3} onClick={finishZone}>
              {draft.length < 3 ? `Finish zone (${draft.length}/3)` : "Finish zone"}
            </Button>
          )}
          <ClearZonesButton zones={zones} onClear={clearZones} focusAfterClear={drawZoneItem} />
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
      {driving ? (
        <DriveResult plan={shownDrive} planning={drivePlan.planning} loadFailed={drive.failed} />
      ) : (
        <RouteResult plan={walkPlan} loadFailed={loadFailed} />
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs">
          No-go zones: {zones.length ? zones.map((zone) => zone.name).join(", ") : "none"}
        </p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {plan?.summary && (
            <>
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-1 w-4 bg-primary forced-color-adjust-none" />
                Out
              </span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="w-4 border-t-2 border-dashed border-foreground forced-color-adjust-none"
                />
                Back
              </span>
            </>
          )}
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-3 bg-destructive forced-color-adjust-none" />
            No-go zone
          </span>
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="xs" />}
          className="[&[data-panel-open]>svg]:rotate-180"
        >
          Assumptions and data
          <ChevronDownIcon aria-hidden />
        </CollapsibleTrigger>
        <CollapsiblePanel className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground motion-reduce:transition-none">
          {driving ? (
            <DriveAssumptions grid={drive.grid} plan={shownDrive} />
          ) : (
            <WalkAssumptions plan={walkPlan} />
          )}
        </CollapsiblePanel>
      </Collapsible>
    </MapPanel>
  );
}

function samePoint([lngA, latA]: LngLat, [lngB, latB]: LngLat): boolean {
  return lngA === lngB && latA === latB;
}

/** South-west and north-east corners around two points. */
function bounds([lngA, latA]: LngLat, [lngB, latB]: LngLat): [LngLat, LngLat] {
  return [
    [Math.min(lngA, lngB), Math.min(latA, latB)],
    [Math.max(lngA, lngB), Math.max(latA, latB)],
  ];
}

// From lg up, the layer panel sits on the left and the scene and route panels on the right.
function panelPadding() {
  return window.matchMedia("(min-width: 64rem)").matches
    ? { top: 64, bottom: 64, left: 320, right: 640 }
    : { top: 64, bottom: 64, left: 32, right: 32 };
}
