"use client";

import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Navigation2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./map-compass.css";

export function MapCompass({ map }: { map: MapLibreMap | null }) {
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    const update = () => setBearing(map.getBearing());
    update();
    map.on("rotate", update);
    return () => {
      map.off("rotate", update);
    };
  }, [map]);
  return (
    <Button
      className="map-compass"
      variant="outline"
      disabled={!map}
      aria-label="Reset map to north-up"
      title={`North. Map bearing ${((bearing + 360) % 360).toFixed(0)}°. Reset north-up`}
      onClick={() =>
        map?.easeTo({
          bearing: 0,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250,
        })
      }
    >
      <span
        aria-hidden
        className="map-compass-needle"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <span>N</span>
        <Navigation2 />
      </span>
    </Button>
  );
}
