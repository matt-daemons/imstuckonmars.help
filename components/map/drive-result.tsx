import { ROVER, ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import type { planDrive } from "@/lib/mars/driving";
import { cellSize, type RouteGrid } from "@/lib/mars/route-grid";

import { searchLine } from "./route-result";

export type DrivePlan = ReturnType<typeof planDrive>;

// D-5: fixed decimals, a true minus sign, thousands separators from five digits.
export function formatNumber(value: number, digits: number): string {
  return value
    .toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: "min2",
    })
    .replace("-", "−");
}

/** The driving lines under "Assumptions and data". Every number comes from the rover rules or the grid. */
export function DriveAssumptions({
  grid,
  plan,
}: {
  grid: RouteGrid | null;
  plan: DrivePlan | null;
}) {
  const { slope } = ROVER_RULES;
  const cellM = grid ? cellSize(grid, 0).dy : null;
  return (
    <>
      <p>
        Rover: NASA Mars Architecture Team rover study, 2022: {ROVER.battery_kwh} kWh,{" "}
        {formatNumber(ROVER.mass_kg / 1000, 1)} t, {ROVER.hotel_kw} kW life support,{" "}
        {ROVER.flat_speed_kmh} km/h.
      </p>
      <p>
        Rolling resistance {ROVER.rolling_resistance} is a Moon-soil value; motor efficiency{" "}
        {ROVER.drivetrain_efficiency} and rough ground ×{ROVER.bad_terrain_factor} are our
        assumptions.
      </p>
      {cellM !== null && (
        <p>
          Terrain: MOLA {Math.round(cellM)} m. Slopes shorter than about{" "}
          {formatNumber(cellM / 1000, 1)} km are not resolved, so limits are lowered to{" "}
          {slope.caution_above_degrees}° and {slope.no_go_above_degrees}°.
        </p>
      )}
      <p>
        Two rovers travel together; beyond about {ROVER.walk_back_km} km a breakdown means waiting
        for rescue.
      </p>
      <p>Rover rules are a proposal from NASA studies; sources in docs/research/rover.</p>
      <p>{searchLine(plan)}</p>
    </>
  );
}
