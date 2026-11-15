/** Public, immutable R2 release. No credentials or write endpoints reach the client. */
export const MAP_DATA_ROOT = "https://tiles.imstuckonmars.help/mars-v2";

export const mapAsset = (path: string) => `${MAP_DATA_ROOT}/${path}`;

export const ARCADIA_IMAGERY_BOUNDS = [
  -176.220703125, 45.791015625, -175.78125, 46.23046875,
] as const;
