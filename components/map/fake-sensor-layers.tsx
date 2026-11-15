"use client";

import { useEffect } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { fakeFrame } from "@/lib/mars/fake-sensors";
import { FAKE_FIELD_PALETTES, type FakeShadedField } from "@/lib/mars/fake-fields";
import type { FakeSensorMode } from "./use-fake-sensor-mode";
import { removeFakeField, showFakeField } from "./fake-shaded-field";
import { unwrapZoneRing } from "@/lib/mars/route-zones";

export const FAKE_SOURCE = "fake-future-sensors";
export const FAKE_LAYER_IDS = ["fake-wind", "fake-sensors", "fake-humidity"];

/** Great-circle vector endpoints, with arrowheads and shortest seam crossings. */
export function fakeWindFeatures(frame: number) {
  const destination = (
    lng: number,
    lat: number,
    bearing: number,
    arc: number,
  ): [number, number] => {
    const r = Math.PI / 180,
      phi = lat * r,
      lambda = lng * r,
      theta = bearing * r,
      delta = arc * r;
    const nextLat = Math.asin(
      Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(theta),
    );
    const nextLng =
      lambda +
      Math.atan2(
        Math.sin(theta) * Math.sin(delta) * Math.cos(phi),
        Math.cos(delta) - Math.sin(phi) * Math.sin(nextLat),
      );
    return [nextLng / r, nextLat / r];
  };
  return {
    type: "FeatureCollection" as const,
    features: fakeFrame(frame).map((reading) => {
      const [lng, lat] = reading.sensor.position;
      const arc = 0.6 + (reading.windSpeed / 35) * 2.2;
      const tip = destination(lng, lat, reading.windBearing, arc);
      const left = destination(...tip, reading.windBearing + 150, arc * 0.3);
      const right = destination(...tip, reading.windBearing - 150, arc * 0.3);
      return {
        type: "Feature" as const,
        properties: { id: reading.sensor.id, storm: reading.storm },
        geometry: {
          type: "MultiLineString" as const,
          coordinates: [unwrapZoneRing([[lng, lat], tip]), unwrapZoneRing([left, tip, right])],
        },
      };
    }),
  };
}

export function fakeSensorFeatures(frame: number) {
  return {
    type: "FeatureCollection" as const,
    features: fakeFrame(frame).map((reading) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: reading.sensor.position },
      properties: {
        id: reading.sensor.id,
        ground: reading.ground,
        air: reading.air,
        pressure: reading.pressure,
        radiation: reading.radiation,
        humidity: reading.humidity,
        humidityLabel: `${Math.round(reading.humidity)}%`,
        windBearing: reading.windBearing,
        windSpeed: reading.windSpeed,
        storm: reading.storm,
      },
    })),
  };
}

/** Raster fields stay below sparse vectors, labels and independently toggled station markers. */
export function FakeSensorLayers({ map, mode }: { map: MapLibreMap | null; mode: FakeSensorMode }) {
  const { state, dispatch } = mode;
  const enabled = state.enabled;
  useEffect(() => {
    if (!map || !enabled) return;
    map.addSource(FAKE_SOURCE, { type: "geojson", data: fakeSensorFeatures(0) });
    map.addSource("fake-wind-vectors", { type: "geojson", data: fakeWindFeatures(0) });
    const before = map.getLayer("stops-label") ? "stops-label" : undefined;
    map.addLayer(
      {
        id: "fake-wind",
        type: "line",
        source: "fake-wind-vectors",
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "storm"], 0, "#eff6ff", 1, "#db945d"],
          "line-width": 1.6,
          "line-opacity": 0.9,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: "fake-sensors",
        type: "circle",
        source: FAKE_SOURCE,
        layout: { visibility: "visible" },
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#dbe6ef",
          "circle-stroke-color": "#010405",
          "circle-stroke-width": 1,
        },
      },
      before,
    );
    // Image labels avoid depending on a remote glyph endpoint.
    for (let percent = 0; percent <= 100; percent++) {
      const label = document.createElement("canvas");
      label.width = 72;
      label.height = 32;
      const ctx = label.getContext("2d");
      if (!ctx) continue;
      ctx.font = "600 24px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#010405";
      ctx.strokeText(`${percent}%`, 36, 16);
      ctx.fillStyle = "#e6f3f3";
      ctx.fillText(`${percent}%`, 36, 16);
      map.addImage(`fake-humidity-${percent}`, ctx.getImageData(0, 0, 72, 32), { pixelRatio: 2 });
    }
    map.addLayer(
      {
        id: "fake-humidity",
        type: "symbol",
        source: FAKE_SOURCE,
        layout: {
          visibility: "none",
          "icon-image": ["concat", "fake-humidity-", ["to-string", ["round", ["get", "humidity"]]]],
          "icon-padding": 10,
          "icon-offset": [0, 10],
          "icon-allow-overlap": false,
        },
      },
      before,
    );
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
      removeFakeField(map);
      for (const id of FAKE_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(FAKE_SOURCE)) map.removeSource(FAKE_SOURCE);
      if (map.getSource("fake-wind-vectors")) map.removeSource("fake-wind-vectors");
      for (let percent = 0; percent <= 100; percent++)
        if (map.hasImage(`fake-humidity-${percent}`)) map.removeImage(`fake-humidity-${percent}`);
    };
  }, [map, enabled, dispatch]);

  const frame = state.enabled ? state.frame : 0;
  const field = state.enabled
    ? ((Object.keys(FAKE_FIELD_PALETTES) as FakeShadedField[]).find((key) => state.visible[key]) ??
      null)
    : null;
  useEffect(() => {
    if (!map || !enabled) return;
    map.getSource<GeoJSONSource>(FAKE_SOURCE)?.setData(fakeSensorFeatures(frame));
    map.getSource<GeoJSONSource>("fake-wind-vectors")?.setData(fakeWindFeatures(frame));
    showFakeField(map, field, frame);
  }, [map, enabled, frame, field]);
  useEffect(() => {
    if (!map || !state.enabled) return;
    for (const kind of ["wind", "sensors", "humidity"] as const)
      if (map.getLayer(`fake-${kind}`))
        map.setLayoutProperty(
          `fake-${kind}`,
          "visibility",
          state.visible[kind] ? "visible" : "none",
        );
  }, [map, state]);
  return null;
}
