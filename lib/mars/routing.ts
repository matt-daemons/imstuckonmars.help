import { FLIGHT_RULES } from "../flight-rules/rules";
import { cellAt, cellCenter, cellSize, type RouteGrid } from "./route-grid";
import { MARS_RADIUS_M } from "./terrain";
import type { LngLat } from "./types";
import { unwrapZoneRing } from "./route-zones";

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

export const MAX_SLOPE_DEG: number = FLIGHT_RULES.slope.no_go_above_degrees;

/** An area the walker must not enter. The ring has at least 3 corners and is not closed. */
export interface NoGoZone {
  id: string;
  name: string;
  ring: LngLat[];
}

export type RouteStatus = "ok" | "no_path" | "outside_grid" | "start_blocked" | "goal_blocked";

export interface PlannedPath {
  status: RouteStatus;
  /** Endpoint rejection cause; an exclusion can be a hand-drawn zone or a mapped obstacle. */
  blocked_by?: "slope" | "no_data" | "zone_or_obstacle";
  /** Exact start, interior cell centres, exact goal; [] unless ok. */
  path: LngLat[];
  /** 3D length of the path. */
  distance_m: number;
  /** The A* total in the cost model's unit: metres by default, Wh when driving. */
  cost: number;
  /** Steepest cell slope among path cells. */
  max_slope_deg: number;
  /** Walking time by Tobler's off-path hiking function. */
  time_min: number;
  /** Cells taken off the open list. */
  expanded: number;
}

export interface RouteSummary {
  distance_km: number;
  est_time_min: number;
  max_slope: number;
  farthest_from_base_km: number;
}

/** Slope of each cell in degrees (Horn's 3×3 method), NaN where any neighbour has no data. */
export function slopeDegrees(grid: RouteGrid): Float32Array {
  const { width, height, heights } = grid;
  const slope = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const { dx, dy } = cellSize(grid, row);
    for (let col = 0; col < width; col++) {
      // z(r, c) reads a neighbour, clamping at the grid edges.
      const z = (r: number, c: number) =>
        heights[clamp(row + r, height) * width + clamp(col + c, width)];
      const dzdx =
        (z(-1, 1) + 2 * z(0, 1) + z(1, 1) - (z(-1, -1) + 2 * z(0, -1) + z(1, -1))) / (8 * dx);
      const dzdy =
        (z(1, -1) + 2 * z(1, 0) + z(1, 1) - (z(-1, -1) + 2 * z(-1, 0) + z(-1, 1))) / (8 * dy);
      slope[row * width + col] = Math.atan(Math.hypot(dzdx, dzdy)) * RADIANS_TO_DEGREES;
    }
  }
  return slope;
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/** 1 marks a wall: no data, slope over the limit, or a cell centre inside a no-go zone. */
export function wallMask(
  grid: RouteGrid,
  slope: Float32Array,
  zones: NoGoZone[],
  maxSlopeDeg = MAX_SLOPE_DEG,
): Uint8Array {
  const walls = new Uint8Array(slope.length);
  const rings = zones.map((zone) => unwrapZoneRing(zone.ring));
  for (let cell = 0; cell < slope.length; cell++) {
    const steep = Number.isNaN(slope[cell]) || slope[cell] > maxSlopeDeg;
    const centre = cellCenter(grid, cell);
    walls[cell] = steep || rings.some((ring) => insideRing(centre, ring)) ? 1 : 0;
  }
  return walls;
}

// Ray casting in plain longitude/latitude, which is accurate enough at walking scale.
function insideRing([lng, lat]: LngLat, ring: LngLat[]): boolean {
  if (!ring.length) return false;
  // Match the point to the polygon's world copy, not the grid's longitude domain.
  lng += 360 * Math.round((ring[0][0] - lng) / 360);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    const crosses =
      latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (crosses) inside = !inside;
  }
  return inside;
}

const NEIGHBOURS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

type CellSizes = { dx: number; dy: number }[];

/** What a step costs A*, and the least any step can cost per metre, which keeps the heuristic admissible. */
export interface StepCostModel {
  /** fromCell and toCell let a model weigh the ground itself, e.g. by slope. */
  stepCost: (horizontalM: number, riseM: number, fromCell: number, toCell: number) => number;
  costPerMetreLowerBound: number;
}

/** Plain 3D distance: A* then finds the shortest route the walls allow. */
export const DISTANCE_COST: StepCostModel = {
  stepCost: (horizontalM, riseM) => Math.hypot(horizontalM, riseM),
  costPerMetreLowerBound: 1,
};

/** A* over the grid from the start cell to the goal cell. */
export function findPath(
  grid: RouteGrid,
  slope: Float32Array,
  walls: Uint8Array,
  start: LngLat,
  goal: LngLat,
  {
    maxSlopeDeg = MAX_SLOPE_DEG,
    heuristic = true,
    cost = DISTANCE_COST,
  }: { maxSlopeDeg?: number; heuristic?: boolean; cost?: StepCostModel } = {},
): PlannedPath {
  const startCell = cellAt(grid, start);
  const goalCell = cellAt(grid, goal);
  if (startCell === null || goalCell === null) return failed("outside_grid", 0);
  if (walls[startCell]) return blocked("start_blocked", slope[startCell], maxSlopeDeg);
  if (walls[goalCell]) return blocked("goal_blocked", slope[goalCell], maxSlopeDeg);

  const sizes = Array.from({ length: grid.height }, (_, row) => cellSize(grid, row));
  const distanceToGoal = distanceEstimate(grid, sizes, goalCell);
  const h = heuristic
    ? (cell: number) => cost.costPerMetreLowerBound * distanceToGoal(cell)
    : () => 0;
  const gScore = new Float64Array(grid.width * grid.height).fill(Infinity);
  const cameFrom = new Int32Array(grid.width * grid.height).fill(-1);
  const closed = new Uint8Array(grid.width * grid.height);
  const open = new MinHeap();
  gScore[startCell] = 0;
  open.push(startCell, h(startCell));
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue; // stale entry: this cell was already reached more cheaply
    closed[current] = 1;
    expanded++;
    if (current === goalCell) {
      const cells = reconstructPath(cameFrom, current);
      return finished(grid, slope, cells, start, goal, gScore[current], expanded);
    }
    for (const { cell: next, stepCost } of steps(grid, walls, sizes, cost, current, maxSlopeDeg)) {
      const tentativeG = gScore[current] + stepCost;
      if (tentativeG < gScore[next]) {
        cameFrom[next] = current;
        gScore[next] = tentativeG;
        open.push(next, tentativeG + h(next));
      }
    }
  }
  return failed("no_path", expanded);
}

function failed(status: RouteStatus, expanded: number): PlannedPath {
  return { status, path: [], distance_m: 0, cost: 0, max_slope_deg: 0, time_min: 0, expanded };
}

function blocked(
  status: "start_blocked" | "goal_blocked",
  slopeDeg: number,
  maxSlopeDeg: number,
): PlannedPath {
  const blocked_by = Number.isNaN(slopeDeg)
    ? "no_data"
    : slopeDeg > maxSlopeDeg
      ? "slope"
      : "zone_or_obstacle";
  return { ...failed(status, 0), blocked_by };
}

/** Straight-line distance with the grid's smallest spacings, so it never overestimates. */
function distanceEstimate(grid: RouteGrid, sizes: CellSizes, goalCell: number) {
  const minDx = Math.min(...sizes.map((size) => size.dx));
  const minDy = Math.min(...sizes.map((size) => size.dy));
  const goalRow = Math.floor(goalCell / grid.width);
  const goalCol = goalCell % grid.width;
  return (cell: number) =>
    Math.hypot(
      Math.abs(Math.floor(cell / grid.width) - goalRow) * minDy,
      Math.abs((cell % grid.width) - goalCol) * minDx,
    );
}

/** The open neighbours of a cell and the cost of stepping to each. */
function steps(
  grid: RouteGrid,
  walls: Uint8Array,
  sizes: CellSizes,
  cost: StepCostModel,
  cell: number,
  maxSlopeDeg: number,
): { cell: number; stepCost: number }[] {
  const { width, height, heights } = grid;
  const row = Math.floor(cell / width);
  const col = cell % width;
  const isOpen = (r: number, c: number) =>
    r >= 0 && r < height && c >= 0 && c < width && !walls[r * width + c];
  const result = [];
  for (const [dRow, dCol] of NEIGHBOURS) {
    if (!isOpen(row + dRow, col + dCol)) continue;
    // No corner cutting: a diagonal step needs both side cells open.
    if (dRow && dCol && !(isOpen(row + dRow, col) && isOpen(row, col + dCol))) continue;
    const next = (row + dRow) * width + col + dCol;
    const horizontal = horizontalM(sizes, row, dRow, dCol);
    const rise = heights[next] - heights[cell];
    if (Math.atan(Math.abs(rise) / horizontal) * RADIANS_TO_DEGREES > maxSlopeDeg) continue;
    result.push({ cell: next, stepCost: cost.stepCost(horizontal, rise, cell, next) });
  }
  return result;
}

/** Horizontal length of a step, averaging the cell sizes of the two rows involved. */
function horizontalM(sizes: CellSizes, row: number, dRow: number, dCol: number): number {
  const from = sizes[row];
  const to = sizes[row + dRow];
  return Math.hypot((dCol * (from.dx + to.dx)) / 2, (dRow * (from.dy + to.dy)) / 2);
}

function reconstructPath(cameFrom: Int32Array, goalCell: number): number[] {
  const cells = [goalCell];
  while (cameFrom[cells[0]] !== -1) cells.unshift(cameFrom[cells[0]]);
  return cells;
}

function finished(
  grid: RouteGrid,
  slope: Float32Array,
  cells: number[],
  start: LngLat,
  goal: LngLat,
  cost: number,
  expanded: number,
): PlannedPath {
  const path = [start, ...cells.slice(1, -1).map((cell) => cellCenter(grid, cell)), goal];
  // Measure along the drawn path: its ends are the exact start and goal, not their cell centres,
  // so cell-to-cell steps alone would drop up to a cell's length at each end of the walk.
  const pointCells = cells.length === 1 ? [cells[0], cells[0]] : cells;
  const legSteps: PathStep[] = path
    .slice(1)
    .map((point, i) => ({
      horizontalM: marsDistanceM(path[i], point),
      riseM: grid.heights[pointCells[i + 1]] - grid.heights[pointCells[i]],
    }))
    .filter((step) => step.horizontalM > 0);
  return {
    status: "ok",
    path,
    distance_m: legSteps.reduce((sum, step) => sum + Math.hypot(step.horizontalM, step.riseM), 0),
    cost,
    max_slope_deg: Math.max(...cells.map((cell) => slope[cell])),
    time_min: walkingMinutes(legSteps),
    expanded,
  };
}

/** One step between neighbouring cells, in metres. */
export type PathStep = { horizontalM: number; riseM: number };

/** Horizontal length and rise of each step along a path of cells. */
export function pathSteps(grid: RouteGrid, cells: number[]): PathStep[] {
  const sizes = Array.from({ length: grid.height }, (_, row) => cellSize(grid, row));
  return cells.slice(1).map((cell, i) => {
    const from = cells[i];
    const row = Math.floor(from / grid.width);
    const dRow = Math.floor(cell / grid.width) - row;
    const dCol = (cell % grid.width) - (from % grid.width);
    return {
      horizontalM: horizontalM(sizes, row, dRow, dCol),
      riseM: grid.heights[cell] - grid.heights[from],
    };
  });
}

// Tobler's off-path hiking function: km/h = 3.6 · e^(−3.5 · |grade + 0.05|), uphill grade positive.
function walkingMinutes(legSteps: PathStep[]): number {
  let minutes = 0;
  for (const { horizontalM, riseM } of legSteps) {
    const speedKmH = 3.6 * Math.exp(-3.5 * Math.abs(riseM / horizontalM + 0.05));
    minutes += horizontalM / ((speedKmH * 1000) / 60);
  }
  return minutes;
}

/** The walk out to the target and back to base; summary is null unless both legs are ok. */
export function planWalk(
  grid: RouteGrid,
  slope: Float32Array,
  walls: Uint8Array,
  base: LngLat,
  target: LngLat,
  cost: StepCostModel = DISTANCE_COST,
): { outbound: PlannedPath; back: PlannedPath; summary: RouteSummary | null } {
  const outbound = findPath(grid, slope, walls, base, target, { cost });
  const back = findPath(grid, slope, walls, target, base, { cost });
  if (outbound.status !== "ok" || back.status !== "ok") return { outbound, back, summary: null };
  return {
    outbound,
    back,
    summary: {
      distance_km: outbound.distance_m / 1000,
      est_time_min: outbound.time_min + back.time_min,
      max_slope: Math.max(outbound.max_slope_deg, back.max_slope_deg),
      farthest_from_base_km:
        Math.max(...outbound.path.map((point) => marsDistanceM(base, point))) / 1000,
    },
  };
}

// Equirectangular approximation on the Mars sphere, fine over walking and driving distances.
export function marsDistanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const meanLat = ((lat1 + lat2) / 2) * DEGREES_TO_RADIANS;
  const eastDeg = ((lng2 - lng1 + 540) % 360) - 180; // the short way across the ±180° line
  const east = eastDeg * DEGREES_TO_RADIANS * Math.cos(meanLat);
  const north = (lat2 - lat1) * DEGREES_TO_RADIANS;
  return MARS_RADIUS_M * Math.hypot(east, north);
}

/** Binary min-heap of cells keyed on f-score, the open list of A*. */
class MinHeap {
  private cells: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, key: number): void {
    this.cells.push(cell);
    this.keys.push(key);
    let child = this.cells.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.keys[parent] <= this.keys[child]) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  /** Removes and returns the cell with the smallest key. */
  pop(): number {
    const top = this.cells[0];
    const lastCell = this.cells.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.keys[0] = lastKey;
      this.siftDown();
    }
    return top;
  }

  private siftDown(): void {
    let parent = 0;
    while (true) {
      const left = 2 * parent + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.size && this.keys[left] < this.keys[smallest]) smallest = left;
      if (right < this.size && this.keys[right] < this.keys[smallest]) smallest = right;
      if (smallest === parent) return;
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
