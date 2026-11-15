"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";

import {
  MARS_TO_MAP,
  SITE_ATTRIBUTION,
  TERRAIN_SOURCE,
  setSlopeVisible,
  updateTerrain,
} from "@/components/map/scene";
import { GLOBAL_TERRAIN_SOURCE, LOCAL_TERRAIN_SOURCE } from "@/lib/mars/terrain";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { LngLat } from "@/lib/mars/types";
import { DustPlayback } from "./dust-playback";
import { GroundOverlays } from "./ground-overlays";
import { focusHomebase, focusTarget, prefersReducedMotion } from "@/components/route/camera";

// coss Slider reports number | number[]; these sliders are single-thumb.
const single = (set: (v: number) => void) => (v: number | readonly number[]) =>
  set(typeof v === "number" ? v : v[0]);

export interface SitePoi {
  id: string;
  /** Names the site's slope COG, e.g. "ESP_033225_2250". */
  hiriseId: string;
  title: string;
  confirmed: boolean;
  center: LngLat;
}

interface ScenePanelProps {
  map: MapLibreMap | null;
  habitat: LngLat;
  sites: SitePoi[];
  spaceEnabled: boolean;
  onSpaceEnabledChange: (enabled: boolean) => void;
  legendTarget: HTMLDivElement | null;
}

/** Camera, terrain-scale, and archived dust simulation controls. */
export function ScenePanelBody({
  map,
  habitat,
  sites,
  spaceEnabled,
  onSpaceEnabledChange,
  legendTarget,
}: ScenePanelProps) {
  const [exaggeration, setExaggeration] = useState(MARS_TO_MAP);
  const [terrainSource, setTerrainSource] = useState<string | null>(null);
  const [slopeOn, setSlopeOn] = useState(false);

  useEffect(() => {
    if (!map) return;
    const update = () => setTerrainSource(updateTerrain(map, exaggeration) ?? null);
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, exaggeration]);

  useEffect(() => {
    if (map) setSlopeVisible(map, sites, slopeOn);
  }, [map, sites, slopeOn]);

  const fly = (zoom: number, pitch: number, bearing: number) =>
    map?.flyTo({
      center: habitat,
      zoom,
      pitch,
      bearing,
      duration: prefersReducedMotion() ? 0 : 1400,
    });

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3">
        <span>
          Space backdrop
          <span className="block text-xs text-muted-foreground">
            Illustrative stars, galaxies and sun. Not a sky chart.
          </span>
        </span>
        <Switch
          checked={spaceEnabled}
          onCheckedChange={onSpaceEnabledChange}
          aria-label="Show illustrative space backdrop"
        />
      </label>
      <div>
        <p className="mt-1 text-xs text-muted-foreground">
          Terrain: {TERRAIN_SOURCE}. The habitat is an illustration. Planet image: NASA/Viking,
          USGS, and NASA Ames.
        </p>
        <p className="mt-1 font-mono text-sm" role="status">
          {terrainSource?.startsWith("site-dem-")
            ? `Active elevation grid: 1 m HiRISE DTM (${SITE_ATTRIBUTION}).`
            : terrainSource === LOCAL_TERRAIN_SOURCE
              ? "Active elevation grid: 200 m. The image shows more detail than the elevation data."
              : terrainSource === GLOBAL_TERRAIN_SOURCE
                ? "Active elevation grid: 3.7 km. Use it for regional context. It does not show local hazards."
                : terrainSource
                  ? "Active elevation grid: 463 m. The image shows more detail than the elevation data."
                  : "Global image only. Zoom in to see elevation data."}
        </p>
      </div>

      {map && <DustPlayback map={map} legendTarget={legendTarget} />}

      <details>
        <summary className="cursor-pointer font-heading">Terrain and site controls</summary>
        <div className="space-y-4 pt-3">
          <div className="flex gap-2">
            <Button size="xs" variant="outline" onClick={() => focusHomebase(map, habitat)}>
              Fly to habitat
            </Button>
            <Button size="xs" variant="outline" onClick={() => fly(1.5, 0, 0)}>
              View planet
            </Button>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">
              Water-ice sites · HiRISE ~0.45 m/px ({SITE_ATTRIBUTION})
            </p>
            <ul>
              {sites.map((s) => (
                <li key={s.id}>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-auto w-full justify-start py-1 text-left whitespace-normal"
                    onClick={() => focusTarget(map, s.center)}
                  >
                    {s.title}
                    {!s.confirmed && " (unconfirmed)"}
                  </Button>
                </li>
              ))}
            </ul>
            <label className="flex items-center justify-between gap-3 pt-1">
              <span>
                Slope hazard
                <span className="block text-xs text-muted-foreground">
                  Red ≥ 20° · NASA lunar suit limit, assumed for Mars
                </span>
              </span>
              <Switch
                checked={slopeOn}
                onCheckedChange={setSlopeOn}
                aria-label="Toggle slope hazard"
              />
            </label>
          </div>

          <GroundOverlays map={map} sites={sites} />

          <div className="space-y-2">
            <p>
              Terrain exaggeration: {exaggeration.toFixed(2)}×
              {Math.abs(exaggeration - MARS_TO_MAP) < 0.01 && " (true Mars scale)"}
            </p>
            <Slider
              min={MARS_TO_MAP}
              max={40}
              step={0.01}
              value={exaggeration}
              onValueChange={single(setExaggeration)}
              getAriaLabel={() => "Terrain exaggeration"}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
