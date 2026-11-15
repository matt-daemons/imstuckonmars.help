"use client";

import { TriangleAlertIcon } from "lucide-react";

import { useLaraContext } from "@/components/copilot/lara-context";
import { fmtMin } from "@/components/copilot/lara-panel";
import type { DriveWalk } from "@/components/map/route-hooks";
import { VERDICT_STYLES } from "@/components/map/route-result";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/components/ui/sidebar";
import { evaluateRoute } from "@/lib/flight-rules/evaluate";
import type { Verdict } from "@/lib/mars/types";

import { useRoutePlan, type RoutePlan } from "./route-plan-provider";
import { noRouteText, stripFields, walkMargin, type StripField } from "./strip-fields";
import { samePoint } from "./use-route-plan-result";

interface StripVerdict {
  status: (typeof VERDICT_STYLES)[Verdict];
  fields: StripField[];
}

/**
 * The always-visible line over the map: the route verdict at a glance, then LARA's mission clock
 * and latest alert. Clicking it opens step ③.
 */
export function VerdictStrip() {
  const { inputs, dispatch, walk, journey, destination, base } = useRoutePlan();
  const lara = useLaraContext();
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar();

  const verdict =
    inputs.mission === "walking"
      ? walkVerdict(walk.plan, samePoint(inputs.start, base))
      : tripVerdict(journey);
  const noRoute = noRouteText(inputs.mission, walk, journey, destination !== null);
  const clock = lara.snapshot && fmtMin(lara.snapshot.clock.position_s);
  const alert = lara.turns.findLast((turn) => turn.alert)?.content;
  const laraState = lara.error && !lara.ready ? "LARA unavailable" : "LARA starting…";

  const fieldsText = verdict?.fields.map(({ label, value }) => `${label} ${value}`).join(" · ");
  const verdictText = verdict ? `${verdict.status.label} · ${fieldsText}` : noRoute;
  const laraText = clock ? `Mission ${clock} · ${alert ?? "No alerts"}` : laraState;

  // Step ③ announces the verdict with its reasons, so this region stays quiet while step ③ shows.
  const checkShown = inputs.step === "check" && (isMobile ? openMobile : open);

  function openCheck() {
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
    dispatch({ type: "goTo", step: "check" });
  }

  return (
    <div className="absolute top-4 left-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 items-center gap-3 border bg-background/90 px-3 py-1.5 text-sm whitespace-nowrap backdrop-blur">
      <p
        role="status"
        aria-live={checkShown ? "off" : "polite"}
        className="flex min-w-0 items-center gap-2"
      >
        {verdict ? (
          <>
            <Badge variant={verdict.status.variant}>
              <verdict.status.Icon aria-hidden />
              {verdict.status.label}
            </Badge>{" "}
            <span className="truncate">
              {verdict.fields.map(({ label, value }, index) => (
                <span key={label}>
                  {index > 0 && " · "}
                  {label} <span className="font-mono">{value}</span>
                </span>
              ))}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{noRoute}</span>
        )}
      </p>
      <p className="flex min-w-0 items-center gap-1.5 border-l pl-3">
        {clock ? (
          <>
            <span className="shrink-0">
              Mission <span className="font-mono">{clock}</span> ·
            </span>{" "}
            {alert ? (
              <span className="flex min-w-0 items-center gap-1 text-warning-foreground">
                <TriangleAlertIcon
                  role="img"
                  aria-label="Latest alert"
                  className="size-3.5 shrink-0"
                />
                <span className="max-w-64 truncate">{alert}</span>
              </span>
            ) : (
              <span className="truncate text-muted-foreground">No alerts</span>
            )}
          </>
        ) : (
          <span className="truncate text-muted-foreground">{laraState}</span>
        )}
      </p>
      {/* Covers the whole strip, so a click anywhere opens step ③; the title holds the full text. */}
      <button
        type="button"
        title={`${verdictText} · ${laraText}`}
        onClick={openCheck}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">Open the route check</span>
      </button>
    </div>
  );
}

/** The walk's verdict, or null while there is no walk. */
function walkVerdict(plan: RoutePlan["walk"]["plan"], fromHabitat: boolean): StripVerdict | null {
  if (!plan?.summary) return null;
  const check = evaluateRoute(plan.summary);
  const margin = walkMargin(plan.summary, check.limiting_factor);
  // The walk back from the end to the start, timed by Tobler like the out-and-back readout. It is
  // the time to shelter only when the walk starts at the habitat.
  const label = fromHabitat ? "Shelter" : "Back to start";
  return {
    status: VERDICT_STYLES[check.verdict],
    fields: stripFields(margin, plan.back.time_min, label),
  };
}

/** The trip's verdict, or null; the plan is null while a new trip is planned, so none goes stale. */
function tripVerdict({ plan }: DriveWalk): StripVerdict | null {
  const route = plan?.collection?.route;
  if (!route) return null;
  return {
    status: VERDICT_STYLES[route.verdict],
    fields: stripFields(route.margin, route.time_to_shelter_min),
  };
}
