"use client";

import type { Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { loadBaseGrid } from "@/lib/mars/load-route-grid";
import type { RouteGrid } from "@/lib/mars/route-grid";
import { EXAMPLE_ZONE } from "@/lib/mars/route-zones";
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

  // Re-registered whenever the mode changes, so the handler never sees a stale mode.
  useEffect(() => {
    if (!map || !mode) return;
    const onClick = ({ lngLat }: MapMouseEvent) => {
      // unproject does not wrap, so a click on a world copy can read lng ≈ 184 instead of −176.
      const { lng, lat } = lngLat.wrap();
      const clicked: LngLat = [lng, lat];
      if (mode === "zone") {
        setDraft((corners) => [...corners, clicked]);
      } else {
        if (mode === "start") setStart(clicked);
        else setEnd(clicked);
        setMode(null);
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, mode]);

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
    setDraft([]);
    setMode(null);
  }

  function clearZones() {
    setZones([]);
    setDraft([]);
  }

  const modeButton = (value: Mode, label: string) => (
    <Button
      size="xs"
      variant={mode === value ? "default" : "outline"}
      onClick={() => setMode(value)}
    >
      {label}
    </Button>
  );

  return (
    <aside className="absolute right-4 bottom-12 max-h-[calc(100svh-31rem)] w-72 max-w-[calc(100%-2rem)] space-y-3 overflow-y-auto rounded-lg border bg-background/90 p-4 text-sm shadow-lg backdrop-blur">
      <h2 className="font-heading text-sm font-semibold">Route (A*)</h2>
      <div className="flex flex-wrap gap-2">
        {modeButton("start", "Set start")}
        {modeButton("end", "Set end")}
        {modeButton("zone", "Draw no-go zone")}
        <Button size="xs" variant="outline" onClick={finishZone}>
          Finish zone
        </Button>
        <Button size="xs" variant="outline" onClick={clearZones}>
          Clear zones
        </Button>
      </div>
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
