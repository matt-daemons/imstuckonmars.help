import {
  ArrowUpIcon,
  CircleCheckIcon,
  CircleXIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { evaluateRoute, type EvaVerdict } from "@/lib/flight-rules/evaluate";
import type { Factor } from "@/lib/flight-rules/rules";
import { MAX_SLOPE_DEG, type RouteStatus, type RouteSummary } from "@/lib/mars/routing";
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
type LimitMark = { tone: string; label: string };
const LIMIT_MARKS: Partial<Record<Verdict, LimitMark>> = {
  CAUTION: { tone: "text-warning-foreground", label: "Above caution limit" },
  NO_GO: { tone: "text-destructive-foreground", label: "Above limit" },
};

const STATUS_MESSAGES: Record<Exclude<RouteStatus, "ok">, string> = {
  outside_grid:
    "Start or end is outside the elevation grid around the habitat. Pick a point inside it.",
  start_blocked: `Start is on ground steeper than ${MAX_SLOPE_DEG}° or in a no-go zone. Set the start somewhere else.`,
  goal_blocked: `End is on ground steeper than ${MAX_SLOPE_DEG}° or in a no-go zone. Set the end somewhere else.`,
  no_path: `No route avoids ground steeper than ${MAX_SLOPE_DEG}° and the no-go zones. Move the end or clear the zones.`,
};

const LOAD_FAILED_MESSAGE =
  "Elevation grid did not load, so no route can be planned. Reload the page to retry.";

export function RouteResult({ plan, loadFailed }: { plan: Plan | null; loadFailed: boolean }) {
  const summary = plan?.summary ?? null;
  const check = summary && evaluateRoute(summary);
  return (
    <div className="flex flex-col gap-1">
      {/* One live region that stays mounted, so screen readers announce every change in it. */}
      <div role="status">
        <StatusLine plan={plan} loadFailed={loadFailed} check={check} />
      </div>
      {summary && check && <Readouts summary={summary} check={check} />}
    </div>
  );
}

/** The verdict, the reason no route was found, or the loading line. */
function StatusLine({
  plan,
  loadFailed,
  check,
}: {
  plan: Plan | null;
  loadFailed: boolean;
  check: EvaVerdict | null;
}) {
  if (loadFailed) return <ErrorAlert message={LOAD_FAILED_MESSAGE} />;
  if (!plan) return <p className="text-muted-foreground">Loading elevation…</p>;
  if (!check) {
    // Safe: there is no check only when a leg failed, so this status is never "ok".
    const failed = plan.outbound.status !== "ok" ? plan.outbound.status : plan.back.status;
    // The key replays the shake each time the reason changes.
    return (
      <ErrorAlert
        key={failed}
        message={STATUS_MESSAGES[failed as Exclude<RouteStatus, "ok">]}
        className="animate-toast-error-odd motion-reduce:animate-none"
      />
    );
  }
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
        <p>Not checked: radiation, dust, daylight.</p>
      </AlertDescription>
    </Alert>
  );
}

function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <Alert variant="error" role="none" className={className}>
      <CircleXIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function Readouts({ summary, check }: { summary: RouteSummary; check: EvaVerdict }) {
  const markFor = (factor: Factor) =>
    check.limiting_factor === factor ? LIMIT_MARKS[check.verdict] : undefined;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <Readout label="Distance one way" value={`${summary.distance_km.toFixed(2)} km`} />
      <Readout
        label="Out-and-back time"
        value={`${Math.round(summary.est_time_min)} min`}
        note="Tobler off-path hiking (Earth), not a suited Mars walk"
        mark={markFor("suit_supply")}
      />
      <Readout
        label="Steepest slope"
        value={`${summary.max_slope.toFixed(1)}°`}
        mark={markFor("slope")}
      />
      <Readout
        label="Farthest from start"
        value={`${summary.farthest_from_base_km.toFixed(2)} km`}
        mark={markFor("walk_back")}
      />
    </dl>
  );
}

/** One readout, styled like the LARA panel's. A mark flags the value behind the verdict. */
function Readout({
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
        {mark && <ArrowUpIcon role="img" aria-label={mark.label} className="size-3.5" />}
        {value}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
