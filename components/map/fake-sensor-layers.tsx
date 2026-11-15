"use client";

import { useEffect } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { FAKE_LAYERS, fakeFrame, type FakeScalar } from "@/lib/mars/fake-sensors";
import type { FakeSensorMode } from "./use-fake-sensor-mode";

export const FAKE_SOURCE = "fake-future-sensors";
export const FAKE_LAYER_IDS = [
  "fake-storm",
  "fake-wind",
  ...FAKE_LAYERS.filter((layer) => layer.id !== "wind").map((layer) => `fake-${layer.id}`),
];
export const FAKE_COLORS = ["#648bff", "#dbe6ef", "#db945d"];
const offsets: Record<FakeScalar, [number, number]> = {
  ground: [-12, -18],
  air: [12, -18],
  hardness: [22, 0],
  pressure: [12, 18],
  radiation: [-12, 18],
  humidity: [-22, 0],
};

export function fakeSensorFeatures(frame: number) {
  return {
    type: "FeatureCollection" as const,
    features: fakeFrame(frame).map((reading) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: reading.sensor.position },
      properties: {
        id: reading.sensor.id,
        ...Object.fromEntries(
          FAKE_LAYERS.filter((layer) => layer.id !== "sensors" && layer.id !== "wind").map(
            (layer) => [layer.id, reading[layer.id]],
          ),
        ),
        windBearing: reading.windBearing,
        windSpeed: reading.windSpeed,
        storm: reading.storm,
      },
    })),
  };
}

/** Entirely separate sources: never feed these values into observed or mission-state layers. */
export function FakeSensorLayers({ map, mode }: { map: MapLibreMap | null; mode: FakeSensorMode }) {
  const { state, dispatch } = mode;
  const enabled = state.enabled;
  useEffect(() => {
    if (!map || !enabled) return;
    map.addSource(FAKE_SOURCE, { type: "geojson", data: fakeSensorFeatures(0) });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#dbe6ef";
      context.strokeStyle = "#010405";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(16, 2);
      context.lineTo(26, 24);
      context.lineTo(16, 20);
      context.lineTo(6, 24);
      context.closePath();
      context.fill();
      context.stroke();
      map.addImage("fake-wind-arrow", context.getImageData(0, 0, 32, 32));
    }
    const before = map.getLayer("stops-label") ? "stops-label" : undefined;
    map.addLayer(
      {
        id: "fake-storm",
        type: "circle",
        source: FAKE_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "storm"], 0, 4, 1, 24],
          "circle-color": FAKE_COLORS[2],
          "circle-opacity": ["*", ["get", "storm"], 0.45],
          "circle-blur": 0.5,
        },
      },
      before,
    );
    if (context)
      map.addLayer(
        {
          id: "fake-wind",
          type: "symbol",
          source: FAKE_SOURCE,
          layout: {
            visibility: "none",
            "icon-image": "fake-wind-arrow",
            "icon-size": ["interpolate", ["linear"], ["get", "windSpeed"], 0, 0.4, 35, 0.85],
            "icon-rotate": ["get", "windBearing"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        },
        before,
      );
    for (const layer of FAKE_LAYERS) {
      if (layer.id === "wind") continue;
      const sensor = layer.id === "sensors";
      map.addLayer(
        {
          id: `fake-${layer.id}`,
          type: "circle",
          source: FAKE_SOURCE,
          layout: { visibility: sensor ? "visible" : "none" },
          paint: {
            "circle-radius": sensor ? 3.5 : 6,
            "circle-color": sensor
              ? "#dbe6ef"
              : [
                  "interpolate",
                  ["linear"],
                  ["get", layer.id],
                  layer.low,
                  FAKE_COLORS[0],
                  (layer.low + layer.high) / 2,
                  FAKE_COLORS[1],
                  layer.high,
                  FAKE_COLORS[2],
                ],
            "circle-opacity": 0.95,
            "circle-stroke-color": "#010405",
            "circle-stroke-width": 1.5,
            ...(!sensor
              ? {
                  "circle-translate": offsets[layer.id],
                  "circle-translate-anchor": "viewport" as const,
                }
              : {}),
          },
        },
        before,
      );
    }
    const select = (event: MapMouseEvent) => {
      if (map.getCanvas().dataset.placing) return;
      const hit = map.queryRenderedFeatures(event.point, {
        layers: FAKE_LAYER_IDS.filter((id) => !!map.getLayer(id)),
      })[0];
      if (typeof hit?.properties?.id === "string")
        dispatch({ type: "select", id: hit.properties.id });
    };
    map.on("click", select);
    return () => {
      map.off("click", select);
      if (!map.getStyle()) return;
      for (const id of FAKE_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(FAKE_SOURCE)) map.removeSource(FAKE_SOURCE);
      if (map.hasImage("fake-wind-arrow")) map.removeImage("fake-wind-arrow");
    };
  }, [map, enabled, dispatch]);

  useEffect(() => {
    if (!map || !state.enabled) return;
    map.getSource<GeoJSONSource>(FAKE_SOURCE)?.setData(fakeSensorFeatures(state.frame));
    for (const layer of FAKE_LAYERS) {
      const id = `fake-${layer.id}`;
      if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", state.visible[layer.id] ? "visible" : "none");
    }
    if (map.getLayer("fake-storm"))
      map.setLayoutProperty("fake-storm", "visibility", state.visible.wind ? "visible" : "none");
  }, [map, state]);
  return null;
}
