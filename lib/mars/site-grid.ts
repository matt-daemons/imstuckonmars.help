import { fromUrl } from "geotiff";

import { FLIGHT_RULES } from "../flight-rules/rules";
import { ROUGHNESS_DATA_ROOT } from "./ground-layers";
import { SITE_DATA_ROOT } from "./map-data";
import { cellAt, cellCenter, cellSize, type EquirectMeta, type RouteGrid } from "./route-grid";
import { marsDistanceM, wallMask, type NoGoZone } from "./routing";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const TENTHS_PER_DEGREE = 10; // the slope COGs store Int16 tenths of a degree
const CM_PER_M = 100; // the roughness COGs store Int16 centimetres

/** Walk grid cell size: the 1 m slope is max-pooled to about this. */
export const SITE_CELL_M = 2;
/** Half-width of the slope window read around the POI. */
const WINDOW_M = 1200;
/** Clearance added to every boulder's radius. Our assumption, not a NASA value. */
export const BOULDER_CLEARANCE_M = 1;
/**
 * Staging rule (team decision, Sun Nov 15): park at the nearest qualifying square at least 25 m from the POI,
 * after Apollo 17 Station 7 (LRV ~25 m from the boulder). NASA sets only a maximum, the walk-back limit.
 */
export const STAGING_MIN_M = 25;
/** Side of the square the parked rover needs flat and boulder-free. */
export const PARKING_SQUARE_M = 40;
/** Steepest 1 m slope allowed anywhere in the square. */
export const PARKING_MAX_SLOPE_DEG = 5;
/** Used, and flagged as a caution, only when no square within the walk-back limit meets PARKING_MAX_SLOPE_DEG. */
export const PARKING_FALLBACK_SLOPE_DEG = 10;
/** Highest RMS roughness allowed anywhere in the square, when the site's roughness is published. */
export const PARKING_MAX_ROUGHNESS_M = 0.25;
/** The staging rule in words, for the assumptions panel and the sources screen. */
export const STAGING_RULE = `The staging point is our rule: the rover parks at the nearest ${PARKING_SQUARE_M} m square at least ${STAGING_MIN_M} m from the site (Apollo 17 parked ~25 m from its sample boulder) where no 1 m slope exceeds ${PARKING_MAX_SLOPE_DEG}°, roughness stays under ${PARKING_MAX_ROUGHNESS_M} m and no boulder lies, within the ${FLIGHT_RULES.walk_back.max_distance_km} km walk-back limit. If no square there is that flat, it parks where none exceeds ${PARKING_FALLBACK_SLOPE_DEG}° and the trip carries a caution.`;
/** Spacing of the staging candidates, which keeps the scan fast. */
const CANDIDATE_SPACING_M = 10;
const BOULDERS_URL = "/data/processed/boulders.geojson";

/** A POI from sites.geojson; hiriseId names the slope COG, e.g. "ESP_033225_2250". */
export interface SiteInfo {
  id: string;
  hiriseId: string;
  poi: LngLat;
}

/** A mapped boulder as a no-go circle: diameter / 2 + clearance. */
export interface Boulder {
  center: LngLat;
  radius_m: number;
}

export interface SiteGrid {
  grid: RouteGrid;
  /** Degrees per cell, NaN where any 1 m pixel had no data. */
  slope: Float32Array;
  walls: Uint8Array;
  boulders: Boulder[];
  /** RMS roughness in metres per cell (steepest pixel), NaN without data; null when the site has none published. */
  roughness: Float32Array | null;
}

/**
 * Max-pools the 1 m slope (tenths of a degree) to cells of about cellM and walls steep cells, gaps and boulders.
 * Roughness (centimetres, on the same 1 m grid) is max-pooled alongside it, for the parking check only.
 */
export function siteGridFromSlope(
  meta: EquirectMeta,
  slopeTenths: ArrayLike<number>,
  boulders: Boulder[],
  cellM = SITE_CELL_M,
  roughnessCm: ArrayLike<number> | null = null,
): SiteGrid {
  const { stepX, stepY } = poolSteps(meta, cellM);
  const width = Math.floor(meta.width / stepX);
  const height = Math.floor(meta.height / stepY);
  const grid: RouteGrid = {
    width,
    height,
    west: meta.west,
    east: meta.west + width * stepX * meta.degreesPerPixel,
    rowEdges: Float64Array.from(
      { length: height + 1 },
      (_, edge) => meta.north - edge * stepY * meta.degreesPerPixel,
    ),
    // Flat on purpose: walls come from the slope, so findPath's step-grade check never fires.
    heights: new Float32Array(width * height),
  };
  const slope = maxPool(meta, slopeTenths, grid, stepX, stepY, TENTHS_PER_DEGREE);
  const roughness = roughnessCm && maxPool(meta, roughnessCm, grid, stepX, stepY, CM_PER_M);
  const walls = wallMask(grid, slope, []);
  for (const boulder of boulders) wallCircle(grid, walls, boulder);
  return { grid, slope, walls, boulders, roughness };
}

/** Pixels per cell in each direction; lon/lat pixels are narrower east-west than north-south. */
function poolSteps(meta: EquirectMeta, cellM: number): { stepX: number; stepY: number } {
  const centreLat = meta.north - (meta.height / 2) * meta.degreesPerPixel;
  const pixelHeightM = MARS_RADIUS_M * meta.degreesPerPixel * DEGREES_TO_RADIANS;
  const pixelWidthM = pixelHeightM * Math.cos(centreLat * DEGREES_TO_RADIANS);
  return {
    stepX: Math.max(1, Math.round(cellM / pixelWidthM)),
    stepY: Math.max(1, Math.round(cellM / pixelHeightM)),
  };
}

// A cell takes its highest pixel so walls are never under-counted; one nodata pixel makes it NaN, a wall.
function maxPool(
  meta: EquirectMeta,
  values: ArrayLike<number>,
  grid: RouteGrid,
  stepX: number,
  stepY: number,
  perUnit: number,
): Float32Array {
  const pooled = new Float32Array(grid.width * grid.height).fill(-Infinity);
  for (let y = 0; y < grid.height * stepY; y++) {
    for (let x = 0; x < grid.width * stepX; x++) {
      const value = values[y * meta.width + x];
      const cell = Math.floor(y / stepY) * grid.width + Math.floor(x / stepX);
      pooled[cell] = value === meta.nodata ? NaN : Math.max(pooled[cell], value / perUnit);
    }
  }
  return pooled;
}

/** The site with hand-drawn no-go zones walled too, so neither the walk nor the parking spot enters them. */
export function withZones(site: SiteGrid, zones: NoGoZone[]): SiteGrid {
  if (!zones.length) return site;
  const inZone = wallMask(site.grid, site.slope, zones, Infinity); // zones only: steep cells are walled already
  return { ...site, walls: site.walls.map((wall, cell) => wall | inZone[cell]) };
}

/** Walls every cell whose centre lies within the boulder's radius. */
function wallCircle(grid: RouteGrid, walls: Uint8Array, { center, radius_m }: Boulder): void {
  const centreCell = cellAt(grid, center);
  if (centreCell === null) return; // boulders are mapped near the POI, well inside the window
  const centreRow = Math.floor(centreCell / grid.width);
  const centreCol = centreCell % grid.width;
  const { dx, dy } = cellSize(grid, centreRow);
  const spanRows = Math.ceil(radius_m / dy) + 1;
  const spanCols = Math.ceil(radius_m / dx) + 1;
  for (let row = centreRow - spanRows; row <= centreRow + spanRows; row++) {
    for (let col = centreCol - spanCols; col <= centreCol + spanCols; col++) {
      if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) continue;
      const cell = row * grid.width + col;
      if (marsDistanceM(cellCenter(grid, cell), center) <= radius_m) walls[cell] = 1;
    }
  }
}

/**
 * Reads the site's slope around the POI, its mapped boulders (in the browser: the boulder file is a relative URL)
 * and, once published, its roughness on the same 1 m grid.
 */
export async function loadSiteGrid(site: SiteInfo, signal?: AbortSignal): Promise<SiteGrid> {
  if (!SITE_DATA_ROOT) throw new Error("Site slope needs the published site data (SITE_DATA_ROOT)");
  const [{ meta, values: slopeTenths }, boulders, roughness] = await Promise.all([
    readWindow(`${SITE_DATA_ROOT}/slope/${site.hiriseId}_slope.tif`, site, signal),
    loadBoulders(site.id, signal),
    ROUGHNESS_DATA_ROOT
      ? readWindow(`${ROUGHNESS_DATA_ROOT}/roughness/${site.hiriseId}_roughness.tif`, site, signal)
      : null,
  ]);
  return siteGridFromSlope(meta, slopeTenths, boulders, SITE_CELL_M, roughness?.values ?? null);
}

/** Range-reads only the window around the POI, placed with the COG's own origin and pixel size. */
async function readWindow(url: string, site: SiteInfo, signal?: AbortSignal) {
  const tiff = await fromUrl(url, {}, signal);
  const image = await tiff.getImage();
  const [originLng, originLat] = image.getOrigin();
  const [degreesPerPixel] = image.getResolution(); // the COGs have square pixels in degrees
  const [lng, lat] = site.poi;
  const halfLatDeg = (WINDOW_M / MARS_RADIUS_M) * RADIANS_TO_DEGREES;
  const halfLngDeg = halfLatDeg / Math.cos(lat * DEGREES_TO_RADIANS);
  const col = (l: number) => clamp(Math.round((l - originLng) / degreesPerPixel), image.getWidth());
  const row = (l: number) =>
    clamp(Math.round((originLat - l) / degreesPerPixel), image.getHeight());
  const window = [
    col(lng - halfLngDeg),
    row(lat + halfLatDeg),
    col(lng + halfLngDeg),
    row(lat - halfLatDeg),
  ];
  const [values] = await image.readRasters({ window, samples: [0], signal });
  const meta: EquirectMeta = {
    width: window[2] - window[0],
    height: window[3] - window[1],
    west: originLng + window[0] * degreesPerPixel,
    north: originLat - window[1] * degreesPerPixel,
    degreesPerPixel,
    nodata: image.getGDALNoData(),
  };
  return { meta, values };
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

interface BoulderFeature {
  geometry: { coordinates: LngLat };
  properties: { site: string; diameter_m: number };
}

async function loadBoulders(siteId: string, signal?: AbortSignal): Promise<Boulder[]> {
  const response = await fetch(BOULDERS_URL, { signal });
  if (!response.ok) throw new Error(`Boulders: HTTP ${response.status}`);
  const { features } = (await response.json()) as { features: BoulderFeature[] };
  return features
    .filter((feature) => feature.properties.site === siteId)
    .map((feature) => ({
      center: feature.geometry.coordinates,
      radius_m: feature.properties.diameter_m / 2 + BOULDER_CLEARANCE_M,
    }));
}

/** A staging candidate: a cell and its distance from the POI. */
interface Spot {
  cell: number;
  distanceM: number;
}

/** Where the rover parks, and which slope limit the square met. */
export interface StagingPoint {
  point: LngLat;
  /** PARKING_MAX_SLOPE_DEG, or PARKING_FALLBACK_SLOPE_DEG when no square within the walk-back limit met it. */
  slopeLimitDeg: number;
  fallback: boolean;
  /** False until the site's roughness is published (ROUGHNESS_DATA_ROOT). */
  roughnessChecked: boolean;
}

/**
 * Where the rover parks for the walk: the flat, smooth, boulder-free square nearest the POI, at least
 * STAGING_MIN_M out and within the walk-back limit; on max PARKING_FALLBACK_SLOPE_DEG if no square meets
 * PARKING_MAX_SLOPE_DEG; else null.
 */
export function findStagingPoint(site: SiteGrid, poi: LngLat): StagingPoint | null {
  const walkBackM = FLIGHT_RULES.walk_back.max_distance_km * 1000;
  const spots = candidateSpots(site.grid, poi)
    .filter((spot) => spot.distanceM >= STAGING_MIN_M && spot.distanceM <= walkBackM)
    .sort((a, b) => a.distanceM - b.distanceM);
  for (const slopeLimitDeg of [PARKING_MAX_SLOPE_DEG, PARKING_FALLBACK_SLOPE_DEG]) {
    const spot = spots.find((candidate) => isParkable(site, candidate.cell, slopeLimitDeg));
    if (spot) {
      return {
        point: cellCenter(site.grid, spot.cell),
        slopeLimitDeg,
        fallback: slopeLimitDeg !== PARKING_MAX_SLOPE_DEG,
        roughnessChecked: site.roughness !== null,
      };
    }
  }
  return null;
}

/** Cells on a lattice about CANDIDATE_SPACING_M apart, measured from the POI. */
function candidateSpots(grid: RouteGrid, poi: LngLat): Spot[] {
  const { dx, dy } = cellSize(grid, Math.floor(grid.height / 2));
  const rowStep = Math.max(1, Math.round(CANDIDATE_SPACING_M / dy));
  const colStep = Math.max(1, Math.round(CANDIDATE_SPACING_M / dx));
  const spots: Spot[] = [];
  for (let row = 0; row < grid.height; row += rowStep) {
    for (let col = 0; col < grid.width; col += colStep) {
      const cell = row * grid.width + col;
      const [east, north] = eastNorthM(poi, cellCenter(grid, cell));
      spots.push({ cell, distanceM: Math.hypot(east, north) });
    }
  }
  return spots;
}

/**
 * The parking square around the cell lies on the grid, holds no wall (boulder, steep or missing slope),
 * no cell steeper than slopeLimitDeg and, when roughness is published, none rougher than
 * PARKING_MAX_ROUGHNESS_M or without roughness data. Cells keep their steepest 1 m pixel, so this is the
 * square's maximum: DTM noise can rule a square out but never lets a tilted one through.
 */
function isParkable(
  { grid, slope, walls, roughness }: SiteGrid,
  cell: number,
  slopeLimitDeg: number,
): boolean {
  const centreRow = Math.floor(cell / grid.width);
  const centreCol = cell % grid.width;
  const { dx, dy } = cellSize(grid, centreRow);
  const halfRows = Math.round(PARKING_SQUARE_M / 2 / dy);
  const halfCols = Math.round(PARKING_SQUARE_M / 2 / dx);
  const onGrid =
    centreRow - halfRows >= 0 &&
    centreRow + halfRows < grid.height &&
    centreCol - halfCols >= 0 &&
    centreCol + halfCols < grid.width;
  if (!onGrid) return false;
  for (let row = centreRow - halfRows; row <= centreRow + halfRows; row++) {
    for (let col = centreCol - halfCols; col <= centreCol + halfCols; col++) {
      const square = row * grid.width + col;
      if (walls[square] || !(slope[square] <= slopeLimitDeg)) return false;
      if (roughness && !(roughness[square] <= PARKING_MAX_ROUGHNESS_M)) return false;
    }
  }
  return true;
}

// East and north offset in metres on the Mars sphere (equirectangular), the short way across ±180°.
function eastNorthM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): [number, number] {
  const eastDeg = ((lng2 - lng1 + 540) % 360) - 180;
  const meanLat = ((lat1 + lat2) / 2) * DEGREES_TO_RADIANS;
  return [
    MARS_RADIUS_M * eastDeg * DEGREES_TO_RADIANS * Math.cos(meanLat),
    MARS_RADIUS_M * (lat2 - lat1) * DEGREES_TO_RADIANS,
  ];
}
