import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { EvaVerdict } from "@/lib/flight-rules/evaluate";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { RouteGrid } from "@/lib/mars/route-grid";
import { fallbackParkingReason, type DriveWalkPlan } from "@/lib/mars/drive-walk";
import { BOULDER_CLEARANCE_M, SITE_CELL_M, STAGING_RULE, type Boulder } from "@/lib/mars/site-grid";
import type { LngLat, RouteCollection } from "@/lib/mars/types";
import { MAX_DURATION_S } from "@/lib/mission/types";

import { DriveAssumptions } from "./drive-result";
import { JourneyStatus, journeyReadouts } from "./journey-result";
import type { DriveWalk } from "./route-hooks";
import { ErrorAlert, SolarAlertAssumption, type ReadoutItem } from "./route-result";
import type { SitePoi } from "./scene-panel";

/** The trip's verdict, or why there is no trip yet. */
export function DriveWalkStatus({
  journey,
  destination,
  check,
  notChecked,
}: {
  journey: DriveWalk;
  destination: SitePoi | null;
  /** The trip's verdict, storms included; null until the trip is planned. */
  check: EvaVerdict<string> | null;
  notChecked: string;
}) {
  return (
    waitingLine(journey, destination) ?? (
      <JourneyStatus
        check={check}
        notChecked={notChecked}
        status={journey.plan?.status ?? "planning"}
      />
    )
  );
}

/** The trip's readouts, empty until there is a verdict. */
export function driveWalkReadouts(plan: DriveWalkPlan | null): ReadoutItem[] {
  const route = plan?.collection?.route;
  if (!plan || !route) return [];
  return journeyReadouts(route, plan.drive?.summary ?? null, walkSummary(plan));
}

/** Frames the whole trip, or the walk and its boulders. */
export function FitButtons({
  journey,
  onFit,
}: {
  journey: DriveWalk;
  /** Fits the map to these points. */
  onFit: (points: LngLat[]) => void;
}) {
  const collection = journey.plan?.collection ?? null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!collection}
        onClick={() => collection && onFit(tripPoints(collection))}
      >
        Fit whole trip
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!collection}
        onClick={() => collection && onFit(walkPoints(collection, journey.siteGrid?.boulders))}
      >
        Fit walk
      </Button>
    </div>
  );
}

/** Why no trip can be planned yet, or null once both terrains are in. */
function waitingLine(journey: DriveWalk, destination: SitePoi | null): ReactNode {
  if (journey.error) return <ErrorAlert message={journey.error} />;
  if (journey.driveFailed) {
    return (
      <ErrorAlert message="Rover terrain did not load, so no drive can be planned. Reload the page to retry." />
    );
  }
  if (!destination) {
    return (
      <p className="text-muted-foreground">
        The walk needs a site&apos;s HiRISE terrain. Choose a destination site.
      </p>
    );
  }
  if (journey.siteFailed) {
    return (
      <ErrorAlert
        message={`Site terrain for ${destination.title} did not load, so no walk can be planned. Reload the page to retry, or choose another site.`}
      />
    );
  }
  if (!journey.plan)
    return <p className="text-muted-foreground">Calculating route on the server…</p>;
  return null;
}

/** The walk numbers of the readouts, from the walked paths and walkLegTiming. */
function walkSummary({ walk }: DriveWalkPlan) {
  if (!walk?.timing) return null;
  return {
    distance_km: (walk.outbound.distance_m + walk.back.distance_m) / 1000,
    suit_time_min: walk.timing.suit_time_min,
    suit_minutes_left: walk.timing.suit_minutes_left,
  };
}

/** Every point of the trip: the four legs and the staging point. */
function tripPoints(collection: RouteCollection): LngLat[] {
  return collection.features.flatMap(({ geometry }) =>
    geometry.type === "LineString" ? geometry.coordinates : [geometry.coordinates],
  );
}

/** The walk legs and the site's boulders, which lie around the staging point and the POI. */
function walkPoints(collection: RouteCollection, boulders: Boulder[] = []): LngLat[] {
  const walked = collection.features.flatMap(({ properties, geometry }) =>
    properties.kind === "route-leg" && properties.mode === "walk" && geometry.type === "LineString"
      ? geometry.coordinates
      : [],
  );
  return [...walked, ...boulders.map((boulder) => boulder.center)];
}

/** The drive + walk lines under "Assumptions and data": the rover's first, then the walk's. */
export function DriveWalkAssumptions({
  grid,
  plan,
  cellM,
}: {
  grid: RouteGrid | null;
  plan: DriveWalkPlan | null;
  cellM?: number;
}) {
  const { slope } = FLIGHT_RULES;
  const parking = plan?.parking ?? null;
  return (
    <>
      <DriveAssumptions grid={grid} plan={plan?.drive ?? null} cellM={cellM} />
      <p>
        Walk: HiRISE 1 m slope, each {SITE_CELL_M} m cell taking its steepest value. Ground over{" "}
        {slope.no_go_above_degrees}° is impassable ({slope.applies_to} limit, assumed for Mars).
      </p>
      <p>
        Boulders: automated HiRISE shadow detections near the site, not checked by hand. A hand
        review of a sample found mostly pits and trough shadows, so avoiding them is cautious. Each
        is walled off with {BOULDER_CLEARANCE_M} m clearance (our assumption). Coverage differs by
        site.
      </p>
      <p>{STAGING_RULE}</p>
      {parking?.fallback && <p>{fallbackParkingReason(parking)}</p>}
      {parking && !parking.roughnessChecked && (
        <p>
          Roughness was not checked at this staging point: the site&apos;s roughness data is not
          published yet.
        </p>
      )}
      {plan?.walk?.timing?.assumptions.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <SolarAlertAssumption />
      <p>
        LARA&apos;s resource check gets only the walk back to the rover, which is the shelter: its
        mission clock covers one EVA of up to {MAX_DURATION_S / 3600} h, so a drive of whole sols is
        not sent.
      </p>
    </>
  );
}
