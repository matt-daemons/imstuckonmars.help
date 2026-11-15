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
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Preflight } from "@/components/expedition/preflight";
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

// Each mission's headline readouts. The last one gives way to the verdict's own readout.
const WALK_HEADLINE = ["slope", "time", "distance"];
const DRIVE_WALK_HEADLINE = ["sols", "battery", "suit-left"];

/** Step ③: the verdict and its reasons, three headline numbers, then the rest one click down. */
export function CheckStep({ map }: { map: MapLibreMap | null }) {
  const { inputs, walk, journey, destination } = useRoutePlan();
  const { conditions } = useConditions();
  if (inputs.mission === "walking") {
    const summary = walk.plan?.summary ?? null;
    const check = summary && walkWithStorms(summary, conditions);
    const notChecked = check ? notCheckedText(check.not_checked, conditions) : "";
    return (
      <CheckLayout
        status={
          <WalkStatus
            plan={walk.plan}
            check={check}
            notChecked={notChecked}
            loadFailed={walk.loadFailed}
          />
        }
        verdict={check}
        readouts={summary && check ? walkReadouts(summary, check) : []}
        headline={WALK_HEADLINE}
        assumptions={<WalkAssumptions plan={walk.plan} />}
      />
    );
  }
  const trip = journey.plan && tripWithStorms(journey.plan, conditions);
  const notChecked = trip ? notCheckedText(trip.not_checked, conditions) : "";
  return (
    <CheckLayout
      status={
        <DriveWalkStatus
          journey={journey}
          destination={destination}
          check={trip}
          notChecked={notChecked}
        />
      }
      verdict={trip}
      readouts={driveWalkReadouts(journey.plan)}
      headline={DRIVE_WALK_HEADLINE}
      fit={<FitButtons journey={journey} onFit={(points) => fitPoints(map, points)} />}
      source={journey.plan?.collection?.route?.source}
      assumptions={<DriveWalkAssumptions grid={journey.driveGrid} plan={journey.plan} />}
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
            <RouteLegend mode={mission} shortest={showShortest} />
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
