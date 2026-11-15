"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import type { Map as MapboxMap } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

import { LayerPanel } from "@/components/map/layer-panel";
import { RoutePlanner } from "@/components/map/route-planner";
import { addTerrain, habitatLayer, setDustStorm } from "@/components/map/scene";
import { ScenePanel } from "@/components/map/scene-panel";
import type { LayerManifest, LngLat } from "@/lib/mars/types";

const DATA_ROOT = "/data/processed";
// Public pk.* token, inlined at build time. Set in .env.local (local) and the deploy build env.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Placeholder habitat site; matches the "base" stop in stops.geojson.
const HABITAT: LngLat = [-176.05, 45.97];
// Placeholder science stop; matches the "s1" stop in stops.geojson.
const SCIENCE_STOP: LngLat = [-175.95, 46.03];

// Mapbox assumes Earth, but lng/lat on the Mars 2000 sphere render correctly at AOI scale.
// Its scale bar and measurements use Earth's radius, so we compute distances ourselves.
export function MarsMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [loaded, setLoaded] = useState<MapboxMap | null>(null);
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;

    (async () => {
      const [{ default: mapboxgl }, data] = await Promise.all([
        import("mapbox-gl"),
        fetch(`${DATA_ROOT}/manifest.json`).then((r) => r.json() as Promise<LayerManifest>),
      ]);
      if (cancelled || !container.current) return;

      setManifest(data);
      setVisible(Object.fromEntries(data.layers.map((l) => [l.id, l.visible ?? true])));

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const m = new mapboxgl.Map({
        container: container.current,
        // Globe is display geometry; coordinates and metric calculations remain Mars-specific.
        projection: "globe",
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#3a1f14" } }],
        },
        center: data.aoi.center,
        zoom: 1.5,
        pitch: 0,
        bearing: 0,
        maxPitch: 85,
        attributionControl: false,
      });
      map.current = m;

      m.on("error", (e) => setError(e.error?.message ?? "Map error"));
      m.on("mousemove", (e) => setCursor([e.lngLat.lng, e.lngLat.lat]));
      m.on("load", () => {
        addTerrain(m);
        setDustStorm(m, 0, 270);

        for (const layer of data.layers) {
          const url = new URL(layer.path, `${location.origin}${DATA_ROOT}/`).href;
          const visibility = (layer.visible ?? true) ? "visible" : "none";

          if (layer.kind === "raster" && layer.tiles) {
            m.addSource(layer.id, {
              type: "raster",
              tiles: layer.tiles,
              tileSize: 256,
              bounds: layer.tileBounds,
              minzoom: layer.minzoom,
              maxzoom: layer.maxzoom,
              attribution: layer.source.name,
            });
            m.addLayer({
              id: layer.id,
              type: "raster",
              source: layer.id,
              layout: { visibility },
              paint: { "raster-opacity": layer.opacity ?? 1 },
            });
          } else if (layer.kind === "raster" && layer.corners) {
            m.addSource(layer.id, { type: "image", url, coordinates: layer.corners });
            m.addLayer({
              id: layer.id,
              type: "raster",
              source: layer.id,
              layout: { visibility },
              paint: { "raster-opacity": layer.opacity ?? 0.8 },
            });
          } else if (layer.kind === "vector") {
            m.addSource(layer.id, { type: "geojson", data: url });
            m.addLayer({
              id: `${layer.id}-line`,
              type: "line",
              source: layer.id,
              filter: ["==", ["geometry-type"], "LineString"],
              layout: { visibility },
              paint: { "line-color": "#f4a259", "line-width": 3 },
            });
            m.addLayer({
              id: `${layer.id}-point`,
              type: "circle",
              source: layer.id,
              filter: ["==", ["geometry-type"], "Point"],
              layout: { visibility },
              paint: {
                "circle-radius": 7,
                "circle-color": ["match", ["get", "kind"], "base", "#7dd3fc", "#fde68a"],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#1c0f0a",
              },
            });
          }
        }
        m.addLayer(habitatLayer(mapboxgl, HABITAT));
        setLoaded(m);
      });
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setLoaded(null);
    };
  }, []);

  function toggle(id: string, on: boolean) {
    setVisible((v) => ({ ...v, [id]: on }));
    const m = map.current;
    if (!m) return;
    for (const layerId of [id, `${id}-line`, `${id}-point`]) {
      if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Map unavailable: set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local and restart the dev server.
      </div>
    );
  }

  return (
    <div className="relative h-svh w-full">
      {/* mapbox-gl.css forces position: relative on the container, so size it with h-full, not inset-0. */}
      <div ref={container} className="h-full w-full" />
      {manifest && <LayerPanel manifest={manifest} visible={visible} onToggle={toggle} />}
      <ScenePanel map={loaded} habitat={HABITAT} />
      <RoutePlanner map={loaded} base={HABITAT} target={SCIENCE_STOP} />
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-2 py-1 text-xs text-white">
          {error}
        </div>
      )}
      {cursor && (
        <div className="absolute right-4 bottom-4 rounded-md bg-background/80 px-2 py-1 font-mono text-xs">
          {cursor[1].toFixed(5)}°N {(cursor[0] < 0 ? cursor[0] + 360 : cursor[0]).toFixed(5)}°E
        </div>
      )}
    </div>
  );
}
