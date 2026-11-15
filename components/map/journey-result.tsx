import type { EvaVerdict } from "@/lib/flight-rules/evaluate";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { DriveSummary } from "@/lib/mars/driving";
import type { RouteSummary } from "@/lib/mars/types";

import { formatNumber } from "./drive-result";
import { ErrorAlert, limitMark, VerdictAlert, type ReadoutItem } from "./route-result";

/** The walk numbers in the readouts: the walked distance and its suit time from walkLegTiming. */
export interface WalkSummary {
  distance_km: number;
  suit_time_min: number;
  suit_minutes_left: number;
}

// Why there is no journey, by the planner's status.
const FAILURES: Partial<Record<string, string>> = {
  no_staging: `No flat, boulder-free parking spot within ${FLIGHT_RULES.walk_back.max_distance_km} km of the site.`,
  drive_failed: "No drivable route to the parking spot.",
  walk_failed: "No walkable route from the parking spot to the site.",
};

/** The verdict, the reason no journey was found, or the pending line. */
export function JourneyStatus({
  check,
  notChecked,
  status,
}: {
  check: EvaVerdict<string> | null;
  notChecked: string;
  status: string;
}) {
  if (check) return <VerdictAlert check={check} notChecked={notChecked} />;
  const failure = FAILURES[status];
  if (!failure) return <p className="text-muted-foreground">Planning route…</p>;
  // The key replays the shake each time the reason changes.
  return (
    <ErrorAlert
      key={status}
      message={failure}
      className="animate-toast-error-odd motion-reduce:animate-none"
    />
  );
}

/** The drive's readouts, then the walk's, for the legs that were planned. */
export function journeyReadouts(
  route: RouteSummary,
  drive: DriveSummary | null,
  walk: WalkSummary | null,
): ReadoutItem[] {
  const driveItems: ReadoutItem[] = drive
    ? [
        {
          id: "drive-one-way",
          label: "Drive one way",
          value: `${formatNumber(drive.one_way_km, 0)} km`,
          mark: limitMark(route, "range"),
        },
        {
          id: "sols",
          label: "Sols",
          value: `${drive.sols}`,
          mark: limitMark(route, "trip_length"),
        },
        {
          id: "battery",
          label: "Battery after the hardest day",
          value: `${formatNumber(drive.battery_left_percent, 0)}%`,
          mark: limitMark(route, "battery", "below"),
        },
        {
          id: "reserve",
          label: "Drive-back reserve",
          value: `${formatNumber(drive.reserve_km, 0)} km`,
          mark: limitMark(route, "reserve", "below"),
        },
      ]
    : [];
  const walkItems: ReadoutItem[] = walk
    ? [
        {
          id: "walk-distance",
          label: "Walk out and back",
          value: `${formatNumber(walk.distance_km, 2)} km`,
          mark: limitMark(route, "walk_back"),
        },
        {
          id: "suit-time",
          label: "Suit time",
          value: `${formatNumber(walk.suit_time_min, 0)} min`,
          note: `Walking, sampling and the ${FLIGHT_RULES.suit_supply.reserve_minutes} min reserve`,
          mark: limitMark(route, "suit_supply"),
        },
        {
          id: "suit-left",
          label: "Suit minutes left",
          value: `${formatNumber(walk.suit_minutes_left, 0)} min`,
        },
      ]
    : [];
  return [...driveItems, ...walkItems];
}
