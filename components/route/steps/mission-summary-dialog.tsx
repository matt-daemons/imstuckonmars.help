"use client";

import { DownloadIcon, PrinterIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { siteLabel } from "@/components/map/drive-controls";
import { Readouts, type ReadoutItem } from "@/components/map/route-result";
import { isDrillSet } from "@/components/route/conditions";
import { useConditions } from "@/components/route/conditions-provider";
import {
  objectiveText,
  ROUTE_PLANNER_CITATIONS,
  routeFileName,
  timelineRows,
  titleRows,
  walkingCollection,
} from "@/components/route/mission-summary";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import type { StripField } from "@/components/route/strip-fields";
import { samePoint } from "@/components/route/use-route-plan-result";
import { tripVerdict, walkVerdict } from "@/components/route/verdict-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RouteCollection } from "@/lib/mars/types";
import { cn } from "@/lib/utils";

const NUMBER = "text-right font-mono tabular-nums";
const PHONE_HIDDEN = "hidden sm:table-cell";

/**
 * The mission on one page, to read, print or save: the verdict first, then the objective,
 * timeline, key numbers, assumptions and sources. Step ③ hands over what it already shows.
 */
export function MissionSummary({
  status,
  keyNumbers,
  assumptions,
}: {
  /** Step ③'s verdict with its reasons and the "Not checked" line. */
  status: ReactNode;
  /** Step ③'s headline readouts. */
  keyNumbers: ReadoutItem[];
  /** Step ③'s "Assumptions and data" lines. */
  assumptions: ReactNode;
}) {
  const { inputs, walk, journey, base } = useRoutePlan();
  const fromHabitat = samePoint(inputs.start, base);
  const walkCollection = useMemo(
    () => (walk.plan ? walkingCollection(walk.plan, fromHabitat) : null),
    [walk.plan, fromHabitat],
  );
  const collection = inputs.mission === "walking" ? walkCollection : journey.plan?.collection;
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={!collection} />}>
        Mission summary
      </DialogTrigger>
      {/* data-mission-summary: the print stylesheet in globals.css prints this popup alone. */}
      <DialogPopup className="max-w-5xl" bottomStickOnMobile={false} data-mission-summary="">
        {collection && (
          <SummaryBody
            collection={collection}
            fromHabitat={fromHabitat}
            status={status}
            keyNumbers={keyNumbers}
            assumptions={assumptions}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function SummaryBody({
  collection,
  fromHabitat,
  status,
  keyNumbers,
  assumptions,
}: {
  collection: RouteCollection;
  fromHabitat: boolean;
  status: ReactNode;
  keyNumbers: ReadoutItem[];
  assumptions: ReactNode;
}) {
  const { inputs, walk, journey, destination } = useRoutePlan();
  const { conditions, drill } = useConditions();
  // The popup mounts on opening, so this is when the summary was made.
  const [madeAt] = useState(() => new Date());
  // Named as step ② names it, so an unconfirmed site says so.
  const site =
    inputs.mission === "drive-walk" && destination
      ? { ...destination, title: siteLabel(destination) }
      : null;
  const verdict =
    inputs.mission === "walking"
      ? walkVerdict(walk.plan, fromHabitat, conditions)
      : tripVerdict(journey, conditions);
  const fileName = routeFileName(collection, madeAt);
  const header = titleRows({
    mission: inputs.mission,
    site,
    power: inputs.power,
    samplingMin: inputs.samplingMin,
    madeAt,
  });
  const timeline = timelineRows(collection, site ? { [site.id]: site.title } : {});

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mission summary</DialogTitle>
        <FieldList fields={header} />
      </DialogHeader>
      {/* Focusable, so the dialog opens on it, at the top, and the keyboard can scroll it. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Summary"
        className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset print:overflow-visible"
      >
        <Section title="Verdict">
          {isDrillSet(drill) && (
            <p className="flex items-center gap-2 text-sm">
              <Badge variant="info" className="font-mono">
                DRILL
              </Badge>
              A storm drill is set. Values marked &quot;Drill, not real data&quot; were set by hand.
            </p>
          )}
          {/* The alert below carries the status, so only the strip's other fields come first. */}
          {verdict && <FieldList fields={verdict.fields} />}
          {status}
        </Section>
        <Section title="Objective">
          <p className="text-sm">
            {objectiveText(inputs.mission, site, inputs.samplingMin, fromHabitat)}
          </p>
        </Section>
        <Section title="Timeline">
          <p className="text-xs text-muted-foreground">
            Start times are sols/hh:mm after departure; times are in Earth hours and minutes.
          </p>
          {/* On phones the table never scrolls sideways: tighter cells, the places under the
              mode, and no leg number, steepest slope or shelter time (the rows keep travel order
              and the verdict gives the shelter time). Wider screens and print show every column. */}
          <Table className="text-xs max-sm:[&_td]:px-1 max-sm:[&_th]:px-1">
            <TableHeader>
              <TableRow>
                <TableHead className={PHONE_HIDDEN}>Leg</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className={PHONE_HIDDEN}>From → to</TableHead>
                <TableHead className="text-right">Start</TableHead>
                <TableHead className="text-right whitespace-normal">Duration (hh:mm)</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead className={cn("text-right", PHONE_HIDDEN)}>Steepest slope</TableHead>
                <TableHead className={cn("text-right", PHONE_HIDDEN)}>To shelter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeline.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className={cn("font-mono", PHONE_HIDDEN)}>{row.leg}</TableCell>
                  <TableCell>
                    {row.mode}
                    <span className="block whitespace-normal text-muted-foreground sm:hidden">
                      {row.places}
                    </span>
                  </TableCell>
                  <TableCell className={cn("whitespace-normal", PHONE_HIDDEN)}>
                    {row.places}
                  </TableCell>
                  {[row.start, row.duration, row.distance].map((value, index) => (
                    <TableCell key={index} className={NUMBER}>
                      {value}
                    </TableCell>
                  ))}
                  {[row.slope, row.shelter].map((value, index) => (
                    <TableCell key={index} className={cn(NUMBER, PHONE_HIDDEN)}>
                      {value}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Key numbers">
          <Readouts items={keyNumbers} lead />
        </Section>
        <Section title="Assumptions">
          <div className="flex flex-col gap-1 text-xs">{assumptions}</div>
        </Section>
        <Section title="Sources">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs">
            {ROUTE_PLANNER_CITATIONS.map((citation) => (
              <li key={citation}>{citation}</li>
            ))}
          </ul>
          {/* A new tab, so the plan stays open here. */}
          <a
            href="/sources"
            target="_blank"
            rel="noopener"
            className="font-mono text-xs text-primary underline underline-offset-2"
          >
            All sources and caveats →
          </a>
        </Section>
      </div>
      <DialogFooter className="items-center print:hidden">
        <p className="mr-auto text-xs text-muted-foreground">
          Saves <span className="font-mono">{fileName}</span>. Its verdict is the route check
          without storm conditions.
        </p>
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon aria-hidden />
          Print
        </Button>
        <Button variant="outline" onClick={() => download(collection, fileName)}>
          <DownloadIcon aria-hidden />
          Download route (GeoJSON)
        </Button>
        <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
      </DialogFooter>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function FieldList({ fields }: { fields: StripField[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {fields.map(({ label, value }) => (
        <div key={label} className="flex gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Saves the route as a GeoJSON file, in the team's agreed route format. */
function download(collection: RouteCollection, fileName: string) {
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
