import { evaluateRoute } from "@/lib/flight-rules/evaluate";
import type { RouteStatus } from "@/lib/mars/routing";
import type { Verdict } from "@/lib/mars/types";

import type { Plan } from "./route-layers";

const VERDICT_STYLES: Record<Verdict, { label: string; className: string }> = {
  GO: { label: "GO", className: "text-success" },
  CAUTION: { label: "CAUTION", className: "text-warning" },
  NO_GO: { label: "NO-GO", className: "text-destructive" },
};

const STATUS_MESSAGES: Record<Exclude<RouteStatus, "ok">, string> = {
  outside_grid: "Point is outside the elevation grid",
  start_blocked: "Start is inside a wall or no-go zone",
  goal_blocked: "End is inside a wall or no-go zone",
  no_path: "No route avoids every wall",
};

export function RouteResult({ plan, loadFailed }: { plan: Plan | null; loadFailed: boolean }) {
  if (loadFailed) return <p role="status">Elevation unavailable</p>;
  if (!plan) return <p role="status">Loading elevation…</p>;
  const { outbound, back, summary } = plan;
  if (!summary) {
    // Safe: summary is null only when a leg failed, so this status is never "ok".
    const failed = outbound.status !== "ok" ? outbound.status : back.status;
    return <p role="status">{STATUS_MESSAGES[failed as Exclude<RouteStatus, "ok">]}</p>;
  }
  const check = evaluateRoute(summary);
  const verdictStyle = VERDICT_STYLES[check.verdict];
  return (
    <div role="status" className="space-y-1">
      <p>Distance one way: {summary.distance_km.toFixed(2)} km</p>
      <p>Out-and-back time: {Math.round(summary.est_time_min)} min</p>
      <p className="text-xs text-muted-foreground">
        Tobler hiking model (Earth, off-path), not a suited Mars walk
      </p>
      <p>Steepest slope: {summary.max_slope.toFixed(1)}°</p>
      <p>Cells searched: {outbound.expanded + back.expanded}</p>
      <p>Farthest from start: {summary.farthest_from_base_km.toFixed(2)} km</p>
      <p className={verdictStyle.className}>Route check: {verdictStyle.label}</p>
      {check.reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
      <p className="text-xs text-muted-foreground">
        Route rules only: slope, walk-back and suit time, with the start point treated as base.
        Radiation, dust and daylight are not checked here.
      </p>
    </div>
  );
}
