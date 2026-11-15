import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { LngLat } from "@/lib/mars/types";

/** MapLibre clamps off-globe unprojection to the horizon, so hit-test before reading it. */
export function surfaceCursor(
  map: {
    unproject(point: [number, number]): { lng: number; lat: number };
    project(location: { lng: number; lat: number }): { x: number; y: number };
  },
  point: { x: number; y: number },
): LngLat | null {
  const location = map.unproject([point.x, point.y]);
  if (!Number.isFinite(location.lng) || !Number.isFinite(location.lat)) return null;
  const projected = map.project(location);
  if (Math.hypot(projected.x - point.x, projected.y - point.y) > 2) return null;
  return [location.lng, location.lat];
}

export function useMapCursor(map: MapLibreMap | null): LngLat | null {
  const [cursor, setCursor] = useState<LngLat | null>(null);
  useEffect(() => {
    if (!map) return;
    const canvas = map.getCanvas();
    let pointer: { x: number; y: number } | null = null;
    const clear = () => {
      pointer = null;
      setCursor(null);
    };
    const update = () => {
      if (!pointer || document.elementFromPoint(pointer.x, pointer.y) !== canvas) {
        setCursor(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const point = { x: pointer.x - rect.left, y: pointer.y - rect.top };
      const next = surfaceCursor(map, point);
      setCursor((current) =>
        current?.[0] === next?.[0] && current?.[1] === next?.[1] ? current : next,
      );
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.target !== canvas) return clear();
      pointer = { x: event.clientX, y: event.clientY };
      update();
    };
    document.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    map.on("render", update);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      map.off("render", update);
    };
  }, [map]);
  return cursor;
}
