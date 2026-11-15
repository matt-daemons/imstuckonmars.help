"use client";

import type { LngLat as MapboxLngLat, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
      // Skip an Escape another control already used, such as the chat's suggestion menu.
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

  return (
    <aside
      aria-labelledby="route-title"
      className="absolute right-4 bottom-12 flex max-h-[calc(100svh-31rem)] w-72 max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border bg-background/90 p-4 text-sm shadow-lg backdrop-blur"
    >
      <h2 id="route-title" className="font-heading text-sm font-semibold">
        Route (A*)
      </h2>
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
          <Button size="sm" disabled={draft.length < 3} onClick={finishZone}>
            {draft.length < 3 ? `Finish zone (${draft.length}/3)` : "Finish zone"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={clearZones}>
          Clear zones
        </Button>
      </div>
      {mode && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {MODE_HINTS[mode]} <Kbd>Enter</Kbd> map centre <Kbd>Esc</Kbd> cancel
        </p>
      )}
      <p className="text-xs">
        No-go zones: {zones.length ? zones.map((zone) => zone.name).join(", ") : "none"}
      </p>
      <RouteResult plan={plan} loadFailed={loadFailed} />
      <p className="text-xs text-muted-foreground">
        Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.
      </p>
      <p className="text-xs text-muted-foreground">
        Slopes over {MAX_SLOPE_DEG}° are walls (lunar suit limit, assumed for Mars).
      </p>
    </aside>
  );
}
