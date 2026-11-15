"use client";

import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { selectedRoute } from "@/components/route/selected-route";
import { routeToPlan } from "@/components/expedition/route-to-plan";
import { ACTIVITY_LABEL, metres, span } from "@/components/expedition/present";
import { pathLengthM, pointAlong } from "@/lib/mission/position";
import { expeditionDuration } from "@/lib/mission/expedition";
import { useMissionView } from "./mission-view";

const SOURCE = "mission-leg-focus";
const LAYERS = ["mission-leg-casing", "mission-leg-line", "mission-leg-point"];
const empty = { type: "FeatureCollection" as const, features: [] };

export function RouteFocus({ map }: { map: MapLibreMap | null }) {
  const plan = useRoutePlan();
  const { inspectedLeg, inspectLeg } = useMissionView();
  const selection = selectedRoute(plan.inputs, plan);
  const result = useMemo(
    () => routeToPlan(plan.inputs, plan.base, selection.walk, selection.trip),
    [plan.inputs, plan.base, selection.walk, selection.trip],
  );
  const visible = plan.inputs.step === "check";
  const expedition = result.plan;
  const path =
    expedition && inspectedLeg === "travel"
      ? expedition.outbound.path
      : expedition && inspectedLeg === "return"
        ? expedition.back.path
        : null;
  const sciencePoint = expedition?.outbound.path.at(-1);

  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    map.addSource(SOURCE, { type: "geojson", data: empty });
    map.addLayer({
      id: LAYERS[0],
      type: "line",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": css.getPropertyValue("--background").trim(), "line-width": 9 },
    });
    map.addLayer({
      id: LAYERS[1],
      type: "line",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": css.getPropertyValue("--foreground").trim(), "line-width": 4 },
    });
    map.addLayer({
      id: LAYERS[2],
      type: "circle",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": css.getPropertyValue("--background").trim(),
        "circle-radius": 10,
        "circle-stroke-color": css.getPropertyValue("--foreground").trim(),
        "circle-stroke-width": 3,
      },
    });
    const choose = (event: MapLayerMouseEvent) => {
      if (map.getCanvas().dataset.placing) return;
      const properties = event.features?.[0]?.properties;
      if (!properties) return;
      inspectLeg(properties.leg === "back" || properties.to === "staging" ? "return" : "travel");
    };
    const targets = ["planned-route", "planned-route-back", "journey-walk", "journey-walk-return"];
    map.on("click", targets, choose);
    return () => {
      map.off("click", targets, choose);
      if (!map.getStyle()) return;
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, inspectLeg]);

  useEffect(() => {
    const geometry = path
      ? { type: "LineString" as const, coordinates: path }
      : inspectedLeg === "science" && sciencePoint
        ? { type: "Point" as const, coordinates: sciencePoint }
        : null;
    map
      ?.getSource<GeoJSONSource>(SOURCE)
      ?.setData(
        visible && geometry
          ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] }
          : empty,
      );
  }, [map, visible, path, sciencePoint, inspectedLeg]);

  useEffect(() => {
    if (!map || !visible || !expedition) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const position = pointAlong(
      expedition.outbound.path,
      pathLengthM(expedition.outbound.path) / 2,
    );
    const element = document.createElement("div");
    element.className = "route-map-readout";
    const title = document.createElement("strong");
    title.textContent = inspectedLeg
      ? `Inspecting ${ACTIVITY_LABEL[inspectedLeg].toLowerCase()}`
      : `Selected route · ${selection.choice}`;
    const detail = document.createElement("span");
    detail.textContent = `${metres(pathLengthM(expedition.outbound.path) + pathLengthM(expedition.back.path))} on foot · ${span(expeditionDuration(expedition))} incl. prep + recovery`;
    element.append(title, detail);
    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;
      const marker = new Marker({ element, anchor: "bottom", offset: [0, -18] })
        .setLngLat(position)
        .addTo(map);
      remove = () => marker.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [map, visible, expedition, inspectedLeg, selection.choice]);
  return null;
}
