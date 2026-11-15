import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { RouteGrid } from "@/lib/mars/route-grid";
import {
  BOULDER_CLEARANCE_M,
  PARKING_SQUARE_M,
  SITE_CELL_M,
  type Boulder,
} from "@/lib/mars/site-grid";
import type { LngLat, RouteCollection } from "@/lib/mars/types";

import { DriveAssumptions } from "./drive-result";
import { JourneyResult } from "./journey-result";
import type { DriveWalk } from "./route-hooks";
import { ErrorAlert } from "./route-result";
import type { SitePoi } from "./scene-panel";

/** The drive + walk verdict and readouts, or why there is no trip yet; then the two fit buttons. */
export function DriveWalkResult({
  journey,
  destination,
  onFit,
}: {
  journey: DriveWalk;
  destination: SitePoi | null;
  /** Fits the map to these points. */
  onFit: (points: LngLat[]) => void;
}) {
  const { plan } = journey;
  const collection = plan?.collection ?? null;
  const waiting = waitingLine(journey, destination);
  return (
    <div className="flex flex-col gap-2">
      {waiting ? (
        // A live region of its own, like JourneyResult's, so a failed load is announced.
        <div role="status">{waiting}</div>
      ) : (
        <JourneyResult
          collection={collection}
          status={plan?.status ?? "planning"}
          drive={plan?.drive?.summary ?? null}
          walk={plan && walkSummary(plan)}
        />
      )}
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
    </div>
  );
}

/** Why no trip can be planned yet, or null once both terrains are in. */
function waitingLine(journey: DriveWalk, destination: SitePoi | null): ReactNode {
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
  if (!journey.driveGrid) return <p className="text-muted-foreground">Loading rover terrain…</p>;
  if (!journey.siteGrid) return <p className="text-muted-foreground">Loading site terrain…</p>;
  return null;
}

/** The walk numbers JourneyResult shows, from the walked paths and walkLegTiming. */
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
}: {
  grid: RouteGrid | null;
  plan: DriveWalkPlan | null;
}) {
  const { slope, walk_back } = FLIGHT_RULES;
  return (
    <>
      <DriveAssumptions grid={grid} plan={plan?.drive ?? null} />
      <p>
        Walk: HiRISE 1 m slope, each {SITE_CELL_M} m cell taking its steepest value. Ground over{" "}
        {slope.no_go_above_degrees}° is impassable ({slope.applies_to} limit, assumed for Mars).
      </p>
      <p>
        Boulders: automated HiRISE detections near the site, each walled off with{" "}
        {BOULDER_CLEARANCE_M} m clearance (our assumption). Coverage differs by site.
      </p>
      <p>
        Staging point (our rule): the rover parks where a {PARKING_SQUARE_M} m square is no steeper
        than {ROVER_RULES.slope.caution_above_degrees}° and clear of boulders, on the habitat side
        if it can, within the {walk_back.max_distance_km} km walk-back limit.
      </p>
      {plan?.walk?.timing?.assumptions.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}
