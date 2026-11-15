"use client";

import type { GeoJSONSource, LayerSpecification, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { loadBaseGrid } from "@/lib/mars/load-route-grid";
import type { RouteGrid } from "@/lib/mars/route-grid";
import { EXAMPLE_ZONE } from "@/lib/mars/route-zones";
import {
  planWalk,
  slopeDegrees,
  wallMask,
  type NoGoZone,
  type RouteStatus,
} from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

type Mode = "start" | "end" | "zone" | null;
type Plan = ReturnType<typeof planWalk>;
// Just the GeoJSON this panel draws (@types/geojson is not a direct dependency).
type Geometry =
  | { type: "Point"; coordinates: LngLat }
  | { type: "LineString"; coordinates: LngLat[] }
  | { type: "Polygon"; coordinates: LngLat[][] };
type Feature = { type: "Feature"; properties: Record<string, string>; geometry: Geometry };

const STATUS_MESSAGES: Record<Exclude<RouteStatus, "ok">, string> = {
  outside_grid: "Point is outside the elevation grid",
  start_blocked: "Start is inside a wall or no-go zone",
  goal_blocked: "End is inside a wall or no-go zone",
  no_path: "No route avoids every wall",
};

const SOURCES = ["planned-route", "no-go-zones", "zone-draft", "route-ends"] as const;

const LAYERS: LayerSpecification[] = [
  {
    id: "no-go-zones",
    type: "fill",
    source: "no-go-zones",
    paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 },
  },
  {
    id: "no-go-zones-outline",
    type: "line",
    source: "no-go-zones",
    paint: { "line-color": "#ef4444", "line-width": 2 },
  },
  {
    id: "zone-draft-line",
    type: "line",
    source: "zone-draft",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [1, 1] },
  },
  {
    id: "zone-draft",
    type: "circle",
    source: "zone-draft",
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 4, "circle-color": "#ef4444" },
  },
  {
    id: "planned-route",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "outbound"],
    paint: { "line-color": "#38bdf8", "line-width": 3 },
  },
  {
    id: "planned-route-back",
    type: "line",
    source: "planned-route",
    filter: ["==", ["get", "leg"], "back"],
    paint: { "line-color": "#f8fafc", "line-width": 2, "line-dasharray": [2, 2] },
  },
  {
    id: "route-ends",
    type: "circle",
    source: "route-ends",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "end"], "start", "#7dd3fc", "#fde68a"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#1c0f0a",
    },
  },
];

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
      for (const layer of LAYERS) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map]);

  useEffect(() => setData(map, "planned-route", plan ? routeFeatures(plan) : []), [map, plan]);
  useEffect(() => setData(map, "no-go-zones", zones.map(zoneFeature)), [map, zones]);
  useEffect(() => setData(map, "zone-draft", draftFeatures(draft)), [map, draft]);
  useEffect(
    () => setData(map, "route-ends", [point(start, { end: "start" }), point(end, { end: "end" })]),
    [map, start, end],
  );

  // Re-registered whenever the mode changes, so the handler never sees a stale mode.
  useEffect(() => {
    if (!map || !mode) return;
    const onClick = ({ lngLat }: MapMouseEvent) => {
      const clicked: LngLat = [lngLat.lng, lngLat.lat];
      if (mode === "zone") {
        setDraft((corners) => [...corners, clicked]);
      } else {
        (mode === "start" ? setStart : setEnd)(clicked);
        setMode(null);
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, mode]);

  function finishZone() {
    zonesDrawn.current += 1;
    const n = zonesDrawn.current;
    setZones((current) => [...current, { id: `zone-${n}`, name: `No-go zone ${n}`, ring: draft }]);
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
    <aside className="absolute bottom-4 left-4 w-72 max-w-[calc(100%-2rem)] space-y-3 rounded-lg border bg-background/90 p-4 text-sm shadow-lg backdrop-blur">
      <h2 className="font-heading text-sm font-semibold">Route (A*)</h2>
      <div className="flex flex-wrap gap-2">
        {modeButton("start", "Set start")}
        {modeButton("end", "Set end")}
        {modeButton("zone", "Draw no-go zone")}
        <Button size="xs" variant="outline" disabled={draft.length < 3} onClick={finishZone}>
          Finish zone
        </Button>
        <Button size="xs" variant="outline" onClick={clearZones}>
          Clear zones
        </Button>
      </div>
      <RouteResult plan={plan} loadFailed={loadFailed} />
      <p className="text-xs text-muted-foreground">
        Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.
      </p>
    </aside>
  );
}

function RouteResult({ plan, loadFailed }: { plan: Plan | null; loadFailed: boolean }) {
  if (loadFailed) return <p role="status">Elevation unavailable</p>;
  if (!plan) return <p role="status">Loading elevation…</p>;
  const { outbound, back, summary } = plan;
  if (!summary) {
    const failed = outbound.status !== "ok" ? outbound.status : back.status;
    return <p role="status">{STATUS_MESSAGES[failed as Exclude<RouteStatus, "ok">]}</p>;
  }
  return (
    <div role="status" className="space-y-1">
      <p>Distance one way: {summary.distance_km.toFixed(2)} km</p>
      <p>Out-and-back time: {Math.round(summary.est_time_min)} min</p>
      <p className="text-xs text-muted-foreground">
        Tobler hiking model (Earth, off-path), not a suited Mars walk
      </p>
      <p>Steepest slope: {summary.max_slope.toFixed(1)}°</p>
      <p>Cells searched: {outbound.expanded + back.expanded}</p>
    </div>
  );
}

function setData(map: MapboxMap | null, source: string, features: Feature[]) {
  map?.getSource<GeoJSONSource>(source)?.setData(collection(features));
}

function collection(features: Feature[]) {
  return { type: "FeatureCollection" as const, features };
}

function point(coordinates: LngLat, properties: Record<string, string> = {}): Feature {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

function line(coordinates: LngLat[], properties: Record<string, string> = {}): Feature {
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
}

function routeFeatures({ outbound, back }: Plan): Feature[] {
  return Object.entries({ outbound, back })
    .filter(([, leg]) => leg.status === "ok")
    .map(([name, leg]) => line(leg.path, { leg: name }));
}

// Mapbox needs closed polygon rings; NoGoZone rings are stored open.
function zoneFeature(zone: NoGoZone): Feature {
  const ring = [...zone.ring, zone.ring[0]];
  return {
    type: "Feature",
    properties: { name: zone.name },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function draftFeatures(draft: LngLat[]): Feature[] {
  const corners = draft.map((corner) => point(corner));
  return draft.length > 1 ? [...corners, line(draft)] : corners;
}
