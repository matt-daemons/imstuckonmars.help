"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { HomebaseData, HomebaseMetric } from "@/lib/homebase/types";
import { formatNumber } from "@/lib/mission/format";
import { useTablePageSize } from "@/hooks/use-table-page-size";
import { ObservationPlot, clockLabel } from "./observation-plot";

export function ObservationRecords({
  metric,
  from,
  to,
}: {
  metric: HomebaseMetric;
  from: number;
  to: number;
}) {
  const { ref, size } = useTablePageSize();
  const [page, setPage] = useState(0);
  const points = metric.points.filter((point) => point.utc_ms >= from && point.utc_ms <= to);
  const pages = Math.max(1, Math.ceil(points.length / size));
  const current = Math.min(page, pages - 1),
    offset = current * size;
  return (
    <section className="hb-records">
      <p className="hb-record-note">
        {metric.note}{" "}
        {metric.source.url && (
          <a href={metric.source.url} target="_blank" rel="noreferrer">
            NASA source product ↗
          </a>
        )}
      </p>
      <p className="hb-plot-context">
        {clockLabel(from)}–{clockLabel(to)} · Approx. UTC
      </p>
      <div ref={ref} className="hb-table-window">
        <table>
          <caption className="sr-only">
            {metric.title}: archived observations, gaps and withheld values are not zero.
          </caption>
          <thead>
            <tr>
              <th scope="col">Approx. UTC</th>
              <th scope="col">
                {metric.title} ({metric.unit})
              </th>
              <th scope="col">Samples</th>
            </tr>
          </thead>
          <tbody>
            {points.slice(offset, offset + size).map((p) => (
              <tr key={p.utc_ms}>
                <td>{clockLabel(p.utc_ms)}</td>
                <td>
                  {p.value == null ? "Withheld / missing" : formatNumber(p.value, metric.decimals)}
                </td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hb-pagination">
        <span role="status">
          Rows {points.length ? offset + 1 : 0}–{Math.min(offset + size, points.length)} of{" "}
          {points.length}
        </span>
        <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}

export function ObservationInspector({
  metric,
  data,
  onClose,
  generation,
}: {
  metric: HomebaseMetric | null;
  data: HomebaseData | null;
  onClose: () => void;
  generation: number;
}) {
  const [view, setView] = useState("chart");
  const [zoomed, setZoomed] = useState(false);
  const close = () => {
    onClose();
    setView("chart");
    setZoomed(false);
  };
  const from = data?.coverage.from_utc_ms ?? 0;
  const to = data?.coverage.to_utc_ms ?? 0;
  const start = zoomed ? Math.max(from, to - 30 * 60000) : from;
  return (
    <Dialog
      open={!!metric && !!data}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPopup
        className="hb-inspector-dialog"
        showCloseButton={false}
        bottomStickOnMobile={false}
      >
        {metric && data && (
          <div className="homebase-dashboard hb-inspector-shell" data-loaded>
            <header className="hb-header">
              <DialogTitle>{metric.title} · archive inspection</DialogTitle>
              <Button variant="outline" onClick={close}>
                <X aria-hidden />
                Close
              </Button>
            </header>
            <DialogDescription className="hb-archive-bar">
              Historical {metric.source.site} observations. Approximate UTC, not live homebase
              conditions.
            </DialogDescription>
            <nav className="hb-inspector-nav" aria-label="Observation inspection">
              <Button
                variant="ghost"
                aria-pressed={view === "chart"}
                onClick={() => setView("chart")}
              >
                Chart
              </Button>
              <Button
                variant="ghost"
                aria-pressed={view === "values"}
                onClick={() => setView("values")}
              >
                Values & source
              </Button>
            </nav>
            <div className="hb-inspector-content">
              {view === "chart" ? (
                <ObservationPlot
                  metric={metric}
                  from={from}
                  to={to}
                  revealKey={generation}
                  zoomed={zoomed}
                  onZoomChange={setZoomed}
                />
              ) : (
                <ObservationRecords key={metric.id} metric={metric} from={start} to={to} />
              )}
            </div>
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}
