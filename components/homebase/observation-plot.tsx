"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { HomebaseMetric } from "@/lib/homebase/types";
import { nearestObservation, observationSegments } from "@/lib/homebase/plot";
import { formatNumber } from "@/lib/mission/format";
import { Readout } from "./readout";

export const clockLabel = (ms: number) => new Date(ms).toISOString().slice(11, 16);

export function ObservationPlot({
  metric,
  from,
  to,
  revealKey,
  compact = false,
  onExpand,
  showReadout = true,
}: {
  metric: HomebaseMetric;
  from: number;
  to: number;
  revealKey: number;
  compact?: boolean;
  onExpand?: () => void;
  showReadout?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const clipId = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const start = zoom ? Math.max(from, to - 30 * 60000) : from;
  const points = useMemo(
    () => metric.points.filter((p) => p.utc_ms >= start && p.utc_ms <= to),
    [metric, start, to],
  );
  const valid = points.filter((p) => p.value !== null && Number.isFinite(p.value));
  const min = valid.length ? Math.min(...valid.map((p) => p.value!)) : 0;
  const max = valid.length ? Math.max(...valid.map((p) => p.value!)) : 1;
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.001, 0.01);
  const bottom = min - pad,
    top = max + pad;
  const x = (ms: number) => ((ms - start) / Math.max(1, to - start)) * 1000;
  const y = (value: number) => 200 - ((value - bottom) / (top - bottom)) * 200;
  const segments = observationSegments(points, metric.cadence_s);
  const isolated = segments.filter((segment) => segment.length === 1).flat();
  const ticks = compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const selected =
    cursor === null ? null : nearestObservation(points, cursor, (metric.cadence_s * 1000) / 2);
  return (
    <section
      className="hb-trend"
      data-compact={compact || undefined}
      tabIndex={-1}
      aria-labelledby={`${clipId}-title`}
    >
      <header className="hb-panel-heading">
        <h2 id={`${clipId}-title`}>{metric.title}</h2>
        <span className="hb-heading-rule" aria-hidden />
        {onExpand ? (
          <Button
            variant="outline"
            aria-label={`Inspect ${metric.title.toLowerCase()}`}
            onClick={onExpand}
          >
            Zoom
          </Button>
        ) : (
          <Button variant="outline" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
            {zoom ? "Full window" : "Last 30 min"}
          </Button>
        )}
      </header>
      {showReadout && (
        <Readout
          value={metric.value}
          decimals={metric.decimals}
          unit={metric.unit}
          revealKey={revealKey}
        />
      )}
      <p className="hb-plot-context">
        {metric.source.instrument} · {metric.source.site}
        {metric.id === "radiation" ? " · proxy" : ""}
      </p>
      <div className="hb-plot-frame">
        <div className="hb-y-axis" aria-hidden>
          {ticks.map((fraction) => (
            <span key={fraction}>
              {formatNumber(top - fraction * (top - bottom), metric.decimals)}
            </span>
          ))}
        </div>
        <div className="hb-plot-canvas">
          <svg
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${metric.title} history in ${metric.unit}, ${clockLabel(start)} to ${clockLabel(to)} approximate UTC. ${valid.length} available observations. Gaps are not interpolated.`}
          >
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <rect
                  key={`${metric.id}-${revealKey}-${zoom}`}
                  className="hb-trace-mask"
                  x="0"
                  y="0"
                  width="1000"
                  height="200"
                />
              </clipPath>
            </defs>
            {ticks.map((fraction) => (
              <line
                className="hb-gridline"
                key={fraction}
                x1="0"
                x2="1000"
                y1={fraction * 200}
                y2={fraction * 200}
              />
            ))}
            {[0, 250, 500, 750, 1000].map((v) => (
              <line
                className="hb-gridline hb-gridline-vertical"
                key={v}
                x1={v}
                x2={v}
                y1="0"
                y2="200"
              />
            ))}
            <g className="hb-plot-series" clipPath={`url(#${clipId})`}>
              {segments.map((segment, i) => (
                <path
                  key={i}
                  className="hb-signal"
                  d={segment
                    .map((p, index) => `${index ? "L" : "M"}${x(p.utc_ms)},${y(p.value!)}`)
                    .join(" ")}
                />
              ))}
            </g>
            {cursor !== null && (
              <line className="hb-inspect-line" x1={x(cursor)} x2={x(cursor)} y1="0" y2="200" />
            )}
            <rect
              x="0"
              y="0"
              width="1000"
              height="200"
              fill="transparent"
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setCursor(
                  start + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (to - start),
                );
              }}
              onPointerLeave={() => setCursor(null)}
            />
          </svg>
          {isolated.map((point) => (
            <span
              key={point.utc_ms}
              className="hb-signal-point"
              aria-hidden
              style={{ left: `${x(point.utc_ms) / 10}%`, top: `${y(point.value!) / 2}%` }}
            />
          ))}
          {selected?.value != null && (
            <span
              className="hb-signal-point hb-selected-point"
              aria-hidden
              style={{ left: `${x(selected.utc_ms) / 10}%`, top: `${y(selected.value) / 2}%` }}
            />
          )}
        </div>
        <div className="hb-axis-unit">{metric.unit}</div>
      </div>
      <div className="hb-x-axis">
        <span>{clockLabel(start)}</span>
        {!compact && <span>{clockLabel(start + (to - start) / 2)}</span>}
        <span>{clockLabel(to)}</span>
      </div>
      <div className="hb-plot-caption">
        <span>{compact ? "Archive · UTC*" : "Approx. UTC · available archive window"}</span>
        <span className="hb-inspection">
          {cursor === null
            ? `${valid.length} observations`
            : `${clockLabel(cursor)} · ${selected?.value == null ? "No observation" : `${formatNumber(selected.value, metric.decimals)} ${metric.unit}`}`}
        </span>
      </div>
      {!compact && <p className="hb-plot-note">{metric.note}</p>}
    </section>
  );
}
