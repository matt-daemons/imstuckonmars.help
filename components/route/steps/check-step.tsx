"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import type { ReactNode } from "react";

import type { Verdict } from "@/lib/mars/types";

import {
  DriveWalkAssumptions,
  DriveWalkStatus,
  FitButtons,
  driveWalkReadouts,
} from "@/components/map/drive-walk-result";
import { RouteLegend } from "@/components/map/route-legend";
import {
  Readouts,
  WalkAssumptions,
  WalkStatus,
  walkReadouts,
  type ReadoutItem,
} from "@/components/map/route-result";
import { fitPoints } from "@/components/route/camera";
import { notCheckedText, tripWithStorms, walkWithStorms } from "@/components/route/conditions";
import { useConditions } from "@/components/route/conditions-provider";
import { missingChoice } from "@/components/route/route-plan";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Preflight } from "@/components/expedition/preflight";
import { ErrorAlert } from "@/components/map/route-result";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { splitHeadline } from "./headline";
import { MissionSummary } from "./mission-summary-dialog";
import { RouteCompare } from "./route-compare";
import { SpaceWeatherLine } from "./space-weather-line";
import { StormDrill } from "./storm-drill";
import { selectedRoute } from "../selected-route";
import { RouteCalculationProgress } from "../route-calculation-progress";

// Each mission's headline readouts. The last one gives way to the verdict's own readout.
const WALK_HEADLINE = ["slope", "time", "distance"];
const DRIVE_WALK_HEADLINE = ["sols", "battery", "suit-left"];

/** Step 03: the verdict and its reasons, three headline numbers, then the rest one click down. */
export function CheckStep({ map }: { map: MapLibreMap | null }) {
  const { planning } = useRoutePlan();
  return (
    <>
      <div role="status">{planning && <RouteCalculationProgress />}</div>
      <div role="region" aria-label="Route check" aria-busy={planning}>
        {!planning && <CheckContent map={map} />}
      </div>
    </>
  );
}

function CheckContent({ map }: { map: MapLibreMap | null }) {
  const { inputs, walk, journey, destination, planningError, retryPlanning } = useRoutePlan();
  const selected = selectedRoute(inputs, { walk, journey });
  const selectedJourney = { ...journey, plan: selected.trip };
  const { conditions } = useConditions();
  const missing = missingChoice(inputs);
  if (missing) return <p role="status">{missing}</p>;
  if (planningError)
    return (
      <div className="flex flex-col gap-3">
        <ErrorAlert message={planningError} />
        <Button variant="outline" onClick={retryPlanning}>
          Retry route calculation
        </Button>
      </div>
    );
  if (inputs.mission === "walking") {
    const summary = selected.walk?.summary ?? null;
    const check = summary && walkWithStorms(summary, conditions);
    const notChecked = check ? notCheckedText(check.not_checked, conditions) : "";
    return (
      <CheckLayout
        status={
          <WalkStatus
            plan={selected.walk}
            check={check}
            notChecked={notChecked}
            loadFailed={walk.loadFailed}
          />
        }
        verdict={check}
        readouts={summary && check ? walkReadouts(summary, check) : []}
        headline={WALK_HEADLINE}
        assumptions={<WalkAssumptions plan={selected.walk} />}
      />
    );
  }
  const trip = selected.trip && tripWithStorms(selected.trip, conditions);
  const notChecked = trip ? notCheckedText(trip.not_checked, conditions) : "";
  return (
    <CheckLayout
      status={
        <DriveWalkStatus
          journey={selectedJourney}
          destination={destination}
          check={trip}
          notChecked={notChecked}
        />
      }
      verdict={trip}
      readouts={driveWalkReadouts(selected.trip)}
      headline={DRIVE_WALK_HEADLINE}
      fit={<FitButtons journey={selectedJourney} onFit={(points) => fitPoints(map, points)} />}
      source={selected.trip?.collection?.route?.source}
      assumptions={
        <DriveWalkAssumptions
          grid={journey.driveGrid}
          plan={selected.trip}
          cellM={journey.driveCellM}
        />
      }
    />
  );
}

function CheckLayout({
  status,
  verdict,
  readouts,
  headline,
  fit,
  source,
  assumptions,
}: {
  status: ReactNode;
  verdict: { verdict: Verdict; reasons: string[] } | null;
  readouts: ReadoutItem[];
  headline: string[];
  fit?: ReactNode;
  source?: string;
  assumptions: ReactNode;
}) {
  const { mission, zones, showShortest } = useRoutePlan().inputs;
  const split = splitHeadline(readouts, headline);
  return (
    <div className="flex flex-col gap-3">
      {/* One live region that stays mounted, so screen readers announce every change in it. */}
      <div role="status">{status}</div>
      <SpaceWeatherLine />
      {split.headline.length > 0 && <Readouts items={split.headline} className="grid-cols-3" />}
      <div className="flex flex-wrap gap-2">
        {fit}
        <MissionSummary status={status} keyNumbers={split.headline} assumptions={assumptions} />
      </div>
      <RouteCompare />
      <Preflight verdict={verdict} />
      <Accordion multiple>
        <AccordionItem value="details">
          <AccordionTrigger>Details</AccordionTrigger>
          <AccordionPanel className="flex flex-col gap-2 text-foreground">
            {split.details.length > 0 && <Readouts items={split.details} />}
            {source && <p className="text-xs text-muted-foreground">Source: {source}</p>}
            <p className="text-xs">
              No-go zones: {zones.length ? zones.map((zone) => zone.name).join(", ") : "none"}
            </p>
            {mission && <RouteLegend mode={mission} shortest={showShortest} />}
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="assumptions">
          <AccordionTrigger>Assumptions and data</AccordionTrigger>
          <AccordionPanel className="flex flex-col gap-1 text-xs">{assumptions}</AccordionPanel>
        </AccordionItem>
        <StormDrill />
      </Accordion>
    </div>
  );
}
