"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";

import {
  boulderFeatures,
  collection,
  endFeatures,
  journeyFeatures,
  routeFeatures,
  routeLayers,
  setData,
  SOURCES,
  zoneFeature,
} from "@/components/map/route-layers";

import { useRoutePlan } from "./route-plan-provider";

/**
 * Adds the route sources and layers to the map and keeps them in step with the route plan. The
 * zone being drawn is not in the plan yet, so usePlacement fills "zone-draft" itself.
 */
export function RouteMapLayers({ map }: { map: MapLibreMap | null }) {
  const { inputs, walk, journey } = useRoutePlan();
  const { mission, start, end, zones, showShortest } = inputs;

  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    const layers = routeLayers((name) => css.getPropertyValue(name).trim());
    for (const id of SOURCES) map.addSource(id, { type: "geojson", data: collection([]) });
    // Under the stop labels, so text, the route ends and the habitat model stay on top.
    const beforeId = map.getLayer("stops-label") ? "stops-label" : undefined;
    for (const layer of layers) map.addLayer(layer, beforeId);
    return () => {
      if (!map.getStyle()) return; // the parent already called map.remove()
      for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map]);

  // Each mission draws only its own route: the walk's two lines, or the trip's legs and boulders.
  const walkShown = mission === "walking" && walk.plan;
  const trip = journey.plan?.collection;
  const boulders = journey.siteGrid?.boulders;
  useEffect(
    () => setData(map, "planned-route", walkShown ? routeFeatures(walkShown) : []),
    [map, walkShown],
  );
  useEffect(() => setData(map, "journey", trip ? journeyFeatures(trip) : []), [map, trip]);
  useEffect(
    () => setData(map, "boulders", boulders ? boulderFeatures(boulders) : []),
    [map, boulders],
  );
  // The shortest route's lines, only while the operator compares it on the map.
  const shortest = useMemo(() => {
    if (!showShortest) return [];
    if (mission === "walking") return walk.shortest ? routeFeatures(walk.shortest) : [];
    const lines = journey.shortest?.collection?.features ?? [];
    return lines.filter((feature) => feature.geometry.type === "LineString");
  }, [showShortest, mission, walk.shortest, journey.shortest]);
  useEffect(() => setData(map, "shortest-route", shortest), [map, shortest]);
  useEffect(() => setData(map, "no-go-zones", zones.map(zoneFeature)), [map, zones]);
  useEffect(() => setData(map, "route-ends", endFeatures(start, end)), [map, start, end]);

  return null;
}
