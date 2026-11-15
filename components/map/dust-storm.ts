import type { ImageSource, Map } from "maplibre-gl";
import { dustColor } from "@/lib/mars/dust-field";
import {
  DUST_FIELDS,
  DUST_PATCHES,
  dustValue,
  type DustField,
  type DustSimulation,
} from "@/lib/mars/dust-simulation";

const states = new WeakMap<Map, { sources: ImageSource[]; frame: number; field: DustField }>();

function image(
  simulation: DustSimulation,
  frame: number,
  field: DustField,
  patch: (typeof DUST_PATCHES)[number],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 90;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Dust map requires a canvas context");
  const pixels = context.createImageData(canvas.width, canvas.height);
  const mercator = (latitude: number) => Math.asinh(Math.tan((latitude * Math.PI) / 180));
  const top = mercator(patch.north),
    bottom = mercator(patch.south);
  for (let y = 0; y < canvas.height; y++) {
    const latitude =
      (Math.atan(Math.sinh(top + ((bottom - top) * (y + 0.5)) / canvas.height)) * 180) / Math.PI;
    for (let x = 0; x < canvas.width; x++) {
      const longitude = patch.west + ((patch.east - patch.west) * (x + 0.5)) / canvas.width;
      const value = dustValue(simulation, frame, field, longitude, latitude);
      if (value !== null)
        pixels.data.set(dustColor(value / DUST_FIELDS[field].maximum), (y * canvas.width + x) * 4);
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

export function hideDustSimulation(map: Map) {
  for (const patch of DUST_PATCHES) {
    if (map.getLayer(patch.id)) map.setLayoutProperty(patch.id, "visibility", "none");
  }
}

export function showDustSimulation(
  map: Map,
  simulation: DustSimulation,
  frame: number,
  field: DustField,
) {
  let state = states.get(map);
  if (!state) {
    const before = map
      .getStyle()
      .layers.find((layer) => layer.type !== "background" && layer.type !== "raster")?.id;
    const sources = DUST_PATCHES.map((patch) => {
      // The map can outlive this module's state (dev hot reload): reuse sources it already has.
      const existing = map.getSource<ImageSource>(patch.id);
      if (existing) {
        existing.updateImage({ url: image(simulation, frame, field, patch) });
        return existing;
      }
      map.addSource(patch.id, {
        type: "image",
        url: image(simulation, frame, field, patch),
        coordinates: [
          [patch.west, patch.north],
          [patch.east, patch.north],
          [patch.east, patch.south],
          [patch.west, patch.south],
        ],
      });
      const source = map.getSource<ImageSource>(patch.id);
      if (!source) throw new Error("NASA dust image source was not created");
      map.addLayer(
        {
          id: patch.id,
          type: "raster",
          source: patch.id,
          paint: { "raster-fade-duration": 0, "raster-opacity": 0.85 },
        },
        before,
      );
      return source;
    });
    state = { sources, frame, field };
    states.set(map, state);
    map.once("remove", () => states.delete(map));
  } else if (state.frame !== frame || state.field !== field) {
    state.sources.forEach((source, index) =>
      source.updateImage({ url: image(simulation, frame, field, DUST_PATCHES[index]) }),
    );
    state.frame = frame;
    state.field = field;
  }
  for (const patch of DUST_PATCHES) map.setLayoutProperty(patch.id, "visibility", "visible");
}
