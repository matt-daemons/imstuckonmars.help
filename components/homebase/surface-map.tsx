"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Button } from "@/components/ui/button";
import { Home, Crosshair } from "lucide-react";
import { formatNumber } from "@/lib/mission/format";
import {
  ARCADIA_IMAGERY_BOUNDS,
  CONTEXT_TILES,
  contextMinZoom,
  hasSurfaceContext,
  type HOMEBASE,
} from "@/lib/homebase/context";

export function SurfaceMap({ base }: { base: typeof HOMEBASE }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ latitude_deg: number; longitude_deg: number } | null>(
    null,
  );
  const supported = hasSurfaceContext(base.latitude_deg, base.longitude_deg);
  const position = cursor ?? base;

  useEffect(() => {
    if (!supported || !container.current) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let instance: MapLibreMap | undefined;
    setReady(false);
    setError(null);
    setCursor(null);
    void import("maplibre-gl")
      .then((renderer) => {
        if (cancelled || !container.current) return;
        renderer.setWorkerUrl(mapWorkerUrl);
        const [west, south, east, north] = ARCADIA_IMAGERY_BOUNDS;
        const element = container.current;
        const minimum = contextMinZoom(element.clientWidth, element.clientHeight);
        instance = new renderer.Map({
          container: element,
          center: [base.longitude_deg, base.latitude_deg],
          zoom: minimum,
          minZoom: minimum,
          maxZoom: Math.max(18, minimum),
          maxBounds: [
            [west, south],
            [east, north],
          ],
          renderWorldCopies: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
          attributionControl: false,
          style: {
            version: 8,
            sources: {
              context: {
                type: "raster",
                tiles: [CONTEXT_TILES],
                tileSize: 256,
                minzoom: 9,
                maxzoom: 14,
                bounds: [...ARCADIA_IMAGERY_BOUNDS],
              },
            },
            layers: [
              {
                id: "context",
                type: "raster",
                source: "context",
                paint: { "raster-fade-duration": 0 },
              },
            ],
          },
        });
        const current = instance;
        map.current = current;
        current.touchZoomRotate.disableRotation();
        current.keyboard.disableRotation();
        current.on("mousemove", ({ lngLat }) =>
          setCursor({ latitude_deg: lngLat.lat, longitude_deg: lngLat.lng }),
        );
        current.on("mouseout", () => setCursor(null));
        current
          .getCanvas()
          .setAttribute(
            "aria-label",
            "Arcadia surface map. Arrow keys pan; plus and minus zoom. Movement is limited to acquired imagery.",
          );
        const marker = document.createElement("div");
        marker.className = "hb-context-marker";
        marker.textContent = "Base · assumed";
        new renderer.Marker({ element: marker, anchor: "left" })
          .setLngLat([base.longitude_deg, base.latitude_deg])
          .addTo(current);
        current.on("load", () => {
          if (!cancelled) setReady(true);
        });
        current.on("error", () => {
          if (!cancelled) setError("Some orbital tiles could not load. Reset the view or retry.");
        });
        observer = new ResizeObserver(() => {
          current.resize();
          const nextMinimum = contextMinZoom(element.clientWidth, element.clientHeight);
          current.setMaxZoom(Math.max(18, nextMinimum));
          current.setMinZoom(nextMinimum);
          if (current.getZoom() < nextMinimum) current.setZoom(nextMinimum);
        });
        observer.observe(element);
      })
      .catch(() => {
        if (!cancelled) setError("Surface map could not load. Reopen the dashboard to retry.");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, [base.latitude_deg, base.longitude_deg, supported]);

  return (
    <>
      <figure
        className="hb-orbital"
        aria-label="Bounded CTX orbital map around the hypothetical Arcadia base. Not weather imagery or a validated route."
      >
        <div ref={container} className="hb-context-map" />
        {supported && (
          <div className="hb-context-controls" aria-label="Surface map controls">
            <Button
              size="sm"
              variant="outline"
              disabled={!ready}
              aria-label="Zoom in surface map"
              onClick={() => map.current?.zoomIn({ duration: 0 })}
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready}
              aria-label="Zoom out surface map"
              onClick={() => map.current?.zoomOut({ duration: 0 })}
            >
              −
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready}
              onClick={() => {
                const current = map.current;
                if (current)
                  current.jumpTo({
                    center: [base.longitude_deg, base.latitude_deg],
                    zoom: current.getMinZoom(),
                    bearing: 0,
                    pitch: 0,
                  });
              }}
            >
              Reset view
            </Button>
          </div>
        )}
        <p className="hb-context-status" role="status">
          {!supported
            ? "Orbital imagery unavailable at this base."
            : (error ?? (!ready ? "Loading surface map…" : ""))}
        </p>
        <figcaption>CTX · NASA/JPL/MSSS/Caltech · Murray Lab/Esri</figcaption>
      </figure>
      <div className="hb-base-position">
        {cursor ? <Crosshair size={18} aria-hidden /> : <Home size={18} aria-hidden />}
        <span>{cursor ? "Cursor" : "Map base"}</span>
        <span className="font-mono">
          {formatNumber(Math.abs(position.latitude_deg), 4)}°{position.latitude_deg < 0 ? "S" : "N"}{" "}
          · {formatNumber(((position.longitude_deg % 360) + 360) % 360, 4)}°E
        </span>
      </div>
    </>
  );
}
