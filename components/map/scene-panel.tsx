"use client";

import type { Map as MapboxMap } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

import { MARS_TO_MAP, TERRAIN_SOURCE, setDustStorm, updateTerrain } from "@/components/map/scene";
import { GLOBAL_TERRAIN_SOURCE, LOCAL_TERRAIN_SOURCE } from "@/lib/mars/terrain";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { LngLat } from "@/lib/mars/types";

// coss Slider reports number | number[]; these sliders are single-thumb.
const single = (set: (v: number) => void) => (v: number | readonly number[]) =>
  set(typeof v === "number" ? v : v[0]);

interface ScenePanelProps {
  map: MapboxMap | null;
  habitat: LngLat;
}

/** Camera, terrain-scale, and dust-storm controls. The storm will be driven by the live feed later. */
export function ScenePanel({ map, habitat }: ScenePanelProps) {
  const [exaggeration, setExaggeration] = useState(MARS_TO_MAP);
  const [intensity, setIntensity] = useState(0);
  const [windFromDeg, setWindFromDeg] = useState(270);
  const [terrainSource, setTerrainSource] = useState<string | null>(null);
  const current = useRef(intensity);
  current.current = intensity;

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
    if (map) setDustStorm(map, intensity, windFromDeg);
  }, [map, intensity, windFromDeg]);

  // Ramp the storm in or out over ~4 s, like a replayed feed event arriving.
  function rampStorm(to: number) {
    const from = current.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 4000);
      setIntensity(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const fly = (zoom: number, pitch: number, bearing: number) =>
    map?.flyTo({ center: habitat, zoom, pitch, bearing, duration: 3500 });

  return (
    <aside className="absolute top-4 right-4 w-72 max-w-[calc(100%-2rem)] space-y-4 rounded-lg border bg-background/90 p-4 text-sm shadow-lg backdrop-blur">
      <div>
        <h2 className="font-heading text-sm font-semibold">Scene</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Terrain: {TERRAIN_SOURCE}. Habitat and dust storm are illustrative, not data. Planet
          image: NASA/USGS/Ames via NASA Trek.
        </p>
        <p className="mt-1 font-mono text-sm" role="status">
          {terrainSource === LOCAL_TERRAIN_SOURCE
            ? "Active elevation grid: 200 m. Fine image detail is not terrain accuracy."
            : terrainSource === GLOBAL_TERRAIN_SOURCE
              ? "Active elevation grid: 3.7 km. Regional context, not local hazards."
              : terrainSource
                ? "Active elevation grid: 463 m. Fine image detail is not terrain accuracy."
                : "Global image overview. Zoom in for elevation data."}
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => fly(18, 70, -30)}>
          Fly to habitat
        </Button>
        <Button size="xs" variant="outline" onClick={() => fly(1.5, 0, 0)}>
          View planet
        </Button>
      </div>

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

      <div className="flex gap-2">
        <Button size="xs" variant="destructive" onClick={() => rampStorm(1)}>
          Trigger dust storm
        </Button>
        <Button size="xs" variant="outline" onClick={() => rampStorm(0)}>
          Clear
        </Button>
      </div>

      <div className="space-y-2">
        <p>Storm intensity: {intensity.toFixed(2)}</p>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={intensity}
          onValueChange={single(setIntensity)}
          getAriaLabel={() => "Storm intensity"}
        />
      </div>
      <div className="space-y-2">
        <p>Wind from: {windFromDeg}°</p>
        <Slider
          min={0}
          max={359}
          value={windFromDeg}
          onValueChange={single(setWindFromDeg)}
          getAriaLabel={() => "Wind direction"}
        />
      </div>
    </aside>
  );
}
