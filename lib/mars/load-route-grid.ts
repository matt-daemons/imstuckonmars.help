import { mapAsset } from "./map-data";
import { gridFromTiles, type RouteGrid } from "./route-grid";

// The four zoom-10 tiles around the base (about 56 m cells).
const ZOOM = 10;
const X0 = 10;
const Y0 = 364;

/** Fetches and joins the base's elevation tiles. Browser only (createImageBitmap, OffscreenCanvas). */
export async function loadBaseGrid(signal?: AbortSignal): Promise<RouteGrid> {
  const rows = [Y0, Y0 + 1].map((y) =>
    Promise.all([X0, X0 + 1].map((x) => loadTilePixels(x, y, signal))),
  );
  return gridFromTiles(ZOOM, X0, Y0, await Promise.all(rows));
}

async function loadTilePixels(x: number, y: number, signal?: AbortSignal) {
  const response = await fetch(mapAsset(`legacy/display/hab/${ZOOM}/${x}/${y}.png`), { signal });
  if (!response.ok) throw new Error(`Elevation tile ${ZOOM}/${x}/${y}: HTTP ${response.status}`);
  // No premultiplying or colour conversion, so the bytes stay the exact Terrarium values.
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const context = new OffscreenCanvas(width, height).getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, width, height).data;
}
