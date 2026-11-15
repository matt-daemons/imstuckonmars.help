import { evaluateDrive } from "@/lib/flight-rules/drive";
import type { EvaVerdict } from "@/lib/flight-rules/evaluate";
import { ROVER, ROVER_RULES, type RoverFactor } from "@/lib/flight-rules/rover-rules";
import type { DriveSummary, planDrive } from "@/lib/mars/driving";
import { cellSize, type RouteGrid } from "@/lib/mars/route-grid";

import {
  failureMessages,
  limitMark,
  Readout,
  searchLine,
  StatusLine,
  type StatusCopy,
} from "./route-result";

export type DrivePlan = ReturnType<typeof planDrive>;

const DRIVE_COPY: StatusCopy = {
  loadFailed: "Rover terrain did not load, so no drive can be planned. Reload the page to retry.",
  failures: failureMessages(
    ROVER_RULES.slope.no_go_above_degrees,
    "Start or end is outside the rover terrain strip. Pick a point inside it.",
  ),
  notChecked: "Not checked: radiation, dust, daylight, rocks.",
};

/** Same shape as RouteResult: one status slot with the verdict first, the readouts below it. */
export function DriveResult({
  plan,
  planning,
  loadFailed,
}: {
  plan: DrivePlan | null;
  planning: boolean;
  loadFailed: boolean;
}) {
  const summary = plan?.summary ?? null;
  const check = summary && evaluateDrive(summary);
  return (
    <div className="flex flex-col gap-1">
      {/* One live region that stays mounted, so screen readers announce every change in it. */}
      <div role="status">
        <StatusLine
          plan={plan}
          check={check}
          loadFailed={loadFailed}
          pending={planning ? "Planning route…" : "Loading rover terrain…"}
          copy={DRIVE_COPY}
        />
      </div>
      {summary && check && <DriveReadouts summary={summary} check={check} />}
    </div>
  );
}

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

function DriveReadouts({
  summary,
  check,
}: {
  summary: DriveSummary;
  check: EvaVerdict<RoverFactor>;
}) {
  const pathExtraPercent = Math.round((ROVER.path_factor - 1) * 100);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <Readout
        label="One way"
        value={`${formatNumber(summary.one_way_km, 0)} km`}
        note={`${formatNumber(summary.straight_km, 0)} km in a straight line`}
        mark={limitMark(check, "range")}
      />
      <Readout
        label="Round trip"
        value={`${formatNumber(summary.odometer_km, 0)} km`}
        note={`Odometer: planned path +${pathExtraPercent}%`}
      />
      <Readout
        label="Sols"
        value={`${summary.sols}`}
        note={`${ROVER.km_per_sol[summary.power]} km per sol`}
        mark={limitMark(check, "trip_length")}
      />
      <Readout
        label="Battery after the hardest day"
        value={`${formatNumber(summary.battery_left_percent, 0)}%`}
        mark={limitMark(check, "battery", "below")}
      />
      <Readout
        label="Drive-back reserve"
        value={`${formatNumber(summary.reserve_km, 0)} km`}
        mark={limitMark(check, "reserve", "below")}
      />
      <Readout
        label="Steepest slope"
        value={`${formatNumber(summary.max_slope, 1)}°`}
        mark={limitMark(check, "slope")}
      />
    </dl>
  );
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
