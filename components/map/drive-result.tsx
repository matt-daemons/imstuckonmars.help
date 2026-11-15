import { GROUND, ROVER, ROVER_RULES } from "@/lib/flight-rules/rover-rules";
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
  cellM: suppliedCellM,
}: {
  grid: RouteGrid | null;
  plan: DrivePlan | null;
  cellM?: number;
}) {
  const { slope } = ROVER_RULES;
  const cellM = suppliedCellM ?? (grid ? cellSize(grid, 0).dy : null);
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
      <p>
        Soft ground (THEMIS thermal inertia):{" "}
        {plan?.summary &&
          `${formatNumber(plan.summary.ground_km.loose_dust, 1)} km of loose dust and ${formatNumber(plan.summary.ground_km.no_data, 1)} km with no data on the drive out and back. `}
        Loose dust doubles rolling resistance to{" "}
        {formatNumber(GROUND.loose_dust.rolling_resistance, 2)}, our assumption; gaps keep{" "}
        {GROUND.no_data.rolling_resistance}. Thermal inertia is ±20 %, sees only the top few cm in
        100 m pixels and covers about 57 % of the area.
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
      <p>
        Rover rules are the team's agreed rules, based on NASA studies; sources in
        docs/research/rover.
      </p>
      <p>{searchLine(plan)}</p>
    </>
  );
}
