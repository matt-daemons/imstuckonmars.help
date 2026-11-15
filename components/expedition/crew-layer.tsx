"use client";

import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { crewPositionAt, cutPath, pathLengthM, restPath } from "@/lib/mission/position";
import type { ExpeditionRoute, MarsLngLat } from "@/lib/mission/types";

import { useExpedition } from "./expedition-provider";

const TRAIL = "expedition-trail";
const AHEAD = "expedition-ahead";
const PHASE_LABEL = {
  shelter: "At shelter",
  outbound: "Walking out",
  science: "Sampling",
  inbound: "Walking back",
} as const;

type Line = {
  type: "Feature";
  properties: object;
  geometry: { type: "LineString"; coordinates: MarsLngLat[] };
};
const line = (coordinates: MarsLngLat[]): Line => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates },
});

/** The walked trail and the path still ahead at mission time `t`. */
export function splitRoute(route: ExpeditionRoute, t: number) {
  const trail: Line[] = [];
  const ahead: Line[] = [];
  for (const leg of route.legs) {
    if (leg.activity === "science") continue;
    if (t >= leg.end_s) trail.push(line(leg.path));
    else if (t <= leg.start_s) ahead.push(line(leg.path));
    else {
      const along = (pathLengthM(leg.path) * (t - leg.start_s)) / (leg.end_s - leg.start_s);
      trail.push(line(cutPath(leg.path, along)));
      ahead.push(line(restPath(leg.path, along)));
    }
  }
  return { trail, ahead };
}

export function routeBounds(route: ExpeditionRoute): LngLatBoundsLike {
  const points = [route.shelter_lnglat, ...route.legs.flatMap((leg) => leg.path)];
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The simulated crew on the map. The marker moves every frame from the same deterministic
 * position function the server uses, extrapolated from the last snapshot's clock; resources
 * stay as the server reported them.
 */
export function CrewLayer({ map }: { map: MapLibreMap | null }) {
  const expedition = useExpedition();
  const { snapshot, clockAt, follow, setFollow } = expedition;
  const route = snapshot?.config.route ?? null;
  const routeKey = route ? `${route.id}:${snapshot!.revision}` : null;
  const marker = useRef<Marker | null>(null);
  const label = useRef<HTMLSpanElement | null>(null);
  const clockRef = useRef(clockAt);
  clockRef.current = clockAt;
  const followRef = useRef(follow);
  followRef.current = follow;
  const playing = snapshot?.clock.mode === "playing";

  // Sources and layers live as long as the map.
  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const empty = { type: "FeatureCollection" as const, features: [] };
    map.addSource(TRAIL, { type: "geojson", data: empty });
    map.addSource(AHEAD, { type: "geojson", data: empty });
    const layers = [
      {
        id: `${AHEAD}-line`,
        type: "line" as const,
        source: AHEAD,
        paint: {
          "line-color": token("--foreground"),
          "line-width": 2,
          "line-dasharray": [1.5, 1.5],
        },
      },
      {
        id: `${TRAIL}-casing`,
        type: "line" as const,
        source: TRAIL,
        paint: { "line-color": token("--background"), "line-width": 7 },
      },
      {
        id: `${TRAIL}-line`,
        type: "line" as const,
        source: TRAIL,
        paint: { "line-color": token("--foreground"), "line-width": 4 },
      },
    ];
    for (const layer of layers)
      map.addLayer({ ...layer, layout: { "line-cap": "round", "line-join": "round" } });
    const stopFollowing = () => setFollow(false);
    map.on("dragstart", stopFollowing);
    return () => {
      map.off("dragstart", stopFollowing);
      if (!map.getStyle()) return;
      for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      for (const id of [TRAIL, AHEAD]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, setFollow]);

  // The crew marker exists while an expedition is loaded.
  useEffect(() => {
    if (!map || !route) return;
    let cancelled = false;
    const element = document.createElement("div");
    element.className = "expedition-crew";
    element.setAttribute("role", "img");
    element.innerHTML = `<span class="expedition-crew-pulse"></span><span class="expedition-crew-dot"></span><span class="expedition-crew-label"></span>`;
    label.current = element.querySelector(".expedition-crew-label");
    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;
      marker.current = new Marker({ element }).setLngLat(route.shelter_lnglat).addTo(map);
    });
    return () => {
      cancelled = true;
      marker.current?.remove();
      marker.current = null;
    };
    // A new expedition (route id) recreates the marker; revisions only move it.
  }, [map, route?.id]);

  // Frame the whole expedition when one is loaded.
  const routeId = route?.id;
  useEffect(() => {
    if (!map || !route) return;
    map.fitBounds(routeBounds(route), {
      padding: { top: 90, bottom: 60, left: 60, right: 60 },
      maxZoom: 15.5,
      pitch: 45,
      duration: reducedMotion() ? 0 : 2400,
    });
  }, [map, routeId]);

  // Move the marker every frame; redraw the trail a few times a second.
  useEffect(() => {
    if (!map || !route) return;
    let frame = 0;
    let lastTrail = -Infinity;
    let lastFollow = -Infinity;
    const tick = (ms: number) => {
      const t = clockRef.current(Date.now());
      const position = crewPositionAt(route, t);
      marker.current?.setLngLat(position.lnglat);
      if (label.current) {
        const text = `Crew ×2 · ${PHASE_LABEL[position.phase]}`;
        if (label.current.textContent !== text) {
          label.current.textContent = text;
          label.current.parentElement?.setAttribute(
            "aria-label",
            `Simulated crew, ${PHASE_LABEL[position.phase].toLowerCase()}`,
          );
          label.current.parentElement?.setAttribute("data-phase", position.phase);
        }
      }
      if (ms - lastTrail > 200) {
        lastTrail = ms;
        const { trail, ahead } = splitRoute(route, t);
        map
          .getSource<GeoJSONSource>(TRAIL)
          ?.setData({ type: "FeatureCollection", features: trail });
        map
          .getSource<GeoJSONSource>(AHEAD)
          ?.setData({ type: "FeatureCollection", features: ahead });
      }
      if (followRef.current && playing && ms - lastFollow > 1000 && !map.isMoving()) {
        lastFollow = ms;
        map.easeTo({
          center: position.lnglat,
          duration: reducedMotion() ? 0 : 950,
          easing: (x) => x,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, routeKey, playing]);

  // Clear the lines when no expedition is loaded.
  useEffect(() => {
    if (!map || route) return;
    const empty = { type: "FeatureCollection" as const, features: [] };
    map.getSource<GeoJSONSource>(TRAIL)?.setData(empty);
    map.getSource<GeoJSONSource>(AHEAD)?.setData(empty);
  }, [map, route]);

  return null;
}
