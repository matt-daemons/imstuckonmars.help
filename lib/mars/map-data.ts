/** Public, immutable R2 release. No credentials or write endpoints reach the client. */
export const MAP_DATA_ROOT = "https://tiles.imstuckonmars.help/mars-v2";
export const GLOBAL_COLOR_ROOT = "https://tiles.imstuckonmars.help/viking-native-v1";
export const GLOBAL_COLOR_SOURCE = {
  type: "raster",
  tiles: [`${GLOBAL_COLOR_ROOT}/tiles/{z}/{x}/{y}.jpg`],
  tileSize: 1024,
  minzoom: 0,
  maxzoom: 7,
  attribution: "NASA/Viking; USGS; NASA Ames",
} satisfies import("mapbox-gl").RasterSourceSpecification;

export const mapAsset = (path: string) => `${MAP_DATA_ROOT}/${path}`;

/**
 * HiRISE water-ice site tiles (pnpm sites:package → M's R2 upload). Set to
 * "https://tiles.imstuckonmars.help/sites-v1" once M confirms the upload; null = local tiles from pnpm pipe:sites.
 */
export const SITE_DATA_ROOT: string | null = null;

export const ARCADIA_IMAGERY_BOUNDS = [
  -176.220703125, 45.791015625, -175.78125, 46.23046875,
] as const;
