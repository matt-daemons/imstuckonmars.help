import {
  ArrowUpIcon,
  CircleCheckIcon,
  CircleXIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { evaluateRoute } from "@/lib/flight-rules/evaluate";
import type { Factor } from "@/lib/flight-rules/rules";
import { MAX_SLOPE_DEG, type RouteStatus } from "@/lib/mars/routing";
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

// Ink for the readout behind a CAUTION or NO-GO verdict.
const LIMIT_TONES: Partial<Record<Verdict, string>> = {
  CAUTION: "text-warning-foreground",
  NO_GO: "text-destructive-foreground",
};

const STATUS_MESSAGES: Record<Exclude<RouteStatus, "ok">, string> = {
  outside_grid: "Start or end is outside the elevation grid. Pick a point inside it.",
  start_blocked: `Start is on ground steeper than ${MAX_SLOPE_DEG}° or in a no-go zone. Set the start somewhere else.`,
  goal_blocked: `End is on ground steeper than ${MAX_SLOPE_DEG}° or in a no-go zone. Set the end somewhere else.`,
  no_path: `No route avoids ground steeper than ${MAX_SLOPE_DEG}° and the no-go zones. Move the end or clear a zone.`,
};

const LOAD_FAILED_MESSAGE =
  "Elevation grid did not load, so no route can be planned. Reload the page to retry.";

export function RouteResult({ plan, loadFailed }: { plan: Plan | null; loadFailed: boolean }) {
  if (loadFailed) return <ErrorAlert message={LOAD_FAILED_MESSAGE} />;
  if (!plan) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading elevation…
      </p>
    );
  }
  const { outbound, back, summary } = plan;
  if (!summary) {
    // Safe: summary is null only when a leg failed, so this status is never "ok".
    const failed = outbound.status !== "ok" ? outbound.status : back.status;
    // The key replays the shake each time the reason changes.
    return (
      <ErrorAlert
        key={failed}
        message={STATUS_MESSAGES[failed as Exclude<RouteStatus, "ok">]}
        className="animate-toast-error-odd motion-reduce:animate-none"
      />
    );
  }
  const check = evaluateRoute(summary);
  const { variant, Icon, label } = VERDICT_STYLES[check.verdict];
  const toneFor = (factor: Factor) =>
    check.limiting_factor === factor ? LIMIT_TONES[check.verdict] : undefined;
  return (
    <div className="flex flex-col gap-1">
      <Alert variant={variant} role="status">
        <Icon aria-hidden />
        <AlertTitle>Route check: {label}</AlertTitle>
        <AlertDescription className="gap-1">
          {check.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <p>Not checked: radiation, dust, daylight.</p>
        </AlertDescription>
      </Alert>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Readout label="Distance one way" value={`${summary.distance_km.toFixed(2)} km`} />
        <Readout
          label="Out-and-back time"
          value={`${Math.round(summary.est_time_min)} min`}
          note="Tobler off-path hiking (Earth), not a suited Mars walk"
          tone={toneFor("suit_supply")}
        />
        <Readout
          label="Steepest slope"
          value={`${summary.max_slope.toFixed(1)}°`}
          tone={toneFor("slope")}
        />
        <Readout
          label="Farthest from start"
          value={`${summary.farthest_from_base_km.toFixed(2)} km`}
          tone={toneFor("walk_back")}
        />
      </dl>
    </div>
  );
}

function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <Alert variant="error" role="status" className={className}>
      <CircleXIcon aria-hidden />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}

/** One readout, styled like the LARA panel's. A tone marks the value behind the verdict. */
function Readout({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("flex items-center gap-1 font-mono text-sm tabular-nums", tone)}>
        {tone && <ArrowUpIcon aria-label="Above limit" className="size-3.5" />}
        {value}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
