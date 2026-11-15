"use client";

import { useEffect, useRef, useState } from "react";
import { CircleXIcon, FileTextIcon, InfoIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportViewer } from "@/components/expedition/report-dialog";
import { summarize } from "@/components/expedition/report-model";
import { missionTime } from "@/components/expedition/present";
import { useExpedition } from "@/components/expedition/expedition-provider";
import {
  listReports,
  removeReport,
  REPORT_HISTORY_CHANGED,
  REPORT_HISTORY_LIMIT,
  type SavedReport,
} from "@/lib/mission/report-history";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function reportOutcome(saved: SavedReport) {
  const facts = summarize(saved.report);
  return facts.returned
    ? facts.breached
      ? "Returned · reserve breached"
      : "Returned"
    : "Ended before return";
}

export function SavedReportCard({
  saved,
  onOpen,
  onRemove,
}: {
  saved: SavedReport;
  onOpen: () => void;
  onRemove: () => void;
}) {
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
      <div className="hb-report-actions">
        <Button
          variant="outline"
          onClick={onOpen}
          aria-label={`Open report saved ${new Date(saved.saved_at_ms).toISOString()}`}
        >
          <FileTextIcon aria-hidden />
          Open report
        </Button>
        <Button
          variant="destructive"
          onClick={onRemove}
          aria-label={`Remove report saved ${new Date(saved.saved_at_ms).toISOString()}`}
        >
          <Trash2Icon aria-hidden />
          Remove report
        </Button>
      </div>
    </article>
  );
}

export function RemoveReportDialog({
  saved,
  busy,
  error,
  onCancel,
  onRemove,
  finalFocus,
}: {
  saved: SavedReport | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onRemove: () => void;
  finalFocus?: () => HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={saved !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogPopup data-hazard initialFocus={() => cancel.current} finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove saved report?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove the report saved{" "}
            {saved ? new Date(saved.saved_at_ms).toISOString().replace("T", " ").slice(0, 19) : ""}{" "}
            UTC from this browser. This cannot be undone. The server-side simulation and other saved
            reports are not changed.
          </AlertDialogDescription>
          <p className="break-all font-mono text-sm">{saved?.id}</p>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-destructive-foreground">
              <CircleXIcon aria-hidden className="size-5 shrink-0" />
              {error}
            </p>
          )}
          <p role="status">{busy ? "Removing report…" : ""}</p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button ref={cancel} variant="outline" disabled={busy} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" disabled={busy} onClick={onRemove}>
            Remove report
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function SimulationReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [removing, setRemoving] = useState<SavedReport | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const removeTrigger = useRef<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const { finished, reportSave, reportSaveError, retryReportSave } = useExpedition();
  useEffect(() => {
    let cancelled = false;
    let request = 0;
    const load = () => {
      const current = ++request;
      setLoading(true);
      void listReports()
        .then((rows) => {
          if (!cancelled && current === request) {
            setReports(rows);
            setError(null);
          }
        })
        .catch((cause: Error) => {
          if (!cancelled && current === request) setError(cause.message);
        })
        .finally(() => {
          if (!cancelled && current === request) setLoading(false);
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
          ref={search}
          id="report-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Date, outcome or report ID"
        />
        <span role="status">
          {loading ? "Reading reports…" : `${filtered.length} of ${reports.length} reports`}
        </span>
      </div>
      <p role="status" className={notice ? "hb-report-note" : "sr-only"}>
        {notice}
      </p>
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
            <SavedReportCard
              key={saved.id}
              saved={saved}
              onOpen={() => setSelected(saved)}
              onRemove={() => {
                removeTrigger.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setRemoveError(null);
                setNotice("");
                setRemoving(saved);
              }}
            />
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
      <RemoveReportDialog
        saved={removing}
        busy={removeBusy}
        error={removeError}
        onCancel={() => setRemoving(null)}
        finalFocus={() =>
          removeTrigger.current?.isConnected ? removeTrigger.current : search.current
        }
        onRemove={async () => {
          if (!removing || removeBusy) return;
          setRemoveBusy(true);
          setRemoveError(null);
          try {
            await removeReport(removing.id);
            setReports((rows) => rows.filter((row) => row.id !== removing.id));
            if (selected?.id === removing.id) setSelected(null);
            setNotice("Report removed from this browser.");
            setRemoving(null);
          } catch (cause) {
            setRemoveError(
              `Report could not be removed: ${cause instanceof Error ? cause.message : "Browser storage is unavailable"}. Try again.`,
            );
          } finally {
            setRemoveBusy(false);
          }
        }}
      />
    </section>
  );
}
