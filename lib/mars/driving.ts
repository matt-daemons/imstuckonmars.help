import { GROUND, ROVER, ROVER_RULES } from "../flight-rules/rover-rules";
import { cellAt, type RouteGrid } from "./route-grid";
import {
  findPath,
  marsDistanceM,
  pathSteps,
  type PlannedPath,
  type StepCostModel,
} from "./routing";
import type { LngLat } from "./types";

const MARS_GRAVITY = 3.71; // m/s²
const RADIANS_TO_DEGREES = 180 / Math.PI;

export type PowerSource = keyof typeof ROVER.km_per_sol;
export type Ground = keyof typeof GROUND;

/** A THEMIS gap in the drive grid's thermal inertia. */
export const NO_THERMAL_INERTIA = -9999;

/** The MOLA drive strip with THEMIS thermal inertia (J m⁻² K⁻¹ s⁻½) on the same cells. */
export interface DriveGrid extends RouteGrid {
  thermalInertia: Int16Array;
}

export interface DriveSummary {
  one_way_km: number;
  /** Out and back, lengthened by the path factor. */
  odometer_km: number;
  sols: number;
  /** Energy of the hardest sol, overnight life support included. */
  hardest_sol_kwh: number;
  battery_left_percent: number;
  /** Bad-terrain kilometres the energy above the battery floor still covers after the hardest sol. */
  reserve_km: number;
  max_slope: number;
  straight_km: number;
  power: PowerSource;
  /** Planned-path km out and back on each ground class (not odometer km). */
  ground_km: Record<Ground, number>;
}

/** The ground class of a cell; a THEMIS gap is "no_data", never taken for firm ground. */
export function groundOf(thermalInertia: number): Ground {
  if (thermalInertia === NO_THERMAL_INERTIA) return "no_data";
  if (thermalInertia < GROUND.loose_dust.below_thermal_inertia) return "loose_dust";
  if (thermalInertia < GROUND.sand_crust.below_thermal_inertia) return "sand_crust";
  return "firm";
}

/** Battery energy (Wh) for one step: traction, with nothing back downhill, plus life support for the time taken. */
export function stepEnergyWh(
  horizontalM: number,
  riseM: number,
  rollingResistance: number,
): number {
  const lengthM = Math.hypot(horizontalM, riseM);
  const slope = Math.atan2(riseM, horizontalM);
  const resistance = Math.max(0, rollingResistance * Math.cos(slope) + Math.sin(slope));
  const tractionWh =
    (ROVER.mass_kg * MARS_GRAVITY * resistance * lengthM) / ROVER.drivetrain_efficiency / 3600;
  const speedKmh =
    ROVER.flat_speed_kmh - ROVER.speed_loss_kmh_per_degree * Math.abs(slope * RADIANS_TO_DEGREES);
  const hours = lengthM / 1000 / speedKmh;
  return tractionWh + ROVER.hotel_kw * 1000 * hours;
}

/**
 * A* cost for driving: energy on each cell's ground. No step costs less than life support at top speed,
 * whatever the ground, because traction is never negative.
 */
export function drivingCost(grid: DriveGrid): StepCostModel {
  return {
    stepCost: (horizontalM, riseM, fromCell, toCell) =>
      stepEnergyWh(horizontalM, riseM, stepRollingResistance(grid, fromCell, toCell)),
    costPerMetreLowerBound: (ROVER.hotel_kw * 1000) / (ROVER.flat_speed_kmh * 1000),
  };
}

/** A step runs half on each of its two cells, so it takes the mean of their rolling resistances. */
function stepRollingResistance(grid: DriveGrid, fromCell: number, toCell: number): number {
  const at = (cell: number) => GROUND[groundOf(grid.thermalInertia[cell])].rolling_resistance;
  return (at(fromCell) + at(toCell)) / 2;
}

/** The drive out to the target and back to base; summary is null unless both legs are ok. */
export function planDrive(
  grid: DriveGrid,
  slope: Float32Array,
  walls: Uint8Array,
  base: LngLat,
  target: LngLat,
  power: PowerSource,
): { outbound: PlannedPath; back: PlannedPath; summary: DriveSummary | null } {
  const options = { maxSlopeDeg: ROVER_RULES.slope.no_go_above_degrees, cost: drivingCost(grid) };
  const outbound = findPath(grid, slope, walls, base, target, options);
  const back = findPath(grid, slope, walls, target, base, options);
  if (outbound.status !== "ok" || back.status !== "ok") return { outbound, back, summary: null };
  return { outbound, back, summary: summarize(grid, outbound, back, power) };
}

function summarize(
  grid: DriveGrid,
  outbound: PlannedPath,
  back: PlannedPath,
  power: PowerSource,
): DriveSummary {
  const kmPerSol = ROVER.km_per_sol[power];
  const odometerKm = ((outbound.distance_m + back.distance_m) * ROVER.path_factor) / 1000;
  const sols = Math.ceil(odometerKm / kmPerSol);
  const drivingKwh = energyPerSolWh(grid, [outbound, back], kmPerSol, sols).map((wh) => wh / 1000);
  const hardestKwh = Math.max(0, ...drivingKwh) + ROVER.hotel_kw * ROVER.overnight_hours[power];
  const aboveFloorKwh = ROVER.battery_kwh * (1 - ROVER_RULES.battery.no_go_below_percent / 100);
  const badTerrainKwhPerKm =
    stepEnergyWh(1000, 0, ROVER.bad_terrain_factor * ROVER.rolling_resistance) / 1000;
  const base = outbound.path[0];
  const target = outbound.path[outbound.path.length - 1];
  return {
    one_way_km: outbound.distance_m / 1000,
    odometer_km: odometerKm,
    sols,
    hardest_sol_kwh: hardestKwh,
    battery_left_percent: ((ROVER.battery_kwh - hardestKwh) / ROVER.battery_kwh) * 100,
    reserve_km: (aboveFloorKwh - hardestKwh) / badTerrainKwhPerKm,
    max_slope: Math.max(outbound.max_slope_deg, back.max_slope_deg),
    straight_km: marsDistanceM(base, target) / 1000,
    power,
    ground_km: groundKm(grid, [outbound, back]),
  };
}

/** Each step of a leg with the two cells it joins. */
function legSteps(grid: DriveGrid, leg: PlannedPath) {
  const cells = leg.path.map((point) => cellAt(grid, point)!);
  return pathSteps(grid, cells).map((step, i) => ({ ...step, from: cells[i], to: cells[i + 1] }));
}

/** Path km on each ground class; a step counts half for each of its two cells, as its energy does. */
function groundKm(grid: DriveGrid, legs: PlannedPath[]): Record<Ground, number> {
  const km = { loose_dust: 0, sand_crust: 0, firm: 0, no_data: 0 };
  for (const leg of legs) {
    for (const { horizontalM, riseM, from, to } of legSteps(grid, leg)) {
      const halfKm = Math.hypot(horizontalM, riseM) / 2000;
      km[groundOf(grid.thermalInertia[from])] += halfKm;
      km[groundOf(grid.thermalInertia[to])] += halfKm;
    }
  }
  return km;
}

/** Driving energy of each sol: the legs cut into pieces of one sol's odometer distance. */
function energyPerSolWh(
  grid: DriveGrid,
  legs: PlannedPath[],
  kmPerSol: number,
  sols: number,
): number[] {
  const perSol = Array.from({ length: sols }, () => 0);
  let odometerKm = 0;
  for (const leg of legs) {
    for (const { horizontalM, riseM, from, to } of legSteps(grid, leg)) {
      const sol = Math.min(Math.floor(odometerKm / kmPerSol), sols - 1);
      const rollingResistance = stepRollingResistance(grid, from, to);
      perSol[sol] += ROVER.path_factor * stepEnergyWh(horizontalM, riseM, rollingResistance);
      odometerKm += (ROVER.path_factor * Math.hypot(horizontalM, riseM)) / 1000;
    }
  }
  return perSol;
}
