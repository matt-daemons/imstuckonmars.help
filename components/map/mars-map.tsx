"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { LayerPanel } from "@/components/map/layer-panel";
import type { LayerManifest, LngLat } from "@/lib/mars/types";

const DATA_ROOT = "/data/processed";

// MapLibre assumes Earth, but lng/lat on the Mars 2000 sphere render correctly at AOI scale.
// Its scale bar and measurements use Earth's radius, so we compute distances ourselves.
export function MarsMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState<LngLat | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [{ default: maplibregl }, data] = await Promise.all([
        import("maplibre-gl"),
        fetch(`${DATA_ROOT}/manifest.json`).then((r) => r.json() as Promise<LayerManifest>),
      ]);
      if (cancelled || !container.current) return;

      setManifest(data);
      setVisible(Object.fromEntries(data.layers.map((l) => [l.id, l.visible ?? true])));

      const m = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#3a1f14" } }],
        },
        center: data.aoi.center,
        zoom: data.aoi.zoom,
        attributionControl: false,
        renderWorldCopies: false,
      });
      map.current = m;

      m.on("mousemove", (e) => setCursor([e.lngLat.lng, e.lngLat.lat]));
      m.on("load", () => {
        for (const layer of data.layers) {
          const url = `${DATA_ROOT}/${layer.path}`;
          const visibility = (layer.visible ?? true) ? "visible" : "none";

          if (layer.kind === "raster" && layer.corners) {
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
      });
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
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

  return (
    <div className="relative h-svh w-full">
      {/* maplibre-gl.css forces position: relative on the container, so size it with h-full, not inset-0. */}
      <div ref={container} className="h-full w-full" />
      {manifest && <LayerPanel manifest={manifest} visible={visible} onToggle={toggle} />}
      {cursor && (
        <div className="absolute right-4 bottom-4 rounded-md bg-background/80 px-2 py-1 font-mono text-xs">
          {cursor[1].toFixed(5)}°N {(cursor[0] < 0 ? cursor[0] + 360 : cursor[0]).toFixed(5)}°E
        </div>
      )}
    </div>
  );
}
