"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { LayerPanelBody } from "@/components/map/layer-panel";
import { HomebaseMapEntry } from "@/components/homebase/map-entry";
import {
  type SiteProps,
  addSites,
  addTerrain,
  habitatLayer,
  setMarsSky,
} from "@/components/map/scene";
import { ScenePanelBody, type SitePoi } from "@/components/map/scene-panel";
import { RouteMapLayers } from "@/components/route/route-map-layers";
import { LaraRouteBridge } from "@/components/route/lara-route-bridge";
import { ConditionsProvider } from "@/components/route/conditions-provider";
import { ExpeditionMapLayer } from "@/components/route/expedition-map-layer";
import { ExpeditionProvider } from "@/components/route/expedition-provider";
import { RoutePlanProvider } from "@/components/route/route-plan-provider";
import { RouteSidebar } from "@/components/route/route-sidebar";
import { SidebarSections } from "@/components/route/sidebar-sections";
import { Kbd } from "@/components/ui/kbd";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import type { LayerManifest, LngLat } from "@/lib/mars/types";

const DATA_ROOT = "/data/processed";
// Placeholder habitat site; matches the "base" stop in stops.geojson.
const HABITAT: LngLat = [-176.05, 45.97];
// Placeholder science stop; matches the "s1" stop in stops.geojson.
const SCIENCE_STOP: LngLat = [-175.95, 46.03];

// sites.geojson from pipelines/stable/hirise-sites.ts: a footprint polygon + a POI point per site.
interface SitesGeoJSON {
  features: { properties: SiteProps; geometry: { type: string; coordinates: unknown } }[];
}

// About 360 px: room for the steps while the map keeps most of a 1280 px screen.
const SIDEBAR_STYLE = { "--sidebar-width": "22.5rem" } as CSSProperties;

// MapLibre assumes Earth, but lng/lat on the Mars 2000 sphere render correctly at AOI scale.
// Its scale bar and measurements use Earth's radius, so we compute distances ourselves.
/** `children` sit over the map and can read the route plan: the verdict strip and LARA. */
export function MarsMap({ children }: { children?: ReactNode }) {
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
          hiriseId: f.properties.hirise_id,
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
            m.on("click", `${layer.id}-point`, (e) => {
              // The sidebar is placing a point with this click, so stay put.
              if (m.getCanvas().dataset.placing) return;
              m.flyTo({ center: e.lngLat, zoom: 15, pitch: 65, duration: 3500 });
            });
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

  // The sidebar reserves its own width, so the map container shrinks beside it and MapLibre's
  // resize observer keeps fits and centring clear of the sidebar.
  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      {/* The route plan is shared by the sidebar and the map layers; it renders no DOM of its own. */}
      <RoutePlanProvider base={HABITAT} target={SCIENCE_STOP} sites={sites}>
        {/* The simulated playback of the planned trip, for step ④ and the map. */}
        <ExpeditionProvider>
          {/* Storm conditions at the habitat, for the route check in the sidebar and the strip. */}
          <ConditionsProvider habitat={HABITAT}>
            <RouteSidebar map={loaded} base={HABITAT} target={SCIENCE_STOP}>
              <SidebarSections
                layers={
                  manifest && (
                    <LayerPanelBody manifest={manifest} visible={visible} onToggle={toggle} />
                  )
                }
                scene={<ScenePanelBody map={loaded} habitat={HABITAT} sites={sites} />}
              />
            </RouteSidebar>
            <div className="relative h-svh min-w-0 flex-1">
              {/* The renderer positions the container relatively, so size it with h-full. */}
              <div ref={container} className="h-full w-full" />
              <RouteMapLayers map={loaded} />
              <LaraRouteBridge map={loaded} />
              <ExpeditionMapLayer map={loaded} />
              <HomebaseMapEntry map={loaded} habitat={HABITAT} />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarTrigger
                      variant="outline"
                      aria-keyshortcuts="H"
                      className="absolute top-4 left-4"
                    />
                  }
                />
                <TooltipPopup side="right">
                  Mission sidebar. Shortcut: <Kbd>H</Kbd>
                </TooltipPopup>
              </Tooltip>
              {error && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-2 py-1 text-xs text-white">
                  {error}
                </div>
              )}
              {cursor && (
                <div className="absolute right-4 bottom-4 rounded-md bg-background/80 px-2 py-1 font-mono text-xs">
                  {cursor[1].toFixed(5)}°N{" "}
                  {(cursor[0] < 0 ? cursor[0] + 360 : cursor[0]).toFixed(5)}
                  °E
                </div>
              )}
              {children}
            </div>
          </ConditionsProvider>
        </ExpeditionProvider>
      </RoutePlanProvider>
    </SidebarProvider>
  );
}
