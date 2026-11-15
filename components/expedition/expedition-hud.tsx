"use client";

import {
  CircleXIcon,
  CrosshairIcon,
  FileTextIcon,
  ListChecksIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SirenIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useRoutePlan } from "@/components/route/route-plan-provider";
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
import { useSidebar } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { annunciating, secondsToReserve, suitRates } from "@/lib/mission/alerts";
import type { Snapshot } from "@/lib/mission/client";
import { formatNumber } from "@/lib/mission/format";
import { crewPositionAt } from "@/lib/mission/position";

import { SPEEDS, useExpedition, type Speed } from "./expedition-provider";
import {
  PHASE_LABEL,
  RESOURCE_LABEL,
  STATUS_STYLE,
  metres,
  missionTime,
  signed,
  span,
} from "./present";
import { ReportDialog } from "./report-dialog";
import { EndSimulation } from "./end-simulation";
import "./expedition.css";

/** Text that follows the extrapolated mission clock every frame without re-rendering React. */
function LiveText({ format }: { format: (t: number) => string }) {
  const { clockAt } = useExpedition();
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const text = formatRef.current(clockAt(Date.now()));
      if (text !== last && ref.current) ref.current.textContent = last = text;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clockAt]);
  return <span ref={ref} />;
}

type GaugeTone = "nominal" | "warning" | "error";

export function ExpeditionGauge({
  label,
  value,
  unit,
  fraction,
  reserveFraction,
  tone,
  detail,
}: {
  label: string;
  value: string;
  unit: string;
  fraction: number;
  reserveFraction?: number;
  tone: GaugeTone;
  detail: string;
}) {
  const Icon = tone === "error" ? CircleXIcon : tone === "warning" ? TriangleAlertIcon : null;
  return (
    <div className="hud-gauge" data-tone={tone}>
      <div className="hud-gauge-head">
        <span>{label}</span>
        <span className="hud-gauge-value">
          {Icon && (
            <Icon
              role="img"
              aria-label={tone === "error" ? "Below reserve" : "Reserve approaching"}
              className="size-4"
            />
          )}
          <span className="font-mono">{value}</span> <span className="hud-unit">{unit}</span>
        </span>
      </div>
      <div className="hud-bar" aria-hidden>
        <span
          className="hud-bar-fill"
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
        />
        {reserveFraction !== undefined && (
          <span className="hud-bar-reserve" style={{ left: `${reserveFraction * 100}%` }} />
        )}
      </div>
      <span className="hud-gauge-detail">{detail}</span>
    </div>
  );
}

function suitGauges(snapshot: Snapshot) {
  const { state, config } = snapshot;
  const rates = suitRates(snapshot);
  const tone = (remaining: number, reserve: number, left: number | null): GaugeTone =>
    remaining < reserve ? "error" : left !== null && left < 30 * 60 ? "warning" : "nominal";
  const o2Left = secondsToReserve(
    state.oxygen.eva.remaining_g,
    config.oxygen.eva.reserve_g,
    rates.oxygen_g_h,
  );
  const whLeft = secondsToReserve(
    state.battery.eva.remaining_wh,
    config.battery.eva.reserve_wh,
    rates.energy_wh_h,
  );
  const drain = (perHour: number, unit: string, left: number | null) =>
    perHour > 0
      ? `−${formatNumber(perHour, 0)} ${unit}/h · reserve in ${left === null ? "unknown time" : span(left)}`
      : "Not drawing (at shelter)";
  return [
    {
      label: "Suit O₂",
      value: formatNumber(state.oxygen.eva.remaining_g, 0),
      unit: "g",
      fraction: state.oxygen.eva.remaining_g / config.oxygen.eva.capacity_g,
      reserveFraction: config.oxygen.eva.reserve_g / config.oxygen.eva.capacity_g,
      tone: tone(state.oxygen.eva.remaining_g, config.oxygen.eva.reserve_g, o2Left),
      detail: drain(rates.oxygen_g_h, "g", o2Left),
    },
    {
      label: "Suit battery",
      value: formatNumber(state.battery.eva.remaining_wh, 0),
      unit: "Wh",
      fraction: state.battery.eva.remaining_wh / config.battery.eva.capacity_wh,
      reserveFraction: config.battery.eva.reserve_wh / config.battery.eva.capacity_wh,
      tone: tone(state.battery.eva.remaining_wh, config.battery.eva.reserve_wh, whLeft),
      detail: drain(rates.energy_wh_h, "Wh", whLeft),
    },
  ];
}

function shelterGauge(snapshot: Snapshot) {
  const { state, config } = snapshot;
  if (config.route?.shelter === "rover") {
    const remaining = state.battery.base.remaining_wh;
    return {
      label: "Rover battery",
      value: formatNumber((remaining / state.battery.base.capacity_wh) * 100, 0),
      unit: "%",
      fraction: remaining / state.battery.base.capacity_wh,
      reserveFraction: config.battery.base.reserve_wh / state.battery.base.capacity_wh,
      tone: (remaining < config.battery.base.reserve_wh ? "error" : "nominal") as GaugeTone,
      detail: `Life support ${formatNumber(config.base_load_w / 1000, 2)} kW · ${config.generation_w > 0 ? "fission covers it" : "no charging credited"}`,
    };
  }
  const o2 = state.oxygen.base;
  return {
    label: "Habitat O₂",
    value: formatNumber(o2.remaining_g / 1000, 2),
    unit: "kg",
    fraction: o2.remaining_g / config.oxygen.base.capacity_g,
    reserveFraction: config.oxygen.base.reserve_g / config.oxygen.base.capacity_g,
    tone: (o2.remaining_g < config.oxygen.base.reserve_g ? "error" : "nominal") as GaugeTone,
    detail: state.generator_available
      ? `MOXIE replay +${formatNumber(state.effective_oxygen_rate_g_h ?? 0, 1)} g/h`
      : "Generator offline",
  };
}

/** The expedition's persistent bottom display: clock, phase, play controls, gauges, return check. */
export function ExpeditionHud() {
  const expedition = useExpedition();
  const {
    snapshot,
    outlook,
    alerts,
    link,
    lastCommand,
    command,
    follow,
    setFollow,
    setReportOpen,
    lastOkAt,
  } = expedition;
  const { dispatch } = useRoutePlan();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const [restart, setRestart] = useState(false);
  const route = snapshot?.config.route;

  const openRun = () => {
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
    dispatch({ type: "goTo", step: "run" });
  };

  // Announce phase changes once, with a brief on-screen transition.
  const phase = snapshot?.state.position?.phase ?? null;
  const [transition, setTransition] = useState<{ key: number; text: string } | null>(null);
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (!phase || !route) return;
    if (lastPhase.current && lastPhase.current !== phase) {
      setTransition({
        key: Date.now(),
        text: phase === "shelter" ? "Back at shelter" : PHASE_LABEL[phase],
      });
    }
    lastPhase.current = phase;
  }, [phase, route, setReportOpen]);

  const counts = {
    emergency: alerts.filter((a) => a.active && a.level === "emergency").length,
    error: alerts.filter((a) => a.active && a.level === "error").length,
    warning: alerts.filter((a) => a.active && a.level === "warning").length,
    unacknowledged: alerts.filter(annunciating).length,
  };

  // A narrow map shows the short form; the title keeps the meaning.
  const linkWord =
    link === "live" ? "live" : link === "stale" ? "stale" : link === "offline" ? "offline" : "";
  const linkText = linkWord ? (
    <>
      <span className="hud-btn-text">Link {linkWord}</span>
      <span className="hud-short-text">{linkWord[0].toUpperCase() + linkWord.slice(1)}</span>
    </>
  ) : (
    "Connecting…"
  );

  // Keep the report mounted, but return the entire bottom display's space to the map.
  if (expedition.finished) return <ReportDialog />;

  if (!snapshot || !route) {
    return (
      <section className="expedition-hud" data-state="idle" aria-label="Expedition">
        <div className="hud-row hud-header">
          <Badge variant="info" className="hud-sim-tag">
            Simulation
          </Badge>
          <span className="hud-idle">
            {expedition.openError
              ? `Mission server unavailable: ${expedition.openError}.`
              : !snapshot
                ? "Opening the mission session…"
                : "No expedition loaded. Plan a route, then launch it from ③ Check."}
          </span>
          {expedition.openError && (
            <Button size="sm" variant="outline" onClick={expedition.retryOpen}>
              Retry
            </Button>
          )}
          <span className="hud-link" data-link={link} title="Mission server link">
            {link === "offline" && <WifiOffIcon aria-hidden className="size-4" />}
            {linkText}
          </span>
        </div>
        <ReportDialog />
      </section>
    );
  }

  const playing = snapshot.clock.mode === "playing";
  const stopped = snapshot.clock.mode === "ended";
  const ended = stopped || snapshot.state.elapsed_s >= snapshot.config.duration_s - 1e-6;
  const departed = route.legs.length > 0 && snapshot.state.elapsed_s >= route.legs[0].start_s;
  const returned = departed && phase === "shelter";
  const busy = lastCommand?.state === "running";
  const plan = outlook?.options.find((o) => o.option === "continue");
  const status = plan ? STATUS_STYLE[plan.status] : null;
  const shelterName = route.shelter === "rover" ? "rover" : "habitat";
  const limit = snapshot.config.eva_limit_s;

  return (
    <section
      className="expedition-hud"
      data-state={stopped ? "ended" : returned ? "returned" : playing ? "playing" : "paused"}
      data-link={link}
      aria-label="Expedition"
    >
      <div className="hud-row hud-header">
        <Badge variant="info" className="hud-sim-tag">
          Simulation
        </Badge>
        <span className="hud-clock" title="Mission elapsed time">
          <span className="hud-label">Mission</span>
          <span className="font-mono">
            <LiveText format={missionTime} />
          </span>
        </span>
        <span className="hud-phase" data-phase={phase ?? "shelter"}>
          {stopped && "Ended · "}
          <LiveText format={(t) => PHASE_LABEL[crewPositionAt(route, t).phase]} />
        </span>
        {transition && (
          <span key={transition.key} className="hud-transition" aria-hidden>
            {transition.text}
          </span>
        )}
        <span className="sr-only" role="status">
          {phase ? `Phase: ${PHASE_LABEL[phase]}` : ""}
        </span>
        <div className="hud-transport">
          <Button
            size="sm"
            variant={playing ? "outline" : "default"}
            disabled={busy || (ended && !playing)}
            onClick={() =>
              void command({ type: playing ? "pause" : "play" }, playing ? "Pause" : "Play")
            }
          >
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
            {playing ? "Pause" : stopped ? "Ended" : ended ? "Complete" : "Play"}
          </Button>
          <ToggleGroup
            aria-label="Playback speed"
            variant="outline"
            size="sm"
            value={[String(snapshot.clock.speed)]}
            onValueChange={(value) => {
              const next = Number(value[0]) as Speed;
              if (next) void command({ type: "speed", speed: next }, `Speed ${next}×`);
            }}
          >
            {SPEEDS.map((speed) => (
              <ToggleGroupItem
                key={speed}
                value={String(speed)}
                disabled={busy || ended}
                className="font-mono"
              >
                {speed}×
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setRestart(true)}
            aria-label="Restart"
            title="Restart"
          >
            <RotateCcwIcon aria-hidden />
            <span className="hud-btn-text">Restart</span>
          </Button>
          <Button
            size="sm"
            variant={follow ? "secondary" : "outline"}
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
            aria-label="Follow the crew"
            title="Follow the crew"
          >
            <CrosshairIcon aria-hidden />
            <span className="hud-btn-text">Follow</span>
          </Button>
        </div>
        <EndSimulation />
        <button
          type="button"
          className="hud-alerts"
          onClick={openRun}
          aria-label={`Alerts: ${counts.emergency} emergency, ${counts.error} error, ${counts.warning} warning, ${counts.unacknowledged} unacknowledged. Open the run step.`}
        >
          <span data-level="emergency" data-on={counts.emergency > 0 || undefined}>
            <SirenIcon aria-hidden className="size-4" />
            <span className="font-mono">{counts.emergency}</span>
          </span>
          <span data-level="error" data-on={counts.error > 0 || undefined}>
            <CircleXIcon aria-hidden className="size-4" />
            <span className="font-mono">{counts.error}</span>
          </span>
          <span data-level="warning" data-on={counts.warning > 0 || undefined}>
            <TriangleAlertIcon aria-hidden className="size-4" />
            <span className="font-mono">{counts.warning}</span>
          </span>
          <span className="hud-unack">
            Unack <span className="font-mono">{counts.unacknowledged}</span>
          </span>
        </button>
        <span className="hud-link" data-link={link} title="Mission server link">
          {link === "offline" && <WifiOffIcon aria-hidden className="size-4" />}
          {linkText}
        </span>
      </div>
      {(link === "stale" || link === "offline") && (
        <p className="hud-stale" role="status">
          Snapshot stale ·{" "}
          {lastOkAt ? `${Math.floor((Date.now() - lastOkAt) / 1000)} s old` : "age unknown"}. Values
          and crew position are not current. Reconnecting…
        </p>
      )}
      <div className="hud-row hud-gauges">
        {suitGauges(snapshot).map((gauge) => (
          <ExpeditionGauge
            key={gauge.label}
            {...gauge}
            detail={stopped ? "Final recorded supply" : gauge.detail}
          />
        ))}
        <ExpeditionGauge
          label="EVA time"
          value={formatNumber(snapshot.state.eva_elapsed_s / 60, 0)}
          unit="min"
          fraction={limit ? snapshot.state.eva_elapsed_s / limit : 0}
          tone={limit && snapshot.state.eva_elapsed_s > limit ? "error" : "nominal"}
          detail={`${metres(snapshot.state.position?.distance_from_shelter_m ?? 0)} from ${shelterName} · limit ${limit ? `${formatNumber(limit / 60, 0)} min` : "none"}`}
        />
        <ExpeditionGauge {...shelterGauge(snapshot)} />
        <div className="hud-outlook" data-status={plan?.status ?? "pending"}>
          <div className="hud-gauge-head">
            <span>{stopped ? "Run outcome" : "Return check"}</span>
            {stopped ? (
              <Badge variant="info">
                <FileTextIcon aria-hidden />
                Ended
              </Badge>
            ) : status ? (
              <Badge variant={status.variant}>
                <status.Icon aria-hidden />
                {returned ? "Returned" : status.label}
              </Badge>
            ) : (
              <span className="hud-gauge-detail">
                {link === "live" ? "Computing…" : "Unavailable"}
              </span>
            )}
          </div>
          <div className="hud-outlook-text">
            {plan?.margins && !returned && !stopped && (
              <span className="hud-outlook-line">
                At {shelterName}{" "}
                <span className="font-mono">
                  {plan.arrival_s !== null ? missionTime(plan.arrival_s) : "Unknown"}
                </span>
                {" · "}O₂ <span className="font-mono">{signed(plan.margins.oxygen_g, "g")}</span>
                {" · "}battery{" "}
                <span className="font-mono">{signed(plan.margins.energy_wh, "Wh")}</span>
              </span>
            )}
            <span className="hud-gauge-detail">
              {stopped
                ? returned
                  ? "Simulation ended at shelter. The report is ready."
                  : "Simulation ended before return. Position and supplies are preserved."
                : returned
                  ? "Crew back in the shelter. The report is ready."
                  : plan?.limiting
                    ? `Margin above reserve at arrival; ${RESOURCE_LABEL[plan.limiting]} is tightest.`
                    : "Modeled resources only; not a safety verdict."}
            </span>
          </div>
          <div className="hud-outlook-actions">
            {returned || ended ? (
              <Button size="sm" onClick={() => setReportOpen(true)}>
                <FileTextIcon aria-hidden />
                Mission report
              </Button>
            ) : (
              <Button
                size="sm"
                variant={plan?.status === "modeled_constraint_violation" ? "default" : "outline"}
                onClick={openRun}
              >
                <ListChecksIcon aria-hidden />
                Options
              </Button>
            )}
          </div>
        </div>
      </div>
      {(lastCommand?.state === "failed" || lastCommand?.state === "unknown") && (
        <p className="hud-command-error" role="alert">
          {lastCommand.label} {lastCommand.state === "unknown" ? "has unknown status" : "failed"}:{" "}
          {lastCommand.message}
        </p>
      )}
      <AlertDialog open={restart} onOpenChange={setRestart}>
        <AlertDialogPopup data-hazard>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart this expedition from the shelter?</AlertDialogTitle>
            <AlertDialogDescription>
              The clock returns to {missionTime(0)}, paused, and every injected fault is removed.
              The planned route and any replans stay. Current time:{" "}
              <span className="font-mono">{missionTime(snapshot.state.elapsed_s)}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Keep running</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setRestart(false);
                void command({ type: "reset" }, "Restart expedition");
              }}
            >
              Restart expedition
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <ReportDialog />
    </section>
  );
}
