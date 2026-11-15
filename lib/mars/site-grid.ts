import { fromUrl } from "geotiff";

import { ROVER_RULES } from "../flight-rules/rover-rules";
import { FLIGHT_RULES } from "../flight-rules/rules";
import { SITE_DATA_ROOT } from "./map-data";
import { cellAt, cellCenter, cellSize, type EquirectMeta, type RouteGrid } from "./route-grid";
import { marsDistanceM, wallMask } from "./routing";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const TENTHS_PER_DEGREE = 10; // the slope COGs store Int16 tenths of a degree

/** Walk grid cell size: the 1 m slope is max-pooled to about this. */
export const SITE_CELL_M = 2;
/** Half-width of the slope window read around the POI. */
const WINDOW_M = 1200;
/** Clearance added to every boulder's radius. Our assumption, not a NASA value. */
export const BOULDER_CLEARANCE_M = 1;
/** Staging rule (drive + walk design): 0.5–1 km from the POI, within ±60° of the bearing to base. */
const STAGING_MIN_M = 500;
const STAGING_MAX_M = 1000;
const STAGING_HALF_ANGLE_DEG = 60;
/** Side of the square the parked rover needs flat and boulder-free. */
export const PARKING_SQUARE_M = 50;
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
}

/** Max-pools the 1 m slope (tenths of a degree) to cells of about cellM and walls steep cells, gaps and boulders. */
export function siteGridFromSlope(
  meta: EquirectMeta,
  slopeTenths: ArrayLike<number>,
  boulders: Boulder[],
  cellM = SITE_CELL_M,
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
  const slope = maxPool(meta, slopeTenths, grid, stepX, stepY);
  const walls = wallMask(grid, slope, []);
  for (const boulder of boulders) wallCircle(grid, walls, boulder);
  return { grid, slope, walls, boulders };
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

// A cell takes its steepest pixel so walls are never under-counted; one nodata pixel makes it NaN, a wall.
function maxPool(
  meta: EquirectMeta,
  slopeTenths: ArrayLike<number>,
  grid: RouteGrid,
  stepX: number,
  stepY: number,
): Float32Array {
  const slope = new Float32Array(grid.width * grid.height).fill(-Infinity);
  for (let y = 0; y < grid.height * stepY; y++) {
    for (let x = 0; x < grid.width * stepX; x++) {
      const value = slopeTenths[y * meta.width + x];
      const cell = Math.floor(y / stepY) * grid.width + Math.floor(x / stepX);
      slope[cell] = value === meta.nodata ? NaN : Math.max(slope[cell], value / TENTHS_PER_DEGREE);
    }
  }
  return slope;
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

/** Reads the site's slope around the POI and its mapped boulders (in the browser: the boulder file is a relative URL). */
export async function loadSiteGrid(site: SiteInfo, signal?: AbortSignal): Promise<SiteGrid> {
  const [{ meta, slopeTenths }, boulders] = await Promise.all([
    readSlopeWindow(site, signal),
    loadBoulders(site.id, signal),
  ]);
  return siteGridFromSlope(meta, slopeTenths, boulders);
}

/** Range-reads only the window around the POI, placed with the COG's own origin and pixel size. */
async function readSlopeWindow(site: SiteInfo, signal?: AbortSignal) {
  if (!SITE_DATA_ROOT) throw new Error("Site slope needs the published site data (SITE_DATA_ROOT)");
  const tiff = await fromUrl(`${SITE_DATA_ROOT}/slope/${site.hiriseId}_slope.tif`, {}, signal);
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
  const [slopeTenths] = await image.readRasters({ window, samples: [0], signal });
  const meta: EquirectMeta = {
    width: window[2] - window[0],
    height: window[3] - window[1],
    west: originLng + window[0] * degreesPerPixel,
    north: originLat - window[1] * degreesPerPixel,
    degreesPerPixel,
    nodata: image.getGDALNoData(),
  };
  return { meta, slopeTenths };
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

/** A staging candidate: a cell, its distance from the POI and how far its bearing is off the bearing to base. */
interface Spot {
  cell: number;
  distanceM: number;
  offBearingDeg: number;
}

/**
 * Where the rover parks for the walk: a flat, boulder-free spot 0.5–1 km from the POI facing base,
 * nearest the bearing to base; else the nearest one on any side, still 0.5 km out (outside the crater),
 * within the walk-back limit; else null.
 */
export function findStagingPoint(site: SiteGrid, poi: LngLat, base: LngLat): LngLat | null {
  const spots = candidateSpots(site.grid, poi, bearingDeg(...eastNorthM(poi, base)));
  const walkBackM = FLIGHT_RULES.walk_back.max_distance_km * 1000;
  // Bearings are compared to the whole degree, so along the bearing the spot nearer the POI wins.
  const facingBase = spots
    .filter(
      (spot) =>
        spot.distanceM >= STAGING_MIN_M &&
        spot.distanceM <= STAGING_MAX_M &&
        spot.offBearingDeg <= STAGING_HALF_ANGLE_DEG,
    )
    .sort(
      (a, b) =>
        Math.round(a.offBearingDeg) - Math.round(b.offBearingDeg) || a.distanceM - b.distanceM,
    );
  const withinWalkBack = spots
    .filter((spot) => spot.distanceM >= STAGING_MIN_M && spot.distanceM <= walkBackM)
    .sort((a, b) => a.distanceM - b.distanceM);
  const parkable = (spot: Spot) => isParkable(site, spot.cell);
  const spot = facingBase.find(parkable) ?? withinWalkBack.find(parkable);
  return spot ? cellCenter(site.grid, spot.cell) : null;
}

/** Cells on a lattice about CANDIDATE_SPACING_M apart, measured from the POI. */
function candidateSpots(grid: RouteGrid, poi: LngLat, toBaseDeg: number): Spot[] {
  const { dx, dy } = cellSize(grid, Math.floor(grid.height / 2));
  const rowStep = Math.max(1, Math.round(CANDIDATE_SPACING_M / dy));
  const colStep = Math.max(1, Math.round(CANDIDATE_SPACING_M / dx));
  const spots: Spot[] = [];
  for (let row = 0; row < grid.height; row += rowStep) {
    for (let col = 0; col < grid.width; col += colStep) {
      const cell = row * grid.width + col;
      const [east, north] = eastNorthM(poi, cellCenter(grid, cell));
      const offBearingDeg = Math.abs(((bearingDeg(east, north) - toBaseDeg + 540) % 360) - 180);
      spots.push({ cell, distanceM: Math.hypot(east, north), offBearingDeg });
    }
  }
  return spots;
}

/**
 * The parking square around the cell lies on the grid, holds no wall (boulder, steep or missing slope)
 * and its mean slope is within the rover's caution slope. The mean, not the steepest cell: on the
 * 1 m DTM no 50 m square at any site keeps every cell under 5°, because DTM noise and polygon troughs
 * add metre-scale slope; noise only raises the mean, so it never hides a tilted area.
 */
function isParkable({ grid, slope, walls }: SiteGrid, cell: number): boolean {
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
  let slopeSum = 0;
  for (let row = centreRow - halfRows; row <= centreRow + halfRows; row++) {
    for (let col = centreCol - halfCols; col <= centreCol + halfCols; col++) {
      const square = row * grid.width + col;
      if (walls[square]) return false;
      slopeSum += slope[square];
    }
  }
  const cells = (2 * halfRows + 1) * (2 * halfCols + 1);
  return slopeSum / cells <= ROVER_RULES.slope.caution_above_degrees;
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

/** Compass bearing in degrees, clockwise from north. */
function bearingDeg(east: number, north: number): number {
  return Math.atan2(east, north) * RADIANS_TO_DEGREES;
}
