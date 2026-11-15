"use client";

import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import { useLaraAction } from "@/components/copilot/lara-bridge";
import { collection, setData, type Feature } from "@/components/map/route-layers";
import { travelledLines } from "@/lib/mars/expedition";
import type { LngLat, TravelMode } from "@/lib/mars/types";

import { SIMULATED_LABEL } from "./expedition";
import { useExpedition } from "./expedition-provider";
import { useRoutePlan } from "./route-plan-provider";

const SOURCE = "expedition";
// Close enough to follow the rover across the drive strip, or the crew around the site.
const ROVER_ZOOM: Record<TravelMode, number> = { drive: 11, walk: 15 };
const MARKER_LABELS: Record<TravelMode, string> = {
  drive: "Rover (simulated)",
  walk: "Crew on foot (simulated)",
};

type ExpeditionFeature = Feature<{ kind: "followed" | "travelled" | "marker"; mode: TravelMode }>;

/**
 * The simulated expedition on the map: the part of the route travelled so far, and a marker for
 * the rover or, on the walk, the crew. A shortest route being played is drawn in full as well,
 * since the map's journey lines show the safest one. Handles LARA's focus_map for the rover.
 */
export function ExpeditionMapLayer({ map }: { map: MapLibreMap | null }) {
  const { inputs } = useRoutePlan();
  const { followed, timeline, state, playback } = useExpedition();

  useLaraAction("focus_map", ({ target }) => {
    if (target !== "rover" || !state) return;
    map?.flyTo({ center: state.position, zoom: ROVER_ZOOM[state.mode] });
  });

  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    const layers = expeditionLayers((name) => css.getPropertyValue(name).trim());
    map.addSource(SOURCE, { type: "geojson", data: collection([]) });
    // Over the route lines, under the stop labels.
    const beforeId = map.getLayer("stops-label") ? "stops-label" : undefined;
    for (const layer of layers) map.addLayer(layer, beforeId);
    return () => {
      if (!map.getStyle()) return; // the parent already called map.remove()
      for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map]);

  const isShown = timeline !== null && (inputs.step === "go" || playback !== "idle");
  const followedLines = useMemo(
    () =>
      followed.following === "shortest" && timeline
        ? timeline.legs.map((leg) => line(leg.coordinates, "followed", leg.mode))
        : [],
    [followed.following, timeline],
  );
  const features = useMemo((): ExpeditionFeature[] => {
    if (!isShown || !timeline || !state) return [];
    const travelled = travelledLines(timeline, state)
      .filter((part) => part.coordinates.length > 1)
      .map((part) => line(part.coordinates, "travelled", part.mode));
    const marker: ExpeditionFeature = {
      type: "Feature",
      properties: { kind: "marker", mode: state.mode },
      geometry: { type: "Point", coordinates: state.position },
    };
    return [...followedLines, ...travelled, marker];
  }, [isShown, timeline, state, followedLines]);
  useEffect(() => setData(map, SOURCE, features), [map, features]);

  return map && isShown ? <SimulationLabel map={map} /> : null;
}

/** On the map itself, so the moving marker is never read as a live position. */
function SimulationLabel({ map }: { map: MapLibreMap }) {
  // font-sans and text-sm: the map's container sets a font of its own.
  return createPortal(
    <p className="absolute top-16 left-4 max-w-72 border border-dashed border-info bg-background/90 p-2 font-sans text-sm backdrop-blur">
      {SIMULATED_LABEL}
    </p>,
    map.getContainer(),
  );
}

function line(coordinates: LngLat[], kind: "followed" | "travelled", mode: TravelMode) {
  return {
    type: "Feature" as const,
    properties: { kind, mode },
    geometry: { type: "LineString" as const, coordinates },
  };
}

function expeditionLayers(token: (name: string) => string): LayerSpecification[] {
  const background = token("--background");
  const foreground = token("--foreground");
  const modeColor: ExpressionSpecification = [
    "match",
    ["get", "mode"],
    "walk",
    token("--route-walk"),
    token("--primary"),
  ];
  const kind = (value: string): ExpressionSpecification => ["==", ["get", "kind"], value];
  return [
    {
      id: "expedition-followed",
      type: "line",
      source: SOURCE,
      filter: kind("followed"),
      paint: { "line-color": foreground, "line-width": 2, "line-dasharray": [1, 1.5] },
    },
    {
      id: "expedition-travelled-casing",
      type: "line",
      source: SOURCE,
      filter: kind("travelled"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": background, "line-width": 9 },
    },
    {
      id: "expedition-travelled",
      type: "line",
      source: SOURCE,
      filter: kind("travelled"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": modeColor, "line-width": 5 },
    },
    {
      id: "expedition-marker",
      type: "circle",
      source: SOURCE,
      filter: kind("marker"),
      paint: {
        "circle-color": modeColor,
        "circle-radius": 8,
        "circle-stroke-width": 3,
        "circle-stroke-color": foreground,
      },
    },
    {
      id: "expedition-marker-label",
      type: "symbol",
      source: SOURCE,
      filter: kind("marker"),
      layout: {
        "text-field": ["match", ["get", "mode"], "walk", MARKER_LABELS.walk, MARKER_LABELS.drive],
        "text-size": 12,
        "text-font": getComputedStyle(document.body)
          .fontFamily.split(",")
          .map((family) => family.trim().replaceAll('"', "")),
        "text-offset": [0, 1.3],
        "text-anchor": "top",
        "text-allow-overlap": true,
      },
      paint: { "text-color": foreground, "text-halo-color": background, "text-halo-width": 1.5 },
    },
  ];
}
