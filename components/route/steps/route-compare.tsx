"use client";

import { useId } from "react";

import { VERDICT_STYLES } from "@/components/map/route-result";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RouteChoice } from "@/lib/mars/drive-walk";
import type { Verdict } from "@/lib/mars/types";
import { cn } from "@/lib/utils";

import { chooseRoute } from "../route-choice";
import { useRoutePlan } from "../route-plan-provider";
import { RouteProfile } from "./route-profile";

const PLANNING = "Planning…";
// Compact cells that wrap long labels, so the table fits the sidebar without scrolling sideways.
const LABEL = "py-1.5 ps-0 pe-1.5 text-xs whitespace-normal text-muted-foreground";
const COLUMN = "px-1.5 py-1.5 text-right text-xs";
const VALUE = cn(COLUMN, "font-mono tabular-nums");

/**
 * Step 03's comparison of the planned (safest) route with the shortest one the same walls allow:
 * the numbers side by side, their route-rule verdicts, and the ground along the way out. The
 * operator, or LARA, chooses which one the expedition follows.
 */
export function RouteCompare() {
  const { inputs, dispatch, comparison, walk, journey } = useRoutePlan();
  const { mission, showShortest, route } = inputs;
  const titleId = useId();
  const switchLabelId = useId();
  const choiceLabelId = useId();
  if (!comparison) return null;
  const { rows, verdicts, profiles } = comparison;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="font-heading text-sm font-medium">
          Safest and shortest route
        </h3>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            aria-labelledby={switchLabelId}
            checked={showShortest}
            onCheckedChange={(shown) => dispatch({ type: "showShortest", shown })}
          />
          <span id={switchLabelId}>Compare routes on map</span>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span id={choiceLabelId} className="text-xs">
          Expedition follows
        </span>
        <ToggleGroup
          aria-labelledby={choiceLabelId}
          variant="outline"
          size="sm"
          value={route ? [route] : []}
          // Safe cast: the only values are the two items below; [] (pressing the chosen one) keeps it.
          onValueChange={(value) => value[0] && chooseRoute(dispatch, value[0] as RouteChoice)}
        >
          <ToggleGroupItem value="safest">Safest</ToggleGroupItem>
          <ToggleGroupItem
            value="shortest"
            disabled={mission === "walking" ? !walk.shortest : !journey.shortest}
          >
            Shortest
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={LABEL}>
              <span className="sr-only">Readout</span>
            </TableHead>
            <TableHead className={COLUMN}>Safest</TableHead>
            <TableHead className={COLUMN}>Shortest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className={LABEL}>{row.label}</TableCell>
              <TableCell className={VALUE}>{row.safest}</TableCell>
              <ShortestCell value={row.shortest} />
            </TableRow>
          ))}
          <TableRow>
            <TableCell className={LABEL}>Route rules</TableCell>
            <TableCell className={COLUMN}>
              <VerdictBadge verdict={verdicts.safest} />
            </TableCell>
            <TableCell className={COLUMN}>
              {verdicts.shortest ? (
                <VerdictBadge verdict={verdicts.shortest} />
              ) : (
                <span className="text-xs text-muted-foreground">{PLANNING}</span>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {mission === "walking"
          ? "Safest is the planned route: it keeps to gentle ground. Shortest is the shortest route within the same slope limit and no-go zones."
          : "Safest is the planned trip: the drive on the least energy, the walk on gentle ground. Shortest is the shortest trip within the same slope limits, boulders and no-go zones, from the same parking spot."}{" "}
        The verdicts check route rules only: storms apply to both routes alike.
      </p>
      {profiles.map((chart) => (
        <RouteProfile
          key={chart.id}
          chart={chart}
          // The same colours as the map: walk legs of a drive + walk are violet, the rest cyan.
          routeColor={
            mission === "drive-walk" && chart.id === "walk" ? "var(--route-walk)" : "var(--primary)"
          }
          showShortest={showShortest}
        />
      ))}
    </section>
  );
}

function ShortestCell({ value }: { value: string | null }) {
  return value === null ? (
    <TableCell className={cn(COLUMN, "text-muted-foreground")}>{PLANNING}</TableCell>
  ) : (
    <TableCell className={VALUE}>{value}</TableCell>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { variant, Icon, label } = VERDICT_STYLES[verdict];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
