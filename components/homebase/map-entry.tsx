"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Home } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HomebaseDashboard } from "./dashboard";
import type { LngLat } from "@/lib/mars/types";
import { HomebaseMapLabel } from "./map-label";

/** Keep the map alive underneath a read-only dashboard; closing returns to its exact view. */
export function HomebaseMapEntry({
  map,
  habitat,
  enlarged = false,
  shortcutTarget,
}: {
  map: MapLibreMap | null;
  habitat: LngLat;
  enlarged?: boolean;
  shortcutTarget: HTMLDivElement | null;
}) {
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
      marker = new Marker({ element, anchor: "bottom", offset: [0, enlarged ? -64 : -12] })
        .setLngLat([lng, lat])
        .addTo(map);
      setTarget(element);
    });
    return () => {
      cancelled = true;
      marker?.remove();
      setTarget(null);
    };
  }, [map, lng, lat, enlarged]);
  return (
    <>
      {target && createPortal(<HomebaseMapLabel enlarged={enlarged} />, target)}
      {shortcutTarget &&
        createPortal(
          <button type="button" className="homebase-map-trigger" onClick={() => setOpen(true)}>
            <Home aria-hidden />
            Mission dashboard
          </button>,
          shortcutTarget,
        )}
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
