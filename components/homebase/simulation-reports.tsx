"use client";

import { useEffect, useState } from "react";
import { FileTextIcon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportViewer } from "@/components/expedition/report-dialog";
import { summarize } from "@/components/expedition/report-model";
import { missionTime } from "@/components/expedition/present";
import { useExpedition } from "@/components/expedition/expedition-provider";
import {
  listReports,
  REPORT_HISTORY_CHANGED,
  REPORT_HISTORY_LIMIT,
  type SavedReport,
} from "@/lib/mission/report-history";

export function reportOutcome(saved: SavedReport) {
  const facts = summarize(saved.report);
  return facts.returned
    ? facts.breached
      ? "Returned · reserve breached"
      : "Returned"
    : "Ended before return";
}

export function SavedReportCard({ saved, onOpen }: { saved: SavedReport; onOpen: () => void }) {
  const report = saved.report;
  return (
    <article className="hb-saved-report">
      <div>
        <h3>
          {report.config.route?.mode === "drive_walk" ? "Rover walk" : "Habitat walk"} ·{" "}
          {reportOutcome(saved)}
        </h3>
        <p>
          Saved{" "}
          <time className="font-mono" dateTime={new Date(saved.saved_at_ms).toISOString()}>
            {new Date(saved.saved_at_ms).toISOString().replace("T", " ").slice(0, 19)}
          </time>{" "}
          UTC
        </p>
        <p>
          Mission elapsed <span className="font-mono">{missionTime(report.at_s)}</span>
        </p>
        <p className="hb-report-id">
          Report <span className="font-mono">{saved.id}</span>
        </p>
      </div>
      <Button
        variant="outline"
        onClick={onOpen}
        aria-label={`Open report saved ${new Date(saved.saved_at_ms).toISOString()}`}
      >
        <FileTextIcon aria-hidden />
        Open report
      </Button>
    </article>
  );
}

export function SimulationReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const { finished, reportSave, reportSaveError, retryReportSave } = useExpedition();
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      void listReports()
        .then((rows) => {
          if (!cancelled) {
            setReports(rows);
            setError(null);
          }
        })
        .catch((cause: Error) => {
          if (!cancelled) setError(cause.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    window.addEventListener(REPORT_HISTORY_CHANGED, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener(REPORT_HISTORY_CHANGED, load);
      window.removeEventListener("focus", load);
    };
  }, [refresh]);
  const filtered = reports.filter((saved) =>
    `${saved.id} ${reportOutcome(saved)} ${new Date(saved.saved_at_ms).toISOString()}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="hb-report-history" aria-labelledby="hb-reports-title">
      <header className="hb-panel-heading">
        <h2 id="hb-reports-title">Saved simulation reports</h2>
        <Button variant="ghost" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
          <RefreshCwIcon aria-hidden />
          Reload reports
        </Button>
      </header>
      <p className="hb-report-note">
        <InfoIcon aria-hidden />
        <span>
          Latest {REPORT_HISTORY_LIMIT} completed or ended runs, saved in this browser only. Not
          NASA experiments. Clearing site data removes them; use Print to keep a copy.
        </span>
      </p>
      {finished && reportSave === "error" && (
        <div className="hb-report-note" role="alert">
          The latest report was not saved: {reportSaveError}.{" "}
          <Button variant="outline" onClick={retryReportSave}>
            Retry saving report
          </Button>
        </div>
      )}
      {finished && reportSave === "saving" && (
        <p className="hb-report-note" role="status">
          Saving the latest simulation report…
        </p>
      )}
      <div className="hb-report-filter">
        <label htmlFor="report-search">Find a report</label>
        <Input
          id="report-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Date, outcome or report ID"
        />
        <span role="status">
          {loading ? "Reading reports…" : `${filtered.length} of ${reports.length} reports`}
        </span>
      </div>
      {error ? (
        <p className="hb-report-note" role="alert">
          Reports could not be read: {error}. Use Reload reports to retry.
        </p>
      ) : (
        <div
          className="hb-report-list"
          tabIndex={0}
          aria-label="Saved simulation reports"
          aria-busy={loading}
        >
          {filtered.map((saved) => (
            <SavedReportCard key={saved.id} saved={saved} onOpen={() => setSelected(saved)} />
          ))}
          {!loading && !filtered.length && (
            <p className="hb-report-note">
              {reports.length
                ? "No reports match this search."
                : "No saved reports yet. Finish or end a simulation on the map to save its report here."}
            </p>
          )}
        </div>
      )}
      <ReportViewer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        report={selected?.report ?? null}
        notice="Saved simulation report · read-only browser copy"
      />
    </section>
  );
}
