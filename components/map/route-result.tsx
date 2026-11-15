import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CircleXIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { evaluateRoute, type EvaVerdict } from "@/lib/flight-rules/evaluate";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import {
  MAX_SLOPE_DEG,
  type PlannedPath,
  type RouteStatus,
  type RouteSummary,
} from "@/lib/mars/routing";
import type { Verdict } from "@/lib/mars/types";
import { cn } from "@/lib/utils";

import type { Plan } from "./route-layers";

// The icons /design-system#alert-levels assigns to each level.
const VERDICT_STYLES: Record<
  Verdict,
  { variant: "success" | "warning" | "error"; Icon: LucideIcon; label: string }
> = {
  GO: { variant: "success", Icon: CircleCheckIcon, label: "GO" },
  CAUTION: { variant: "warning", Icon: TriangleAlertIcon, label: "CAUTION" },
  NO_GO: { variant: "error", Icon: CircleXIcon, label: "NO-GO" },
};

// How the readout behind a CAUTION or NO-GO verdict is marked.
type LimitMark = { tone: string; label: string; Icon: LucideIcon };
const LIMIT_LEVELS: Partial<Record<Verdict, { tone: string; limit: string }>> = {
  CAUTION: { tone: "text-warning-foreground", limit: "caution limit" },
  NO_GO: { tone: "text-destructive-foreground", limit: "limit" },
};

/** The mark for a readout whose rule is the verdict's limiting factor; side is where the value sits. */
export function limitMark<F extends string>(
  check: EvaVerdict<F>,
  factor: F,
  side: "above" | "below" = "above",
): LimitMark | undefined {
  const level = check.limiting_factor === factor ? LIMIT_LEVELS[check.verdict] : undefined;
  if (!level) return undefined;
  return side === "above"
    ? { tone: level.tone, label: `Above ${level.limit}`, Icon: ArrowUpIcon }
    : { tone: level.tone, label: `Below ${level.limit}`, Icon: ArrowDownIcon };
}

type Failure = Exclude<RouteStatus, "ok">;

/** Why a leg failed, for a planner that treats ground steeper than maxSlopeDeg as impassable. */
export function failureMessages(maxSlopeDeg: number, outsideGrid: string): Record<Failure, string> {
  return {
    outside_grid: outsideGrid,
    start_blocked: `Start is on ground steeper than ${maxSlopeDeg}° or in a no-go zone. Set the start somewhere else.`,
    goal_blocked: `End is on ground steeper than ${maxSlopeDeg}° or in a no-go zone. Set the end somewhere else.`,
    no_path: `No route avoids ground steeper than ${maxSlopeDeg}° and the no-go zones. Move the end or clear the zones.`,
  };
}

/** What the status slot says when the terrain fails to load, when a leg fails, and under a verdict. */
export interface StatusCopy {
  loadFailed: string;
  failures: Record<Failure, string>;
  notChecked: string;
}

const WALK_COPY: StatusCopy = {
  loadFailed: "Elevation grid did not load, so no route can be planned. Reload the page to retry.",
  failures: failureMessages(
    MAX_SLOPE_DEG,
    "Start or end is outside the elevation grid around the habitat. Pick a point inside it.",
  ),
  notChecked: "Not checked: radiation, dust, daylight.",
};

export function RouteResult({ plan, loadFailed }: { plan: Plan | null; loadFailed: boolean }) {
  const summary = plan?.summary ?? null;
  const check = summary && evaluateRoute(summary);
  return (
    <div className="flex flex-col gap-1">
      {/* One live region that stays mounted, so screen readers announce every change in it. */}
      <div role="status">
        <StatusLine
          plan={plan}
          check={check}
          loadFailed={loadFailed}
          pending="Loading elevation…"
          copy={WALK_COPY}
        />
      </div>
      {summary && check && <Readouts summary={summary} check={check} />}
    </div>
  );
}

/** The verdict, the reason no route was found, or the pending line while there is no plan. */
export function StatusLine({
  plan,
  check,
  loadFailed,
  pending,
  copy,
}: {
  plan: { outbound: PlannedPath; back: PlannedPath } | null;
  check: EvaVerdict<string> | null;
  loadFailed: boolean;
  pending: string;
  copy: StatusCopy;
}) {
  if (loadFailed) return <ErrorAlert message={copy.loadFailed} />;
  if (!plan) return <p className="text-muted-foreground">{pending}</p>;
  if (!check) {
    // Safe: there is no check only when a leg failed, so this status is never "ok".
    const failed = (
      plan.outbound.status !== "ok" ? plan.outbound.status : plan.back.status
    ) as Failure;
    // The key replays the shake each time the reason changes.
    return (
      <ErrorAlert
        key={failed}
        message={copy.failures[failed]}
        className="animate-toast-error-odd motion-reduce:animate-none"
      />
    );
  }
  return <VerdictAlert check={check} notChecked={copy.notChecked} />;
}

/** The verdict with its reasons, for inside a status slot. */
export function VerdictAlert({
  check,
  notChecked,
}: {
  check: EvaVerdict<string>;
  notChecked: string;
}) {
  const { variant, Icon, label } = VERDICT_STYLES[check.verdict];
  // role="none": the wrapper is the live region, so the Alert must not be one too.
  return (
    <Alert variant={variant} role="none">
      <Icon aria-hidden />
      <AlertTitle>Route check: {label}</AlertTitle>
      <AlertDescription className="gap-1">
        {check.reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        <p>{notChecked}</p>
      </AlertDescription>
    </Alert>
  );
}

export function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <Alert variant="error" role="none" className={className}>
      <CircleXIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** The line under "Assumptions and data" that says how much A* searched for both legs. */
export function searchLine(
  plan: { outbound: PlannedPath; back: PlannedPath; summary: object | null } | null,
): string {
  if (!plan?.summary) return "Search: A*.";
  const cells = plan.outbound.expanded + plan.back.expanded;
  return `Search: A*, ${cells.toLocaleString("en-US", { useGrouping: "min2" })} cells searched.`;
}

/** The walking lines under "Assumptions and data". */
export function WalkAssumptions({ plan }: { plan: Plan | null }) {
  return (
    <>
      <p>Checks slope, walk-back distance and suit time only. The start point counts as base.</p>
      <p>Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.</p>
      <p>
        Ground over {MAX_SLOPE_DEG}° is impassable ({FLIGHT_RULES.slope.applies_to} limit, assumed
        for Mars).
      </p>
      <p>{searchLine(plan)}</p>
    </>
  );
}

function Readouts({ summary, check }: { summary: RouteSummary; check: EvaVerdict }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <Readout label="Distance one way" value={`${summary.distance_km.toFixed(2)} km`} />
      <Readout
        label="Out-and-back time"
        value={`${Math.round(summary.est_time_min)} min`}
        note="Tobler off-path hiking (Earth), not a suited Mars walk"
        mark={limitMark(check, "suit_supply")}
      />
      <Readout
        label="Steepest slope"
        value={`${summary.max_slope.toFixed(1)}°`}
        mark={limitMark(check, "slope")}
      />
      <Readout
        label="Farthest from start"
        value={`${summary.farthest_from_base_km.toFixed(2)} km`}
        mark={limitMark(check, "walk_back")}
      />
    </dl>
  );
}

/** One readout, styled like the LARA panel's. A mark flags the value behind the verdict. */
export function Readout({
  label,
  value,
  note,
  mark,
}: {
  label: string;
  value: string;
  note?: string;
  mark?: LimitMark;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("flex items-center gap-1 font-mono text-sm tabular-nums", mark?.tone)}>
        {mark && <mark.Icon role="img" aria-label={mark.label} className="size-3.5" />}
        {value}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
