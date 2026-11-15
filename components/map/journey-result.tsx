import { useId, type ReactNode } from "react";

import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { DriveSummary } from "@/lib/mars/driving";
import type { RouteCollection, RouteSummary } from "@/lib/mars/types";

import { formatNumber } from "./drive-result";
import { ErrorAlert, limitMark, Readout, VerdictAlert } from "./route-result";

/** The walk numbers the panel shows: the walked distance and its suit time from walkLegTiming. */
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

/** Same shape as RouteResult: one status slot with the verdict first, then the drive and walk readouts. */
export function JourneyResult({
  collection,
  status,
  drive,
  walk,
}: {
  collection: RouteCollection | null;
  status: string;
  drive: DriveSummary | null;
  walk: WalkSummary | null;
}) {
  const route = collection?.route ?? null;
  return (
    <div className="flex flex-col gap-2">
      {/* One live region that stays mounted, so screen readers announce every change in it. */}
      <div role="status">
        <JourneyStatus route={route} status={status} />
      </div>
      {route && drive && <DriveReadouts route={route} drive={drive} />}
      {route && walk && <WalkReadouts route={route} walk={walk} />}
      {route && <p className="text-xs text-muted-foreground">Source: {route.source}</p>}
    </div>
  );
}

/** The verdict, the reason no journey was found, or the pending line. */
function JourneyStatus({ route, status }: { route: RouteSummary | null; status: string }) {
  if (route) {
    return <VerdictAlert check={route} notChecked="Not checked: radiation, dust, daylight." />;
  }
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

function DriveReadouts({ route, drive }: { route: RouteSummary; drive: DriveSummary }) {
  return (
    <ReadoutGroup title="Drive">
      <Readout
        label="One way"
        value={`${formatNumber(drive.one_way_km, 0)} km`}
        mark={limitMark(route, "range")}
      />
      <Readout label="Sols" value={`${drive.sols}`} mark={limitMark(route, "trip_length")} />
      <Readout
        label="Battery after the hardest day"
        value={`${formatNumber(drive.battery_left_percent, 0)}%`}
        mark={limitMark(route, "battery", "below")}
      />
      <Readout
        label="Drive-back reserve"
        value={`${formatNumber(drive.reserve_km, 0)} km`}
        mark={limitMark(route, "reserve", "below")}
      />
    </ReadoutGroup>
  );
}

function WalkReadouts({ route, walk }: { route: RouteSummary; walk: WalkSummary }) {
  return (
    <ReadoutGroup title="Walk">
      <Readout
        label="Distance out and back"
        value={`${formatNumber(walk.distance_km, 2)} km`}
        mark={limitMark(route, "walk_back")}
      />
      <Readout
        label="Suit time"
        value={`${formatNumber(walk.suit_time_min, 0)} min`}
        note={`Walking, sampling and the ${FLIGHT_RULES.suit_supply.reserve_minutes} min reserve`}
        mark={limitMark(route, "suit_supply")}
      />
      <Readout label="Suit minutes left" value={`${formatNumber(walk.suit_minutes_left, 0)} min`} />
    </ReadoutGroup>
  );
}

function ReadoutGroup({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-1">
      <h3 id={titleId} className="font-heading text-xs font-semibold">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </div>
  );
}
