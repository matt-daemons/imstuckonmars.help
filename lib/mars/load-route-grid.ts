import type { DriveGrid } from "./driving";
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
// THEMIS thermal inertia on the same cells as the strip (pnpm pipe:thermal-inertia).
const DRIVE_GROUND = "/data/processed/rover/thermal-inertia-corridor.bin";

/** Fetches the 463 m MOLA driving strip (pnpm pipe:mola-corridor) and its ground, and builds its grid. */
export async function loadDriveGrid(signal?: AbortSignal): Promise<DriveGrid> {
  const [metaResponse, heightsResponse, groundResponse] = await Promise.all([
    fetch(`${DRIVE_DATA}.json`, { signal }),
    fetch(`${DRIVE_DATA}.bin`, { signal }),
    fetch(DRIVE_GROUND, { signal }),
  ]);
  if (!metaResponse.ok || !heightsResponse.ok || !groundResponse.ok) {
    throw new Error(
      `Driving terrain: HTTP ${metaResponse.status} / ${heightsResponse.status} / ${groundResponse.status}`,
    );
  }
  const meta = (await metaResponse.json()) as EquirectMeta;
  // Both files are Int16 little-endian, which matches every browser's byte order.
  const grid = gridFromEquirect(meta, new Int16Array(await heightsResponse.arrayBuffer()));
  const thermalInertia = new Int16Array(await groundResponse.arrayBuffer());
  if (thermalInertia.length !== grid.width * grid.height) {
    throw new Error(
      "Driving ground does not match the terrain grid; rerun pnpm pipe:thermal-inertia",
    );
  }
  return { ...grid, thermalInertia };
}
