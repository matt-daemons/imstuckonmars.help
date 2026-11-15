"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

export function overlayInsets(
  full: Pick<DOMRect, "left" | "bottom">,
  visible: Pick<DOMRect, "left" | "bottom">,
) {
  return {
    left: Math.max(0, visible.left - full.left),
    bottom: Math.max(0, full.bottom - visible.bottom),
    top: 0,
    right: 0,
  };
}

/** Camera padding and built-in map controls follow the unobstructed overlay area. */
export function MapOverlayViewport({
  map,
  children,
}: {
  map: MapLibreMap | null;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!map || !element) return;
    const canvas = map.getContainer();
    const update = () => {
      const full = canvas.getBoundingClientRect();
      const visible = element.getBoundingClientRect();
      const padding = overlayInsets(full, visible);
      const { left, bottom } = padding;
      canvas.style.setProperty("--map-overlay-left", `${left}px`);
      canvas.style.setProperty("--map-overlay-bottom", `${bottom}px`);
      map.setPadding(padding);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(canvas);
    update();
    return () => observer.disconnect();
  }, [map]);
  return (
    <div ref={viewport} className="map-overlay-viewport relative min-h-0 flex-1">
      {children}
    </div>
  );
}
