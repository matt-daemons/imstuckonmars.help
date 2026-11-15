import type { ImageSource, Map } from "maplibre-gl";
import { DUST_FOOTPRINT, DUST_IMAGE_PATCHES, dustColor, dustField } from "@/lib/mars/dust-field";

const states = new WeakMap<Map, { windFrom: number; sources: ImageSource[] }>();

function sourceId(patch: (typeof DUST_IMAGE_PATCHES)[number]) {
  return `simulated-dust-${patch.id}`;
}

function image(windFrom: number, patch: (typeof DUST_IMAGE_PATCHES)[number]): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(
    (384 * (patch.east - patch.west)) / (DUST_FOOTPRINT.east - DUST_FOOTPRINT.west),
  );
  canvas.height = 384;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Dust illustration requires a canvas context");
  const pixels = context.createImageData(canvas.width, canvas.height);
  const mercatorY = (latitude: number) => Math.asinh(Math.tan((latitude * Math.PI) / 180));
  const top = mercatorY(DUST_FOOTPRINT.north),
    bottom = mercatorY(DUST_FOOTPRINT.south);
  for (let y = 0; y < canvas.height; y++) {
    const latitude =
      (Math.atan(Math.sinh(top + ((bottom - top) * (y + 0.5)) / canvas.height)) * 180) / Math.PI;
    for (let x = 0; x < canvas.width; x++) {
      const longitude =
        patch.west + patch.longitudeOffset + ((patch.east - patch.west) * (x + 0.5)) / canvas.width;
      pixels.data.set(
        dustColor(dustField(longitude, latitude, windFrom)),
        (y * canvas.width + x) * 4,
      );
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

/** Geographic raster is clipped by the globe and cannot paint dust into space. */
export function updateDustStorm(map: Map, intensity: number, windFrom: number) {
  let state = states.get(map);
  if (!state) {
    if (intensity <= 0.01) return;
    const { north, south } = DUST_FOOTPRINT;
    const before = map
      .getStyle()
      .layers.find((layer) => layer.type !== "background" && layer.type !== "raster")?.id;
    // Terrain clips image sources per canonical world. Never span ±180° in one image.
    const sources = DUST_IMAGE_PATCHES.map((patch) => {
      const id = sourceId(patch);
      map.addSource(id, {
        type: "image",
        url: image(windFrom, patch),
        coordinates: [
          [patch.west, north],
          [patch.east, north],
          [patch.east, south],
          [patch.west, south],
        ],
      });
      const source = map.getSource<ImageSource>(id);
      if (!source) throw new Error("Dust illustration source was not created");
      map.addLayer(
        { id, type: "raster", source: id, paint: { "raster-fade-duration": 0 } },
        before,
      );
      return source;
    });
    state = { windFrom, sources };
    states.set(map, state);
    map.once("remove", () => states.delete(map));
  }
  if (state.windFrom !== windFrom) {
    state.sources.forEach((source, index) => {
      source.updateImage({ url: image(windFrom, DUST_IMAGE_PATCHES[index]) });
    });
    state.windFrom = windFrom;
  }
  for (const patch of DUST_IMAGE_PATCHES) {
    map.setPaintProperty(sourceId(patch), "raster-opacity", Math.max(0, Math.min(1, intensity)));
    map.setLayoutProperty(sourceId(patch), "visibility", intensity > 0.01 ? "visible" : "none");
  }
}
