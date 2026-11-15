"use client";

import {
  ActivityIcon,
  BatteryWarningIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  CircleXIcon,
  CloudFogIcon,
  DropletsIcon,
  FactoryIcon,
  FileTextIcon,
  InfoIcon,
  SirenIcon,
  SparklesIcon,
  SnowflakeIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ALERT_LABEL, annunciating, type MissionAlert } from "@/lib/mission/alerts";
import type { EventRequest, Snapshot } from "@/lib/mission/client";
import type { Outcome } from "@/lib/mission/outlook";
import { reasonText } from "@/lib/mission/reasons";

import { useExpedition } from "./expedition-provider";
import "./expedition.css";
import {
  ACTIVITY_LABEL,
  RESOURCE_LABEL,
  STATUS_STYLE,
  grams,
  metres,
  missionTime,
  signed,
  span,
  wattHours,
} from "./present";

function useTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>
      {children}
    </section>
  );
}

/** P-1: every leg of the expedition, done, current (with progress) or to come. */
function Timeline({ snapshot, at }: { snapshot: Snapshot; at: number }) {
  return (
    <ol className="flex flex-col" aria-label="Expedition timeline">
      {snapshot.config.schedule.map((entry, index) => {
        const done = at >= entry.end_s - 1e-6;
        const current = !done && at >= entry.start_s;
        const progress = current
          ? (at - entry.start_s) / (entry.end_s - entry.start_s)
          : done
            ? 1
            : 0;
        const label =
          entry.activity === "base"
            ? index === 0
              ? "Suit up and egress"
              : "Recovery at shelter"
            : ACTIVITY_LABEL[entry.activity];
        return (
          <li
            key={`${entry.start_s}-${entry.activity}`}
            className="run-leg"
            data-state={done ? "done" : current ? "current" : "next"}
            aria-current={current ? "step" : undefined}
          >
            <span className="run-leg-icon" aria-hidden>
              {done ? (
                <CheckIcon className="size-4" />
              ) : current ? (
                <ChevronRightIcon className="size-4" />
              ) : (
                <CircleIcon className="size-3" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2">
                <span>
                  {label}
                  <span className="sr-only">
                    {done ? ", complete" : current ? ", in progress" : ", to come"}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {span(entry.end_s - entry.start_s)}
                </span>
              </span>
              <span className="run-leg-bar" aria-hidden>
                <span style={{ width: `${progress * 100}%` }} />
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {missionTime(entry.start_s)} → {missionTime(entry.end_s)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OutcomeFacts({ outcome, shelter }: { outcome: Outcome; shelter: string }) {
  if (!outcome.available)
    return <p className="text-xs text-muted-foreground">{outcome.unavailable_reason}</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Back at {shelter}</dt>
        <dd className="font-mono">
          {outcome.arrival_s !== null ? missionTime(outcome.arrival_s) : "Unknown"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Sampling left</dt>
        <dd className="font-mono">{span(outcome.sampling_s)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">O₂ vs reserve</dt>
        <dd className="font-mono">
          {outcome.margins ? signed(outcome.margins.oxygen_g, "g") : "Unknown"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Battery vs reserve</dt>
        <dd className="font-mono">
          {outcome.margins ? signed(outcome.margins.energy_wh, "Wh") : "Unknown"}
        </dd>
      </div>
    </dl>
  );
}

/** Replan options with predicted outcomes (priority 4); AU-3: rationale with the recommendation. */
function Replan() {
  const { outlook, outlookCurrent, snapshot, replan, command, lastCommand } = useExpedition();
  const [chosenOption, setChosenOption] = useState<Outcome["option"] | null>(null);
  if (!outlook || !snapshot?.config.route) return null;
  const chosen = outlook.options.find((option) => option.option === chosenOption) ?? null;
  const shelter = snapshot.config.route.shelter === "rover" ? "rover" : "habitat";
  const current = outlook.options.find((o) => o.option === "continue")!;
  const busy = lastCommand?.state === "running";
  if (outlook.returned) return <p className="text-sm text-muted-foreground">{outlook.rationale}</p>;
  return (
    <div className="flex flex-col gap-2" aria-busy={!outlookCurrent}>
      <p className="text-xs text-muted-foreground">
        Predicted from {missionTime(outlook.at_s)} by the mission engine: leaks, exertion and faults
        in force are included; future faults are not known.
      </p>
      {outlook.options.map((option) => {
        const style = option.available ? STATUS_STYLE[option.status] : null;
        const recommended = outlook.recommended === option.option;
        return (
          <article
            key={option.option}
            className="run-option"
            data-recommended={recommended || undefined}
            data-unavailable={!option.available || undefined}
            aria-label={option.title}
          >
            <header className="flex items-start justify-between gap-2">
              <span className="font-heading font-semibold">{option.title}</span>
              {style && (
                <Badge variant={style.variant}>
                  <style.Icon aria-hidden />
                  {style.label}
                </Badge>
              )}
            </header>
            <p className="text-xs text-muted-foreground">{option.summary}</p>
            <OutcomeFacts outcome={option} shelter={shelter} />
            {option.available && option.limiting && option.margins && (
              <p className="text-xs text-muted-foreground">
                Tightest: {RESOURCE_LABEL[option.limiting]}.
              </p>
            )}
            {recommended && (
              <p className="run-rationale">
                <SparklesIcon aria-hidden className="size-4 shrink-0" />
                <span>
                  <span className="font-semibold">Recommended.</span> {outlook.rationale}
                </span>
              </p>
            )}
            {option.option !== "continue" && option.available && (
              <Button
                size="sm"
                variant={recommended ? "default" : "outline"}
                disabled={busy || !outlookCurrent}
                onClick={async () => {
                  // A 60× replay can move minutes while the operator reviews the confirmation.
                  if (
                    snapshot.clock.mode === "playing" &&
                    !(await command({ type: "pause" }, "Pause for replan review"))
                  )
                    return;
                  setChosenOption(option.option);
                }}
              >
                Apply: {option.title}
              </Button>
            )}
          </article>
        );
      })}
      <AlertDialog open={chosen !== null} onOpenChange={(open) => !open && setChosenOption(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Replan: {chosen?.title}?</AlertDialogTitle>
            <AlertDialogDescription render={<div className="flex flex-col gap-3" />}>
              <p>
                {chosen?.summary} The past stays as it happened; only the rest of the walk changes.
              </p>
              <p>The clock is paused for review. Resume with Play after this decision.</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-heading font-semibold text-foreground">Current plan</p>
                  <OutcomeFacts outcome={current} shelter={shelter} />
                </div>
                {chosen && (
                  <div>
                    <p className="font-heading font-semibold text-foreground">After replan</p>
                    <OutcomeFacts outcome={chosen} shelter={shelter} />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Keep current plan
            </AlertDialogClose>
            <Button
              disabled={!outlookCurrent || !chosen?.available || busy}
              onClick={() => {
                if (chosen && chosen.option !== "continue")
                  void replan(chosen.option, chosen.title);
                setChosenOption(null);
              }}
            >
              Apply replan
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

interface Fault {
  key: string;
  title: string;
  description: string;
  Icon: typeof DropletsIcon;
  event: EventRequest;
  /** Recovery command shown while the fault is in force. */
  recovery?: { label: string; event: EventRequest };
  active: boolean;
}

function faults(snapshot: Snapshot): Fault[] {
  const { state, config } = snapshot;
  const capacity = state.battery.eva.capacity_wh;
  const list: Fault[] = [
    {
      key: "leak",
      title: "Suit oxygen leak",
      description: "A seal leaks 600 g/h of suit oxygen on top of crew demand until it is stopped.",
      Icon: DropletsIcon,
      event: { type: "oxygen_leak", target: "eva", value: 600 },
      recovery: { label: "Stop the leak", event: { type: "oxygen_leak", target: "eva", value: 0 } },
      active: state.oxygen_leak_g_h.eva > 0,
    },
    {
      key: "exertion",
      title: "Heavy exertion ×1.8",
      description:
        "Rough ground raises suit oxygen and power draw to 1.8 times the activity profile.",
      Icon: ActivityIcon,
      event: { type: "consumption_change", target: "eva", value: 1.8 },
      recovery: {
        label: "Back to normal pace",
        event: { type: "consumption_change", target: "eva", value: 1 },
      },
      active: state.demand_factor.eva > 1,
    },
    {
      key: "cells",
      title: "Suit battery cell loss",
      description: `Cells fail and usable suit capacity drops to ${Math.round(capacity * 0.45)} Wh (45%). This cannot be undone; Restart clears it.`,
      Icon: BatteryWarningIcon,
      event: { type: "battery_failure", target: "eva", value: Math.round(capacity * 0.45) },
      active: false,
    },
  ];
  if (config.route)
    list.push(
      {
        key: "dust",
        title: "Dust front",
        Icon: CloudFogIcon,
        description:
          "Start a simulated dust-front drill. Outside oxygen demand rises by 25%, with extra equipment energy demand. Walking speed is unchanged. No weather observations or visual effects are used.",
        event: { type: "weather_risk", risk: "dust", active: true },
        recovery: {
          label: "Clear dust",
          event: { type: "weather_risk", risk: "dust", active: false },
        },
        active: state.weather_risks?.dust ?? false,
      },
      {
        key: "cold",
        title: "Cold snap",
        Icon: SnowflakeIcon,
        description:
          "Start a simulated cold-snap drill. Suit heater demand increases by 70 W per two crew while outside. This is an equipment assumption, not measured weather or a prediction of injury.",
        event: { type: "weather_risk", risk: "cold", active: true },
        recovery: {
          label: "End cold snap",
          event: { type: "weather_risk", risk: "cold", active: false },
        },
        active: state.weather_risks?.cold ?? false,
      },
    );
  if (config.route?.shelter !== "rover")
    list.push({
      key: "generator",
      title: "Habitat generator failure",
      description: "MOXIE stops producing oxygen at the habitat until it is restored.",
      Icon: FactoryIcon,
      event: { type: "generator_failure" },
      recovery: { label: "Restore the generator", event: { type: "generator_restore" } },
      active: !state.generator_available,
    });
  return list;
}

/** Priority 3: inject a simulated fault, confirmed first (C-1, C-3). */
function Faults({ snapshot }: { snapshot: Snapshot }) {
  const { inject, lastCommand } = useExpedition();
  const [selected, setSelected] = useState<Fault | null>(null);
  const busy = lastCommand?.state === "running";
  const ended = snapshot.state.elapsed_s >= snapshot.config.duration_s - 1e-6;
  return (
    <div className="flex flex-col gap-2">
      {faults(snapshot).map((fault) => (
        <div key={fault.key} className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive-outline"
            className="flex-1 justify-start"
            disabled={busy || ended || (fault.active && fault.key !== "cells")}
            onClick={() => setSelected(fault)}
          >
            <fault.Icon aria-hidden />
            {fault.title}
          </Button>
          {fault.active && fault.recovery && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || ended}
              onClick={() => void inject(fault.recovery!.event, fault.recovery!.label)}
            >
              {fault.recovery.label}
            </Button>
          )}
        </div>
      ))}
      <AlertDialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogPopup data-hazard>
          <AlertDialogHeader>
            <AlertDialogTitle>Inject {selected?.title.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription render={<div className="flex flex-col gap-2" />}>
              <p>{selected?.description}</p>
              <p>
                Target: this simulated expedition, at the server&apos;s mission time when accepted
                (now about{" "}
                <span className="font-mono">{missionTime(snapshot.state.elapsed_s)}</span>).
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (selected) void inject(selected.event, selected.title);
                setSelected(null);
              }}
            >
              {selected?.event.type === "weather_risk"
                ? "Start weather drill"
                : "Inject simulated fault"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

const ALERT_ICON = {
  emergency: SirenIcon,
  error: CircleXIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
};
const ALERT_VARIANT = {
  emergency: "error",
  error: "error",
  warning: "warning",
  info: "info",
} as const;

/** AL-2…AL-6: the alert queue with acknowledge, suppress and inhibit. Local display state only. */
function AlertQueue() {
  const { alerts, updateAlert, acknowledgeAll } = useExpedition();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"priority" | "time">("priority");
  const [showCleared, setShowCleared] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts
      .filter(
        (a) =>
          (showCleared || a.active) && `${a.id} ${a.name} ${a.system}`.toLowerCase().includes(q),
      )
      .sort((a, b) => (sort === "time" ? b.first_s - a.first_s : 0));
  }, [alerts, query, sort, showCleared]);
  const inhibited = alerts.filter((a) => a.inhibited);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="alert-search" className="sr-only">
          Find alert by ID, name or system
        </label>
        <Input
          id="alert-search"
          size="sm"
          placeholder="Find by ID, name, system"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1"
        />
        <ToggleGroup
          aria-label="Sort alerts"
          variant="outline"
          size="sm"
          value={[sort]}
          onValueChange={(v) => v[0] && setSort(v[0] as "priority" | "time")}
        >
          <ToggleGroupItem value="priority">Priority</ToggleGroupItem>
          <ToggleGroupItem value="time">Time</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!alerts.some(annunciating)}
          onClick={acknowledgeAll}
        >
          Acknowledge all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={showCleared}
          onClick={() => setShowCleared(!showCleared)}
        >
          {showCleared ? "Hide cleared" : "Show cleared"}
        </Button>
      </div>
      <div role="log" aria-live="polite" className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {alerts.length
              ? "No alert matches."
              : "No alerts. An absence of alerts is not a safety assessment."}
          </p>
        ) : (
          rows.map((alert) => <AlertRow key={alert.code} alert={alert} update={updateAlert} />)
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {rows.length} of {alerts.length}. Inhibited:{" "}
        {inhibited.map((a) => a.id).join(", ") || "none"}. Acknowledging changes only this display,
        never the simulation.
      </p>
    </div>
  );
}

function AlertRow({
  alert,
  update,
}: {
  alert: MissionAlert;
  update: (
    code: string,
    change: Partial<Pick<MissionAlert, "acknowledged" | "suppressed" | "inhibited">>,
  ) => void;
}) {
  const Icon = ALERT_ICON[alert.level];
  const on = annunciating(alert);
  return (
    <Alert
      variant={ALERT_VARIANT[alert.level]}
      data-level={alert.level === "emergency" && alert.active ? "emergency" : undefined}
      data-acknowledged={!on || undefined}
      className={alert.active ? undefined : "opacity-80"}
    >
      <Icon aria-hidden />
      <AlertTitle>
        {ALERT_LABEL[alert.level]} · {alert.name}
      </AlertTitle>
      <AlertDescription className="gap-1">
        <span className="flex flex-wrap gap-x-3 font-mono text-xs">
          <span>{alert.id}</span>
          <span>{missionTime(alert.first_s)}</span>
          <span className="font-sans">{alert.system}</span>
        </span>
        <span>{alert.detail}</span>
        {alert.response && (
          <span>
            <span className="font-semibold">Response: </span>
            {alert.response}
          </span>
        )}
        <span className="text-xs">
          {alert.active ? "Active" : "Cleared"} ·{" "}
          {alert.acknowledged ? "Acknowledged" : "Unacknowledged"} ·{" "}
          {alert.inhibited
            ? "Inhibited"
            : alert.suppressed
              ? "Suppressed"
              : on
                ? "Annunciating"
                : "Static"}
        </span>
        <span className="flex flex-wrap gap-1 pt-1">
          <Button
            size="xs"
            variant="outline"
            disabled={alert.acknowledged}
            onClick={() => update(alert.code, { acknowledged: true })}
          >
            Acknowledge
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => update(alert.code, { suppressed: !alert.suppressed })}
          >
            {alert.suppressed ? "Unsuppress" : "Suppress"}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => update(alert.code, { inhibited: !alert.inhibited })}
          >
            {alert.inhibited ? "Re-enable" : "Inhibit"}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

/** Step 04: the running expedition: timeline, replan options, faults, alerts and the report. */
export function RunStep() {
  const { snapshot, clockAt, outlook, setReportOpen } = useExpedition();
  const { dispatch } = useRoutePlan();
  const now = useTick(500);
  const route = snapshot?.config.route;
  if (!snapshot || !route)
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>No expedition is running.</p>
        <p className="text-muted-foreground">
          Plan a route, check its simulated resource budget in 03 Check, then launch it. The crew,
          the suit supplies and the clock then run here and on the map.
        </p>
        <Button variant="outline" onClick={() => dispatch({ type: "goTo", step: "check" })}>
          Go to 03 Check
        </Button>
      </div>
    );
  const at = clockAt(now);
  const position = snapshot.state.position;
  const departed = route.legs.length > 0 && at >= route.legs[0].start_s;
  const shelter = route.shelter === "rover" ? "rover" : "habitat";
  const ended = snapshot.clock.mode === "ended";
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section
        title={route.mode === "walking" ? "Walk from the habitat" : "Walk from the parked rover"}
        detail={position ? `${metres(position.travelled_m)} walked` : undefined}
      >
        <Timeline snapshot={snapshot} at={at} />
        {route.decisions?.length ? (
          <ul
            className="flex flex-col gap-1 text-xs text-muted-foreground"
            aria-label="Replans applied"
          >
            {route.decisions.map((d) => (
              <li key={`${d.at_s}-${d.option}`}>
                <span className="font-mono">{missionTime(d.at_s)}</span> · Replanned: {d.title}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Options from here" detail={departed ? undefined : "After departure"}>
        {ended ? (
          <p>
            Simulation ended at {missionTime(at)}. Launch a new expedition from 03 Check to run
            again.
          </p>
        ) : departed ? (
          <Replan />
        ) : (
          <p className="text-sm text-muted-foreground">
            Options appear once the crew leaves the {shelter}. The pre-flight budget is in 03 Check.
          </p>
        )}
      </Section>
      {!ended && (
        <Section title="Risk simulations" detail="Simulated">
          <Faults snapshot={snapshot} />
        </Section>
      )}
      <Section title="Alerts">
        <AlertQueue />
      </Section>
      <Section title="Mission report">
        <Button variant="outline" onClick={() => setReportOpen(true)}>
          <FileTextIcon aria-hidden />
          Open mission report
        </Button>
        {outlook?.options[0]?.reasons.length ? (
          <p className="text-xs text-muted-foreground">
            {outlook.options[0].reasons.map(reasonText).join(" ")}
          </p>
        ) : null}
      </Section>
      <p className="text-xs text-muted-foreground">
        Suit supplies {grams(snapshot.config.oxygen.eva.capacity_g)} O₂ and{" "}
        {wattHours(snapshot.config.battery.eva.capacity_wh)} for {snapshot.config.crew_count} crew
        are sized to the flight rules. Everything here is simulated; MOXIE rows are archived NASA
        data.
      </p>
    </div>
  );
}
