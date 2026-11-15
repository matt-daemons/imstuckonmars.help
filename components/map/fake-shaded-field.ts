import type { ImageSource, Map as MapLibreMap } from "maplibre-gl";
import {
  FAKE_FIELD_PALETTES,
  FAKE_FIELD_PATCHES,
  fakeFieldValue,
  fieldBand,
  type FakeShadedField,
} from "@/lib/mars/fake-fields";
import { FAKE_LAYERS } from "@/lib/mars/fake-sensors";

export const FAKE_FIELD_IDS = FAKE_FIELD_PATCHES.map((_, index) => `fake-field-${index}`);

function fieldImage(
  frame: number,
  field: FakeShadedField,
  patch: (typeof FAKE_FIELD_PATCHES)[number],
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 144;
  canvas.height = 288;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Synthetic field rendering requires canvas");
  const image = context.createImageData(canvas.width, canvas.height);
  const bands = new Uint8Array(canvas.width * canvas.height);
  const range = FAKE_LAYERS.find((layer) => layer.id === field)!;
  const palette = FAKE_FIELD_PALETTES[field].map((hex) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)),
  );
  const mercator = (latitude: number) => Math.asinh(Math.tan((latitude * Math.PI) / 180));
  const top = mercator(patch.north),
    bottom = mercator(patch.south);
  for (let y = 0; y < canvas.height; y++) {
    const latitude =
      (Math.atan(Math.sinh(top + ((bottom - top) * (y + 0.5)) / canvas.height)) * 180) / Math.PI;
    for (let x = 0; x < canvas.width; x++) {
      const longitude = patch.west + ((patch.east - patch.west) * (x + 0.5)) / canvas.width;
      const index = y * canvas.width + x;
      const band = fieldBand(
        fakeFieldValue(longitude, latitude, frame, field),
        range.low,
        range.high,
      );
      bands[index] = band;
      const edge =
        (x > 0 && bands[index - 1] !== band) || (y > 0 && bands[index - canvas.width] !== band);
      const color = palette[band].map((channel) => Math.round(channel * (edge ? 0.65 : 1)));
      image.data.set([...color, 255], index * 4);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export function showFakeField(map: MapLibreMap, field: FakeShadedField | null, frame: number) {
  for (const [index, patch] of FAKE_FIELD_PATCHES.entries()) {
    const id = FAKE_FIELD_IDS[index];
    if (!field) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      continue;
    }
    const url = fieldImage(frame, field, patch);
    const source = map.getSource<ImageSource>(id);
    if (source) source.updateImage({ url });
    else {
      map.addSource(id, {
        type: "image",
        url,
        coordinates: [
          [patch.west, patch.north],
          [patch.east, patch.north],
          [patch.east, patch.south],
          [patch.west, patch.south],
        ],
      });
      const before = map
        .getStyle()
        .layers.find((layer) => layer.type !== "background" && layer.type !== "raster")?.id;
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: {
            "raster-opacity": 0.72,
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        before,
      );
    }
    map.setLayoutProperty(id, "visibility", "visible");
  }
}

export function removeFakeField(map: MapLibreMap) {
  for (const id of FAKE_FIELD_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }
}
