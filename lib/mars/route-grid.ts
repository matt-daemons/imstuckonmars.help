import { DISPLAY_ELEVATION_OFFSET_M, MARS_RADIUS_M, tileLatitude, tileLongitude } from "./terrain";
import type { LngLat } from "./types";

const TILE_PIXELS = 256;
const DEGREES_TO_RADIANS = Math.PI / 180;

export interface RouteGrid {
  width: number;
  height: number;
  /** Longitude of the outer edges, degrees. */
  west: number;
  east: number;
  /** Latitude of each row edge, north to south, length height + 1. */
  rowEdges: Float64Array;
  /** Metres, row-major; NaN means no data. */
  heights: Float32Array;
}

/** Terrarium encodes height as R*256 + G + B/256 - 32768; transparent pixels have no data. */
export function decodeTerrarium(rgba: ArrayLike<number>, offsetM: number): Float32Array {
  const heights = new Float32Array(rgba.length / 4);
  for (let pixel = 0; pixel < heights.length; pixel++) {
    const i = pixel * 4;
    heights[pixel] =
      rgba[i + 3] < 255 ? NaN : rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768 - offsetM;
  }
  return heights;
}

/** Joins a block of tiles (tiles[row][col]) into one grid, removing the display elevation offset. */
export function gridFromTiles(
  zoom: number,
  x0: number,
  y0: number,
  tiles: ArrayLike<number>[][],
): RouteGrid {
  const tileRows = tiles.length;
  const tileCols = tiles[0].length;
  const width = tileCols * TILE_PIXELS;
  const height = tileRows * TILE_PIXELS;
  const heights = new Float32Array(width * height);
  tiles.forEach((tileRow, row) =>
    tileRow.forEach((tile, col) => {
      const tileHeights = decodeTerrarium(tile, DISPLAY_ELEVATION_OFFSET_M);
      for (let y = 0; y < TILE_PIXELS; y++) {
        const start = (row * TILE_PIXELS + y) * width + col * TILE_PIXELS;
        heights.set(tileHeights.subarray(y * TILE_PIXELS, (y + 1) * TILE_PIXELS), start);
      }
    }),
  );
  const rowEdges = Float64Array.from({ length: height + 1 }, (_, edge) =>
    tileLatitude(y0 + edge / TILE_PIXELS, zoom),
  );
  return {
    width,
    height,
    west: tileLongitude(x0, zoom),
    east: tileLongitude(x0 + tileCols, zoom),
    rowEdges,
    heights,
  };
}

/** Index (row * width + col) of the cell containing the point, or null outside the grid. */
export function cellAt(grid: RouteGrid, [lng, lat]: LngLat): number | null {
  const north = grid.rowEdges[0];
  const south = grid.rowEdges[grid.height];
  if (lng < grid.west || lng >= grid.east || lat > north || lat <= south) return null;
  const col = Math.floor(((lng - grid.west) / (grid.east - grid.west)) * grid.width);
  return rowContaining(grid, lat) * grid.width + col;
}

// Binary search for the last row edge at or north of the latitude.
function rowContaining(grid: RouteGrid, lat: number): number {
  let low = 0;
  let high = grid.height - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (grid.rowEdges[middle] >= lat) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function cellCenter(grid: RouteGrid, index: number): LngLat {
  const row = Math.floor(index / grid.width);
  const col = index % grid.width;
  return [
    grid.west + ((col + 0.5) / grid.width) * (grid.east - grid.west),
    (grid.rowEdges[row] + grid.rowEdges[row + 1]) / 2,
  ];
}

/** Cell width (east-west) and height (north-south) in Mars metres. */
export function cellSize(grid: RouteGrid, row: number): { dx: number; dy: number } {
  const north = grid.rowEdges[row];
  const south = grid.rowEdges[row + 1];
  const rowLatitude = (north + south) / 2;
  const degreesWide = (grid.east - grid.west) / grid.width;
  return {
    dx:
      MARS_RADIUS_M * Math.cos(rowLatitude * DEGREES_TO_RADIANS) * degreesWide * DEGREES_TO_RADIANS,
    dy: MARS_RADIUS_M * (north - south) * DEGREES_TO_RADIANS,
  };
}
