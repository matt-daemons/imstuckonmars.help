"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LoggedExperiment } from "@/lib/homebase/types";
import { formatDuration, formatNumber } from "@/lib/mission/format";
import { useTablePageSize } from "@/hooks/use-table-page-size";
import { experimentWarning } from "@/lib/homebase/experiments";
import { ConsolePane } from "./pane";
import { Readout } from "./readout";

function RunNotes({ current }: { current: LoggedExperiment }) {
  const [note, setNote] = useState("0");
  const notes = [
    {
      label: "Meaning & units",
      text: "Not crew supply, independent flow or verified purity. Energy includes warmup and diagnostics.",
    },
    ...(current.oxygen_g === null
      ? [
          {
            label: "Missing output",
            text: "No derived output was acquired for this run. Missing is not zero.",
          },
        ]
      : []),
    ...current.warnings.map((warning, i) => ({
      label: `Source note ${i + 1}`,
      text: experimentWarning(warning),
    })),
  ];
  return (
    <div className="hb-run-notes">
      <h3>
        <Info size={16} aria-hidden />
        Experiment notes
      </h3>
      <div className="hb-run-notes-content">
        {notes.map(({ text }, i) =>
          i === 0 || (current.oxygen_g === null && i === 1) ? (
            <p key={text}>{text}</p>
          ) : (
            <p className="hb-warning-note" key={text}>
              · {text}
            </p>
          ),
        )}
      </div>
      <div className="hb-run-note-pages">
        <label htmlFor="hb-source-note">Source note</label>
        <select id="hb-source-note" value={note} onChange={(e) => setNote(e.target.value)}>
          {notes.map(({ label }, i) => (
            <option value={String(i)} key={label}>
              {label}
            </option>
          ))}
        </select>
        <p>{notes[Number(note)]?.text}</p>
      </div>
    </div>
  );
}

export function ExperimentLog({
  experiments,
  today,
}: {
  experiments: LoggedExperiment[];
  today: number;
}) {
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [runView, setRunView] = useState("results");
  const { ref, size } = useTablePageSize();
  const rows = [...experiments]
    .sort((a, b) => b.sol - a.sol)
    .filter((r) => String(r.sol).includes(filter.trim()));
  const current =
    experiments.find((e) => e.sol === selected) ?? experiments.find((e) => e.sol === today);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const currentPage = Math.min(page, pages - 1),
    offset = currentPage * size;
  const number = (value: number | null | undefined, dp: number) =>
    value == null ? "No data" : formatNumber(value, dp);
  return (
    <div
      className="hb-experiment-workspace"
      data-detail={showDetail || undefined}
      data-run-view={runView}
    >
      <ConsolePane
        id="hb-experiments-pane"
        number="01"
        title="Experiment log"
        detail={`MOXIE · ${experiments.length} runs`}
        className="hb-experiments"
      >
        <div className="hb-log-toolbar">
          <label htmlFor="hb-sol-filter">Find sol</label>
          <Input
            id="hb-sol-filter"
            placeholder="e.g. 816"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            inputMode="numeric"
          />
          <span>Newest first · today = sol {today}</span>
        </div>
        <div className="hb-table-window" ref={ref}>
          <table>
            <caption className="sr-only">
              Historical MOXIE runs. Inspect a sol for results and source notes.
            </caption>
            <thead>
              <tr>
                <th scope="col">Sol</th>
                <th scope="col">Oxygen (g)</th>
                <th scope="col">Peak (g/h)</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(offset, offset + size).map((r) => (
                <tr key={r.id} data-selected={current?.sol === r.sol || undefined}>
                  <th scope="row">
                    <Button
                      variant="ghost"
                      aria-label={`Inspect sol ${r.sol}`}
                      aria-pressed={current?.sol === r.sol}
                      onClick={() => {
                        setSelected(r.sol);
                        setShowDetail(true);
                        setRunView("results");
                      }}
                    >
                      <span className="hb-row-cursor" aria-hidden>
                        {current?.sol === r.sol ? ">" : "·"}
                      </span>
                      <span className="font-mono">{r.sol}</span>
                      {r.sol === today && <span className="hb-today-marker">Today</span>}
                    </Button>
                  </th>
                  <td>{number(r.oxygen_g, 2)}</td>
                  <td>{number(r.peak_rate_g_h, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="hb-empty">No recorded sol matches this filter.</p>}
        </div>
        <div className="hb-pagination">
          <span role="status">
            Rows {rows.length ? offset + 1 : 0}–{Math.min(offset + size, rows.length)} of{" "}
            {rows.length}{" "}
            <span className="hb-pagination-total">/ {experiments.length} archived</span>
          </span>
          <Button
            variant="outline"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </ConsolePane>
      <ConsolePane
        id="hb-experiment-detail-pane"
        number="02"
        title="Run inspection"
        detail={current ? `Sol ${current.sol}` : "No selection"}
        className="hb-experiment-detail"
      >
        <Button variant="outline" className="hb-back-to-runs" onClick={() => setShowDetail(false)}>
          <ArrowLeft aria-hidden />
          Back to runs
        </Button>
        <nav className="hb-run-view-nav" aria-label="Run inspection">
          <Button
            variant="ghost"
            aria-pressed={runView === "results"}
            onClick={() => setRunView("results")}
          >
            Results
          </Button>
          <Button
            variant="ghost"
            aria-pressed={runView === "notes"}
            onClick={() => setRunView("notes")}
          >
            Notes & source
          </Button>
        </nav>
        {current ? (
          <div className="hb-run-body" aria-live="polite">
            <span className="hb-muted">Recorded oxygen · current-derived</span>
            <Readout value={current.oxygen_g} decimals={2} unit="g" revealKey={current.sol} />
            <dl className="hb-run-stats">
              <div>
                <dt>Peak rate</dt>
                <dd>{number(current.peak_rate_g_h, 2)} g/h</dd>
              </div>
              <div>
                <dt>Active mean</dt>
                <dd>{number(current.active_mean_g_h, 2)} g/h</dd>
              </div>
              <div>
                <dt>Active time</dt>
                <dd>
                  {current.active_seconds == null
                    ? "Not available"
                    : formatDuration(current.active_seconds)}
                </dd>
              </div>
              <div>
                <dt>Run energy</dt>
                <dd>{number(current.energy_wh, 1)} Wh</dd>
              </div>
            </dl>
            <RunNotes key={current.sol} current={current} />
            {current.source_url && (
              <a
                className="hb-text-action"
                href={current.source_url}
                target="_blank"
                rel="noreferrer"
              >
                NASA experiment source <ExternalLink size={16} aria-hidden />
              </a>
            )}
          </div>
        ) : (
          <p className="hb-empty">Choose a recorded sol to inspect its results.</p>
        )}
      </ConsolePane>
    </div>
  );
}
