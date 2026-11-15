"use client";

import { CircleXIcon, InfoIcon, SirenIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useExpedition } from "@/components/expedition/expedition-provider";
import { PHASE_LABEL, missionTime } from "@/components/expedition/present";
import type { DriveWalk } from "@/components/map/route-hooks";
import { VERDICT_STYLES } from "@/components/map/route-result";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/components/ui/sidebar";
import type { Verdict } from "@/lib/mars/types";
import { cn } from "@/lib/utils";

import { isDrillSet, tripWithStorms, walkWithStorms, type Conditions } from "./conditions";
import { useConditions } from "./conditions-provider";
import { useRoutePlan, type RoutePlan } from "./route-plan-provider";
import { noRouteText, stormLimit, stripFields, walkMargin, type StripField } from "./strip-fields";
import { samePoint } from "./use-route-plan-result";

interface StripVerdict {
  status: (typeof VERDICT_STYLES)[Verdict];
  fields: StripField[];
}

const ALERT_ICON = {
  emergency: SirenIcon,
  error: CircleXIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
};
const ALERT_TONE = {
  emergency: "text-destructive-foreground",
  error: "text-destructive-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
};

/** The current time, updated every intervalMs. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The always-visible line over the map: the route verdict at a glance, then the expedition's
 * mission clock and its highest active alert. Clicking it opens step ③, or ④ while one runs.
 */
export function VerdictStrip() {
  const { inputs, dispatch, walk, journey, destination, base } = useRoutePlan();
  const expedition = useExpedition();
  const { conditions, drill } = useConditions();
  const now = useNow(500);
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar();

  const verdict =
    inputs.mission === "walking"
      ? walkVerdict(walk.plan, samePoint(inputs.start, base), conditions)
      : tripVerdict(journey, conditions);
  const drilling = isDrillSet(drill);
  const noRoute = noRouteText(inputs.mission, walk, journey, destination !== null);
  const route = expedition.snapshot?.config.route;
  // A stale clock would look current, so it gives way to the link state when the link drops.
  const linkDown = expedition.link === "stale" || expedition.link === "offline";
  const at = expedition.clockAt(now);
  const clock = route && !linkDown ? missionTime(at) : null;
  const phase = expedition.snapshot?.state.position?.phase;
  const alert = expedition.alerts.find((a) => a.active && !a.inhibited);
  const missionState = linkDown
    ? `Mission link ${expedition.link}`
    : expedition.snapshot
      ? "No expedition running"
      : "Opening mission…";

  const fieldsText = verdict?.fields.map(({ label, value }) => `${label} ${value}`).join(" · ");
  const verdictText = `${drilling ? "DRILL · " : ""}${verdict ? `${verdict.status.label} · ${fieldsText}` : noRoute}`;
  const laraText = clock ? `Mission ${clock} · ${alert?.name ?? "No alerts"}` : missionState;

  // Step ③ announces the verdict with its reasons, so this region stays quiet while step ③ shows.
  const checkShown = inputs.step === "check" && (isMobile ? openMobile : open);

  function openCheck() {
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
    dispatch({ type: "goTo", step: route ? "run" : "check" });
  }

  return (
    // While a drill runs, a dashed frame and the DRILL tag keep it from passing for real data.
    <div
      className={cn(
        "absolute top-4 left-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 items-center gap-3 overflow-hidden border bg-background/90 px-3 py-1.5 text-sm whitespace-nowrap backdrop-blur",
        drilling && "border-2 border-dashed border-info",
      )}
    >
      {drilling && (
        <Badge variant="info" className="shrink-0 font-mono">
          DRILL
        </Badge>
      )}
      <p
        role="status"
        aria-live={checkShown ? "off" : "polite"}
        // A narrow screen fits one half: while an expedition runs, the mission wins.
        className={cn("flex min-w-0 items-center gap-2", clock && "max-sm:hidden")}
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
      <p
        className={cn(
          "flex min-w-0 items-center gap-1.5 border-l pl-3",
          clock && "max-sm:border-l-0 max-sm:pl-0",
        )}
      >
        {clock ? (
          <>
            <span className="shrink-0">
              Mission <span className="font-mono">{clock}</span>
              {phase && (
                <span className="max-sm:hidden">
                  {" "}
                  · {expedition.snapshot?.clock.mode === "ended" ? "Ended" : PHASE_LABEL[phase]}
                </span>
              )}{" "}
              ·
            </span>{" "}
            {alert ? (
              <AlertSummary level={alert.level} name={alert.name} />
            ) : (
              <span className="truncate text-muted-foreground">No alerts</span>
            )}
          </>
        ) : (
          <span className="truncate text-muted-foreground">{missionState}</span>
        )}
      </p>
      {/* Covers the whole strip, so a click anywhere opens step ③; the title holds the full text. */}
      <button
        type="button"
        title={`${verdictText} · ${laraText}`}
        onClick={openCheck}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">
          {route ? "Open the running expedition" : "Open the route check"}
        </span>
      </button>
    </div>
  );
}

function AlertSummary({ level, name }: { level: keyof typeof ALERT_ICON; name: string }) {
  const Icon = ALERT_ICON[level];
  return (
    <span className={cn("flex min-w-0 items-center gap-1", ALERT_TONE[level])}>
      <Icon role="img" aria-label={`Highest alert, ${level}`} className="size-3.5 shrink-0" />
      <span className="max-w-64 truncate">{name}</span>
    </span>
  );
}

/** The walk's verdict, or null while there is no walk. */
export function walkVerdict(
  plan: RoutePlan["walk"]["plan"],
  fromHabitat: boolean,
  conditions: Conditions,
): StripVerdict | null {
  if (!plan?.summary) return null;
  const check = walkWithStorms(plan.summary, conditions);
  const margin =
    stormLimit(check.limiting_factor, conditions, plan.summary) ??
    walkMargin(plan.summary, check.limiting_factor);
  // The walk back from the end to the start, timed by Tobler like the out-and-back readout. It is
  // the time to shelter only when the walk starts at the habitat.
  const label = fromHabitat ? "Shelter" : "Back to start";
  return {
    status: VERDICT_STYLES[check.verdict],
    fields: stripFields(margin, plan.back.time_min, label),
  };
}

/** The trip's verdict, or null; the plan is null while a new trip is planned, so none goes stale. */
export function tripVerdict({ plan }: DriveWalk, conditions: Conditions): StripVerdict | null {
  const route = plan?.collection?.route;
  const walkRoute = plan?.walk?.route;
  const check = plan && tripWithStorms(plan, conditions);
  if (!route || !walkRoute || !check) return null;
  // A drive or walk-route limit keeps the planner's margin. Time to shelter is the walk back to the
  // rover either way, since storms count for the walk only.
  const margin = stormLimit(check.limiting_factor, conditions, walkRoute) ?? route.margin;
  return {
    status: VERDICT_STYLES[check.verdict],
    fields: stripFields(margin, route.time_to_shelter_min),
  };
}
