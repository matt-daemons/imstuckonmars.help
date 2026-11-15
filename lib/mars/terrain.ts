export const MARS_RADIUS_M = 3_396_190;
export const MARS_TO_MAP = 6_378_137 / MARS_RADIUS_M;
// Mapbox's close-up camera cannot descend below its zero datum. Display only.
export const DISPLAY_ELEVATION_OFFSET_M = 10_000;

export const LOCAL_TERRAIN_BOUNDS = [
  -176.484375, 45.58328975600631, -175.78125, 46.07323062540836,
] as const;
export const LOCAL_TERRAIN_SOURCE = "hab-dem";
export const REGIONAL_TERRAIN_SOURCE = "mola-dem";
export const GLOBAL_TERRAIN_SOURCE = "global-dem";

export function terrainSourceForView(bounds: readonly number[], zoom: number): string | null {
  const [west, south, east, north] = bounds;
  if (zoom < 5) return null;
  if (west < -180 || east > -168 || south < 40 || north > 52) return GLOBAL_TERRAIN_SOURCE;
  const [localWest, localSouth, localEast, localNorth] = LOCAL_TERRAIN_BOUNDS;
  return zoom >= 10 &&
    west >= localWest &&
    south >= localSouth &&
    east <= localEast &&
    north <= localNorth
    ? LOCAL_TERRAIN_SOURCE
    : REGIONAL_TERRAIN_SOURCE;
}

export const tileLongitude = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180;
export const tileLatitude = (y: number, zoom: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;

export function encodeTerrarium(height: number): [number, number, number] {
  if (!Number.isFinite(height) || height < -32768 || height >= 32768) {
    throw new Error("Elevation is missing or outside the Terrarium range");
  }
  const encoded = Math.round((height + 32768) * 256);
  return [Math.floor(encoded / 65536), Math.floor(encoded / 256) % 256, encoded % 256];
}

export interface ElevationGrid {
  width: number;
  height: number;
  west: number;
  north: number;
  stepX: number;
  stepY: number;
  nodata: number | null;
  values: ArrayLike<number>;
}

/** Require all four neighbors, including the interpolation halo, to be real samples. */
export function sampleElevation(
  grid: ElevationGrid,
  longitude: number,
  latitude: number,
): number | null {
  const x = (longitude - grid.west) / grid.stepX - 0.5;
  const y = (grid.north - latitude) / grid.stepY - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= grid.width || y0 + 1 >= grid.height) return null;
  const neighbors = [
    grid.values[y0 * grid.width + x0],
    grid.values[y0 * grid.width + x0 + 1],
    grid.values[(y0 + 1) * grid.width + x0],
    grid.values[(y0 + 1) * grid.width + x0 + 1],
  ];
  if (neighbors.some((value) => !Number.isFinite(value) || value === grid.nodata)) return null;
  const dx = x - x0;
  const dy = y - y0;
  return (
    (neighbors[0] * (1 - dx) + neighbors[1] * dx) * (1 - dy) +
    (neighbors[2] * (1 - dx) + neighbors[3] * dx) * dy
  );
}
