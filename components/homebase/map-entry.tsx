"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Home } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HomebaseDashboard } from "./dashboard";
import type { LngLat } from "@/lib/mars/types";

/** Keep the map alive underneath a read-only dashboard; closing returns to its exact view. */
export function HomebaseMapEntry({ map, habitat }: { map: MapLibreMap | null; habitat: LngLat }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [lng, lat] = habitat;
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let marker: Marker | undefined;
    const element = document.createElement("div");
    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;
      marker = new Marker({ element, anchor: "bottom", offset: [0, -12] })
        .setLngLat([lng, lat])
        .addTo(map);
      setTarget(element);
    });
    const click = (e: { point: { x: number; y: number } }) => {
      if (map.getZoom() < 7 || map.getCanvas().dataset.placing) return;
      const point = map.project([lng, lat]);
      if (Math.hypot(e.point.x - point.x, e.point.y - point.y) < 28) setOpen(true);
    };
    map.on("click", click);
    return () => {
      cancelled = true;
      marker?.remove();
      setTarget(null);
      map.off("click", click);
    };
  }, [map, lng, lat]);
  const trigger = (
    <button
      type="button"
      className="homebase-map-trigger"
      onClick={() => setOpen(true)}
      aria-label="Open homebase mission dashboard"
    >
      <Home aria-hidden />
      Homebase
    </button>
  );
  return (
    <>
      {target && createPortal(trigger, target)}
      <div className="homebase-map-shortcut">
        <button type="button" className="homebase-map-trigger" onClick={() => setOpen(true)}>
          <Home aria-hidden />
          Mission dashboard
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          className="homebase-map-dialog"
          showCloseButton={false}
          bottomStickOnMobile={false}
          initialFocus={() =>
            document.querySelector<HTMLButtonElement>(".homebase-map-dialog .hb-header button")
          }
        >
          <DialogTitle className="sr-only">Mission dashboard</DialogTitle>
          <DialogDescription className="sr-only">
            Historical environmental reference observations and experiment log. Simulations stay on
            the map.
          </DialogDescription>
          <HomebaseDashboard
            onClose={() => setOpen(false)}
            base={{ latitude_deg: lat, longitude_deg: lng }}
          />
        </DialogPopup>
      </Dialog>
    </>
  );
}
