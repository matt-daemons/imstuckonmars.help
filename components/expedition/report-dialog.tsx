"use client";

import { CircleCheckIcon, CircleXIcon, InfoIcon, PrinterIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { missionApi, type MissionReport } from "@/lib/mission/client";
import { formatNumber } from "@/lib/mission/format";
import type { ScenarioEvent } from "@/lib/mission/types";

import { useExpedition } from "./expedition-provider";
import { summarize } from "./report-model";
import { ACTIVITY_LABEL, grams, metres, missionTime, signed, span, wattHours } from "./present";
import "./expedition.css";

type Row = MissionReport["series"][number];

export function eventLabel(event: ScenarioEvent): string {
  switch (event.type) {
    case "weather_risk":
      return `${event.risk === "dust" ? "Dust-front" : "Cold-snap"} drill ${event.active ? "enabled" : "cleared"}`;
    case "oxygen_leak":
      return event.value > 0
        ? `Suit oxygen leak ${formatNumber(event.value, 0)} g/h`
        : "Suit leak stopped";
    case "consumption_change":
      return event.value === 1
        ? "Exertion back to normal"
        : `Exertion ×${formatNumber(event.value, 1)}`;
    case "battery_failure":
      return `Suit battery cells lost: ${formatNumber(event.value, 0)} Wh usable`;
    case "generator_failure":
      return "Habitat generator failure";
    case "generator_restore":
      return "Habitat generator restored";
    case "route_blocked":
      return "Return route blocked";
    case "generation_change":
      return `Generation set to ${formatNumber(event.value, 0)} W`;
    case "transfer_oxygen":
      return `Oxygen transfer ${formatNumber(event.value, 0)} g`;
    case "transfer_energy":
      return `Energy transfer ${formatNumber(event.value, 0)} Wh`;
  }
}

/** Suit supplies over the mission, with reserves, phases, faults and replans. */
export function ReportChart({ report }: { report: MissionReport }) {
  const { config, series, events } = report;
  const figure = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    if (!figure.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(figure.current);
    return () => observer.disconnect();
  }, []);
  // Keep text at its actual pixel size, rather than shrinking a desktop SVG on phones.
  const W = Math.max(260, width);
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const end = Math.max(report.at_s, 1);
  const x = (t: number) => pad.l + (t / end) * (W - pad.l - pad.r);
  const y = (fraction: number) => pad.t + (1 - fraction) * (H - pad.t - pad.b);
  const line = (value: (r: Row) => number) =>
    series
      .map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)},${y(value(r)).toFixed(1)}`)
      .join(" ");
  const o2 = (r: Row) => r.suit_oxygen_g / config.oxygen.eva.capacity_g;
  const wh = (r: Row) => r.suit_energy_wh / config.battery.eva.capacity_wh;
  const reserveO2 = config.oxygen.eva.reserve_g / config.oxygen.eva.capacity_g;
  const reserveWh = config.battery.eva.reserve_wh / config.battery.eva.capacity_wh;
  const decisions = (config.route?.decisions ?? []).filter((d) => d.at_s <= report.at_s);
  const occurred = events.filter((event) => event.at_s <= report.at_s);
  return (
    <figure className="report-chart" ref={figure}>
      <h3 className="font-heading font-semibold">Suit supplies · recorded simulation</h3>
      <p className="text-sm text-muted-foreground">
        Capacity (%) against mission elapsed time (hh:mm:ss)
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Suit oxygen and suit battery as a percentage of capacity from ${missionTime(0)} to ${missionTime(report.at_s)}, with both reserves, ${occurred.length} events and ${decisions.length} replans marked.`}
      >
        {config.schedule
          .filter((e) => e.activity !== "base" && e.start_s < end)
          .map((e) => (
            <rect
              key={`${e.start_s}-${e.activity}`}
              className="report-band"
              data-activity={e.activity}
              x={x(e.start_s)}
              y={pad.t}
              width={Math.max(0, x(Math.min(e.end_s, end)) - x(e.start_s))}
              height={H - pad.t - pad.b}
            />
          ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="report-grid" x1={pad.l} x2={W - pad.r} y1={y(f)} y2={y(f)} />
            <text className="report-tick" x={pad.l - 6} y={y(f) + 4} textAnchor="end">
              {f * 100}%
            </text>
          </g>
        ))}
        <line
          className="report-reserve"
          x1={pad.l}
          x2={W - pad.r}
          y1={y(reserveO2)}
          y2={y(reserveO2)}
        />
        <text className="report-tick" x={W - pad.r} y={y(reserveO2) - 4} textAnchor="end">
          Suit reserves
        </text>
        <line
          className="report-reserve"
          x1={pad.l}
          x2={W - pad.r}
          y1={y(reserveWh)}
          y2={y(reserveWh)}
        />
        {occurred.map((event) => (
          <line
            key={event.id}
            className="report-event"
            x1={x(event.at_s)}
            x2={x(event.at_s)}
            y1={pad.t}
            y2={H - pad.b}
          />
        ))}
        {decisions.map((d) => (
          <line
            key={`${d.at_s}-${d.option}`}
            className="report-decision"
            x1={x(d.at_s)}
            x2={x(d.at_s)}
            y1={pad.t}
            y2={H - pad.b}
          />
        ))}
        <path className="report-line-battery" d={line(wh)} />
        <path className="report-line-oxygen" d={line(o2)} />
        {(W < 440 ? [0, 1] : [0, 0.5, 1]).map((f) => (
          <text
            key={f}
            className="report-tick"
            x={x(end * f)}
            y={H - 8}
            textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
          >
            {missionTime(end * f)}
          </text>
        ))}
      </svg>
      <figcaption className="report-legend">
        <span data-series="oxygen">Suit O₂</span>
        <span data-series="battery">Suit battery</span>
        <span data-series="reserve">Suit reserves</span>
        <span data-series="event">Scenario event</span>
        <span data-series="decision">Replan</span>
        <span>Shaded: away from shelter</span>
      </figcaption>
    </figure>
  );
}

/** The end-of-mission report (priority 5): outcome, lowest margins, chart and log. */
export function ReportDialog() {
  const {
    access,
    snapshot,
    reportOpen,
    setReportOpen,
    completedReport,
    finished,
    reportSave,
    reportSaveError,
    retryReportSave,
  } = useExpedition();
  const [report, setReport] = useState<MissionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = snapshot?.revision;
  // While open during a run, refresh every 30 mission seconds rather than on every snapshot.
  const at = Math.floor((snapshot?.state.elapsed_s ?? 0) / 30);

  useEffect(() => {
    if (!reportOpen || !access || finished) return;
    let cancelled = false;
    setError(null);
    setReport(null);
    missionApi
      .report(access)
      .then((value) => !cancelled && setReport(value))
      .catch((cause: Error) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [reportOpen, access, revision, at, finished]);

  const finalReport =
    completedReport?.mission_id === snapshot?.mission_id && completedReport?.revision === revision
      ? completedReport
      : null;
  return (
    <ReportViewer
      open={reportOpen}
      onOpenChange={setReportOpen}
      report={finished ? finalReport : report}
      error={finished ? null : error}
      notice={
        finished ? (
          <div className="report-save-status" role="status">
            {reportSave === "saved" ? (
              "Saved in this browser. Reopen from Mission dashboard → Simulation reports."
            ) : reportSave === "removed" ? (
              "The saved browser copy was removed. This current-session report is still available to print."
            ) : reportSave === "error" ? (
              <>
                Report not saved: {reportSaveError}. Keep this run until saving succeeds.{" "}
                <Button variant="outline" onClick={retryReportSave}>
                  Retry saving report
                </Button>
              </>
            ) : (
              "Saving report in this browser…"
            )}
          </div>
        ) : undefined
      }
    />
  );
}

/** Read-only viewer shared by the current mission and locally archived reports. */
export function ReportViewer({
  open,
  onOpenChange,
  report,
  error,
  notice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: MissionReport | null;
  error?: string | null;
  notice?: ReactNode;
}) {
  const facts = report?.config.route ? summarize(report) : null;
  const shelter = report?.config.route?.shelter === "rover" ? "rover" : "habitat";
  const log = report
    ? [
        ...report.config.schedule
          .filter((e) => e.start_s <= report.at_s)
          .map((e, i) => ({
            t: e.start_s,
            kind: "phase" as const,
            text:
              e.activity === "base"
                ? i === 0
                  ? "Suit up at shelter"
                  : "Back at shelter"
                : ACTIVITY_LABEL[e.activity],
          })),
        ...report.events
          .filter((e) => e.at_s <= report.at_s)
          .map((e) => ({ t: e.at_s, kind: "fault" as const, text: eventLabel(e) })),
        ...(report.config.route?.decisions ?? []).map((d) => ({
          t: d.at_s,
          kind: "replan" as const,
          text: `Replanned: ${d.title}`,
        })),
        ...(report.ended_by_operator
          ? [{ t: report.at_s, kind: "end" as const, text: "Simulation ended by operator" }]
          : []),
      ].sort((a, b) => a.t - b.t)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="report-dialog" showCloseButton={false} bottomStickOnMobile={false}>
        <header className="report-header">
          <div>
            <DialogTitle className="font-heading text-lg">Mission report</DialogTitle>
            <DialogDescription>
              {report?.config.route
                ? `${report.config.route.mode === "walking" ? "Walk from the habitat" : "Walk from the parked rover"} · ${missionTime(report.at_s)} mission elapsed · ${report.ended_by_operator ? "ended by operator" : "simulated"}`
                : "Simulated expedition"}
            </DialogDescription>
          </div>
          <div className="report-actions">
            <Button
              variant="outline"
              disabled={!report || Boolean(error)}
              onClick={() => window.print()}
            >
              <PrinterIcon aria-hidden />
              Print
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <XIcon aria-hidden />
              Close
            </Button>
          </div>
        </header>
        <div className="report-body">
          {notice && <div className="report-notice">{notice}</div>}
          {error ? (
            <p role="alert" className="text-destructive-foreground">
              Report not loaded: {error}. Close and open it again to retry.
            </p>
          ) : !report || !facts ? (
            <p className="text-muted-foreground">
              {report ? "No expedition has been launched." : "Compiling the report…"}
            </p>
          ) : (
            <>
              {facts.returned && !facts.breached ? (
                <Alert variant="success">
                  <CircleCheckIcon aria-hidden />
                  <AlertTitle>Crew back at the {shelter} with every suit reserve</AlertTitle>
                  <AlertDescription>
                    Lowest margins: O₂ {signed(facts.o2Margin, "g")}, battery{" "}
                    {signed(facts.whMargin, "Wh")} above reserve.
                  </AlertDescription>
                </Alert>
              ) : facts.breached ? (
                <Alert variant="error">
                  <CircleXIcon aria-hidden />
                  <AlertTitle>A suit reserve was breached</AlertTitle>
                  <AlertDescription>
                    Lowest margins: O₂ {signed(facts.o2Margin, "g")}, battery{" "}
                    {signed(facts.whMargin, "Wh")}.{" "}
                    {facts.returned
                      ? `The crew still reached the ${shelter}.`
                      : "The crew has not reached shelter yet."}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="info">
                  <InfoIcon aria-hidden />
                  <AlertTitle>
                    {report.ended_by_operator ? "Simulation ended early" : "Expedition in progress"}
                  </AlertTitle>
                  <AlertDescription>
                    {report.ended_by_operator
                      ? facts.departed
                        ? `The crew did not return to the ${shelter}. This is the final recorded state, not a completed return.`
                        : `The crew had not left the ${shelter}. The final supplies and position are preserved.`
                      : "This report covers the mission so far and updates while open."}
                  </AlertDescription>
                </Alert>
              )}
              <dl className="report-facts">
                <div>
                  <dt>Time on EVA</dt>
                  <dd>{span(facts.eva)}</dd>
                </div>
                <div>
                  <dt>Distance walked</dt>
                  <dd>{metres(facts.travelled)}</dd>
                </div>
                <div>
                  <dt>Farthest sampled from {shelter}</dt>
                  <dd>{metres(facts.farthest)}</dd>
                </div>
                <div>
                  <dt>Sampling done</dt>
                  <dd>
                    {span(facts.science)}{" "}
                    <span className="text-muted-foreground">of {span(facts.plannedScience)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Lowest suit O₂ margin</dt>
                  <dd data-negative={facts.o2Margin < 0 || undefined}>
                    {signed(facts.o2Margin, "g")}
                  </dd>
                </div>
                <div>
                  <dt>Lowest battery margin</dt>
                  <dd data-negative={facts.whMargin < 0 || undefined}>
                    {signed(facts.whMargin, "Wh")}
                  </dd>
                </div>
              </dl>
              {report.events.some((event) => event.type === "weather_risk") &&
                report.final.weather_risk_effects && (
                  <section aria-labelledby="report-weather-drills">
                    <h3 id="report-weather-drills" className="font-heading font-semibold">
                      Weather risk drills
                    </h3>
                    <dl className="report-facts">
                      <div>
                        <dt>Dust drill outside</dt>
                        <dd>{span(report.final.weather_risk_effects.dust_drill_s)}</dd>
                      </div>
                      <div>
                        <dt>Cold drill outside</dt>
                        <dd>{span(report.final.weather_risk_effects.cold_drill_s)}</dd>
                      </div>
                      <div>
                        <dt>Extra exertion energy demand</dt>
                        <dd>{wattHours(report.final.weather_risk_effects.extra_exertion_wh)}</dd>
                      </div>
                      <div>
                        <dt>Extra heater energy demand</dt>
                        <dd>{wattHours(report.final.weather_risk_effects.extra_heater_wh)}</dd>
                      </div>
                      <div>
                        <dt>Extra oxygen demand</dt>
                        <dd>{grams(report.final.weather_risk_effects.extra_oxygen_demand_g)}</dd>
                      </div>
                    </dl>
                    <p className="text-sm">
                      Operator-injected assumptions, not NASA measurements. Dust increases outside
                      exertion by 25%. Cold adds 70 W of heater demand per two crew while outside.
                      Movement speed is unchanged. No measured weather, temperature replay or visual
                      effects are used.
                    </p>
                  </section>
                )}
              <ReportChart report={report} />
              <section aria-labelledby="report-log">
                <h3 id="report-log" className="font-heading font-semibold">
                  Mission log
                </h3>
                <ol className="report-log">
                  {log.map((entry, i) => (
                    <li key={i} data-kind={entry.kind}>
                      <span className="font-mono">{missionTime(entry.t)}</span>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <p className="text-sm text-muted-foreground">
                Suits {grams(report.config.oxygen.eva.capacity_g)} O₂ and{" "}
                {wattHours(report.config.battery.eva.capacity_wh)} for {report.config.crew_count}{" "}
                crew, reserves {grams(report.config.oxygen.eva.reserve_g)} and{" "}
                {wattHours(report.config.battery.eva.reserve_wh)}. {report.provenance} Not an
                operational safety assessment.
              </p>
            </>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
