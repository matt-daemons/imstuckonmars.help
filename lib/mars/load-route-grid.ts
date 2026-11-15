import { mapAsset } from "./map-data";
import { type EquirectMeta, gridFromEquirect, gridFromTiles, type RouteGrid } from "./route-grid";

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

const DRIVE_DATA = "/data/processed/rover/mola-corridor";

/** Fetches the 463 m MOLA driving strip (pnpm pipe:mola-corridor) and builds its grid. */
export async function loadDriveGrid(signal?: AbortSignal): Promise<RouteGrid> {
  const [metaResponse, heightsResponse] = await Promise.all([
    fetch(`${DRIVE_DATA}.json`, { signal }),
    fetch(`${DRIVE_DATA}.bin`, { signal }),
  ]);
  if (!metaResponse.ok || !heightsResponse.ok) {
    throw new Error(`Driving terrain: HTTP ${metaResponse.status} / ${heightsResponse.status}`);
  }
  const meta = (await metaResponse.json()) as EquirectMeta;
  // The file is Int16 little-endian, which matches every browser's byte order.
  return gridFromEquirect(meta, new Int16Array(await heightsResponse.arrayBuffer()));
}
