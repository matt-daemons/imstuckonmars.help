"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";

import { LayerPanel } from "@/components/map/layer-panel";
import {
  type SiteProps,
  addSites,
  addTerrain,
  addThermalInertia,
  habitatLayer,
  setMarsSky,
} from "@/components/map/scene";
import { ScenePanel, type SitePoi } from "@/components/map/scene-panel";
import type { LayerManifest, LngLat } from "@/lib/mars/types";

const DATA_ROOT = "/data/processed";
// Placeholder habitat site; matches the "base" stop in stops.geojson.
const HABITAT: LngLat = [-176.05, 45.97];

// sites.geojson from pipelines/stable/hirise-sites.ts: a footprint polygon + a POI point per site.
interface SitesGeoJSON {
  features: { properties: SiteProps; geometry: { type: string; coordinates: unknown } }[];
}

// MapLibre assumes Earth, but lng/lat on the Mars 2000 sphere render correctly at AOI scale.
// Its scale bar and measurements use Earth's radius, so we compute distances ourselves.
export function MarsMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState<MapLibreMap | null>(null);
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<SitePoi[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [maplibregl, data, siteData] = await Promise.all([
        import("maplibre-gl"),
        fetch(`${DATA_ROOT}/manifest.json`).then((r) => r.json() as Promise<LayerManifest>),
        fetch(`${DATA_ROOT}/sites.geojson`)
          .then((r) => r.json() as Promise<SitesGeoJSON>)
          .catch((): SitesGeoJSON => ({ features: [] })),
      ]);
      const pois = siteData.features.filter((f) => f.properties.kind === "poi");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(mapWorkerUrl);

      setManifest(data);
      setSites(
        pois.map((f) => ({
          id: f.properties.id,
          title: f.properties.title,
          confirmed: f.properties.confirmed,
          center: f.geometry.coordinates as LngLat,
        })),
      );
      setVisible(Object.fromEntries(data.layers.map((l) => [l.id, l.visible ?? true])));

      const m = new maplibregl.Map({
        container: container.current,
        // Globe is display geometry; coordinates and metric calculations remain Mars-specific.
        style: {
          version: 8,
          projection: { type: "globe" },
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
      // Credits every source's attribution (HiRISE: NASA/JPL/University of Arizona).
      m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      m.on("error", (e) => setError(e.error?.message ?? "Map error"));
      m.on("mousemove", (e) => setCursor([e.lngLat.lng, e.lngLat.lat]));
      m.on("load", () => {
        addTerrain(m);
        addThermalInertia(m);
        addSites(
          m,
          pois.map((f) => f.properties),
        );
        setMarsSky(m);

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
              filter: ["match", ["geometry-type"], ["LineString", "Polygon"], true, false],
              layout: { visibility },
              paint: {
                // Site footprints: thin light outline; routes: orange.
                "line-color": ["match", ["get", "kind"], "footprint", "#f5ede4", "#f4a259"],
                "line-width": ["match", ["get", "kind"], "footprint", 1.5, 3],
              },
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
            m.addLayer({
              id: `${layer.id}-label`,
              type: "symbol",
              source: layer.id,
              filter: ["==", ["geometry-type"], "Point"],
              layout: {
                visibility,
                "text-field": ["coalesce", ["get", "title"], ["get", "name"], ""],
                "text-size": 12,
                "text-font": getComputedStyle(document.body)
                  .fontFamily.split(",")
                  .map((family) => family.trim().replaceAll('"', "")),
                "text-offset": [0, 1.2],
                "text-anchor": "top",
                "text-max-width": 14,
              },
              paint: {
                "text-color": "#fbeee0",
                "text-halo-color": "#1c0f0a",
                "text-halo-width": 1.5,
              },
            });
            // Click a POI to fly in for the sub-metre HiRISE view.
            m.on("click", `${layer.id}-point`, (e) =>
              m.flyTo({ center: e.lngLat, zoom: 15, pitch: 65, duration: 3500 }),
            );
          }
        }
        m.addLayer(habitatLayer(maplibregl, HABITAT));
        setLoaded(m);
      });
    })().catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : "Map failed to load");
    });

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
    for (const layerId of [id, `${id}-line`, `${id}-point`, `${id}-label`]) {
      if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    }
  }

  return (
    <div className="relative h-svh w-full">
      {/* The renderer positions the container relatively, so size it with h-full. */}
      <div ref={container} className="h-full w-full" />
      {manifest && <LayerPanel manifest={manifest} visible={visible} onToggle={toggle} />}
      <ScenePanel map={loaded} habitat={HABITAT} sites={sites} />
      {error && (
        <div className="absolute bottom-4 left-4 rounded-md bg-destructive px-2 py-1 text-xs text-white">
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
