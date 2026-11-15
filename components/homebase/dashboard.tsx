"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Database, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HomebaseData, HomebaseMetric, MetricId } from "@/lib/homebase/types";
import { formatNumber } from "@/lib/mission/format";
import { Readout } from "./readout";
import { ObservationPlot, clockLabel } from "./observation-plot";
import { ExperimentLog } from "./experiment-log";
import { ReferencePanes } from "./reference-panes";
import { ObservationInspector } from "./observation-inspector";
import { ReferenceInspector } from "./reference-inspector";
import "./terminal.css";
import faviconUrl from "@/app/icon.svg?url";
import { DebugMenu } from "@/components/debug/debug-menu";

export type DashboardPage = "overview" | "experiments";
const PLACEHOLDERS = [
  { id: "temperature", title: "Air temperature", unit: "K", source: "MEDA · Jezero" },
  { id: "pressure", title: "Atmospheric pressure", unit: "Pa", source: "MEDA · Jezero" },
  { id: "water_vapor", title: "Water vapor", unit: "ppm", source: "MEDA · Jezero" },
  { id: "radiation", title: "Radiation proxy", unit: "µGy/h", source: "RAD · Gale" },
] as const;

export function MetricCard({
  metric,
  selected,
  onSelect,
  revealKey,
}: {
  metric: HomebaseMetric;
  selected: boolean;
  onSelect: () => void;
  revealKey: number;
}) {
  return (
    <button
      type="button"
      className="hb-metric"
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-label={`View ${metric.title.toLowerCase()} history. ${metric.value === null ? "No data" : `${formatNumber(metric.value, metric.decimals)} ${metric.unit}`}. ${metric.source.instrument}, ${metric.source.site}`}
      onClick={onSelect}
    >
      <span className="hb-metric-heading">
        {metric.id === "pressure" ? "Pressure" : metric.title}
        <span aria-hidden>{selected ? ">" : "·"}</span>
      </span>
      <Readout
        value={metric.value}
        decimals={metric.decimals}
        unit={metric.unit}
        revealKey={revealKey}
      />
      <span className="hb-metric-source">
        {metric.source.instrument} · {metric.source.site}
        {metric.id === "radiation" ? " · proxy" : ""}
      </span>
    </button>
  );
}

export function HomebaseDashboard({
  onClose,
  base,
  initialPage = "overview",
}: {
  onClose?: () => void;
  base?: { latitude_deg: number; longitude_deg: number };
  initialPage?: DashboardPage;
} = {}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<HomebaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const [active, setActive] = useState<MetricId>("temperature");
  const [inspect, setInspect] = useState<MetricId | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [request, setRequest] = useState(0);
  const reload = useCallback(() => setRequest((n) => n + 1), []);
  const navigate = useCallback(
    (next: DashboardPage) => {
      if (onClose) setPage(next);
      else router.push(next === "overview" ? "/mission" : "/mission/experiments");
    },
    [onClose, router],
  );
  useEffect(() => setPage(initialPage), [initialPage]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const response = await fetch("/api/telemetry/homebase", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message: string };
          } | null;
          throw new Error(body?.error?.message ?? `Archive request failed (${response.status})`);
        }
        const body = (await response.json()) as HomebaseData;
        if (!controller.signal.aborted) {
          setData(body);
          setGeneration((n) => n + 1);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Archive connection unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        document.querySelector(".hb-inspector-dialog") ||
        (e.target as HTMLElement).closest("input,textarea,select,button,a,[contenteditable=true]")
      )
        return;
      if (e.key === "1" || e.key === "2") {
        e.preventDefault();
        navigate(e.key === "1" ? "overview" : "experiments");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [navigate]);
  const metric = data?.metrics.find((m) => m.id === active);
  const close = () => (onClose ? onClose() : router.push("/"));
  return (
    <div
      className="homebase-dashboard"
      data-page={page}
      data-loaded={!!data || undefined}
      data-stale={error && data ? true : undefined}
    >
      <a href="#hb-content" className="hb-skip-link">
        Skip to mission data
      </a>
      <header className="hb-header">
        <div className="hb-brand">
          <img src={faviconUrl} alt="" width={20} height={20} />
          <span>
            imstuckonmars.help
            <span className="hb-wordmark-cursor" aria-hidden>
              {" "}
              ▰
            </span>
          </span>
        </div>
        <h1>Mission {page === "overview" ? "console" : "experiments"}</h1>
        <nav aria-label="Mission dashboard navigation">
          <Button
            variant="ghost"
            aria-current={page === "overview" ? "page" : undefined}
            onClick={() => navigate("overview")}
          >
            Overview
          </Button>
          <Button
            variant="ghost"
            aria-current={page === "experiments" ? "page" : undefined}
            onClick={() => navigate("experiments")}
          >
            Experiments
          </Button>
          <Button variant="ghost" onClick={close}>
            Full map <ArrowUpRight aria-hidden />
          </Button>
        </nav>
      </header>
      <div className="hb-archive-bar">
        <span>
          <Info size={16} aria-hidden />
          <strong>Historical NASA reference</strong>
          <span className="hb-banner-detail">
            No live weather. No operational safety certification.
          </span>
        </span>
        <span>
          {data ? (
            <>
              Demo today · <time dateTime={data.demo_today.date}>{data.demo_today.date}</time> · sol{" "}
              <span className="font-mono">{data.demo_today.sol}</span>
            </>
          ) : (
            "Reading acquired observation day…"
          )}
        </span>
      </div>
      <main id="hb-content" className="hb-content" aria-busy={loading} tabIndex={-1}>
        {page === "overview" ? (
          <div className="hb-workspace">
            <ReferencePanes
              data={data}
              base={base}
              generation={generation}
              onExperiments={() => navigate("experiments")}
            />
            <section
              id="hb-telemetry-pane"
              className="hb-telemetry-pane"
              aria-labelledby="hb-telemetry-title"
            >
              <header className="hb-telemetry-heading">
                <h2 id="hb-telemetry-title">Archive telemetry</h2>
                <span>Jezero weather · Gale radiation proxy</span>
                <Button
                  variant="outline"
                  className="hb-reference-button"
                  aria-label="Reference details"
                  onClick={() => setReferenceOpen(true)}
                >
                  Reference
                </Button>
                <span className="hb-telemetry-window">
                  {data
                    ? `${clockLabel(data.coverage.from_utc_ms)}–${clockLabel(data.coverage.to_utc_ms)} UTC*`
                    : "No data substituted"}
                </span>
              </header>
              <div className="hb-compact-readouts">
                {data
                  ? data.metrics.map((m) => (
                      <MetricCard
                        key={m.id}
                        metric={m}
                        selected={m.id === active}
                        onSelect={() => setActive(m.id)}
                        revealKey={generation}
                      />
                    ))
                  : PLACEHOLDERS.map((m) => (
                      <div key={m.id} className="hb-metric hb-pending">
                        <span>{m.title}</span>
                        <Readout value={null} decimals={1} unit={m.unit} revealKey={0} />
                      </div>
                    ))}
              </div>
              <div className="hb-charts">
                {data
                  ? data.metrics.map((m) => (
                      <ObservationPlot
                        key={m.id}
                        metric={m}
                        from={data.coverage.from_utc_ms}
                        to={data.coverage.to_utc_ms}
                        revealKey={generation}
                        compact
                        onExpand={() => setInspect(m.id)}
                      />
                    ))
                  : PLACEHOLDERS.map((m) => (
                      <section key={m.id} className="hb-trend hb-pending">
                        <header className="hb-panel-heading">
                          <h2>{m.title}</h2>
                        </header>
                        <Readout value={null} decimals={1} unit={m.unit} revealKey={0} />
                        <p className="hb-plot-context">{m.source}</p>
                        <p className="hb-awaiting-plot">
                          {error ? "Archive unavailable" : "Acquiring observations…"}
                        </p>
                      </section>
                    ))}
              </div>
              <div className="hb-selected-chart">
                {data && metric && (
                  <ObservationPlot
                    key={metric.id}
                    metric={metric}
                    from={data.coverage.from_utc_ms}
                    to={data.coverage.to_utc_ms}
                    revealKey={generation}
                    compact
                    showReadout={false}
                    onExpand={() => setInspect(metric.id)}
                  />
                )}
              </div>
            </section>
          </div>
        ) : data ? (
          <ExperimentLog experiments={data.experiments} today={data.demo_today.sol} />
        ) : (
          <div className="hb-empty">
            {error
              ? "Experiment archive unavailable. Retry with Reload below."
              : "Reading archived experiments…"}
          </div>
        )}
      </main>
      <footer className="hb-status">
        <div className="hb-status-metrics">
          <span role="status" aria-live="polite">
            {error ? (
              <>
                <TriangleAlert size={16} aria-hidden />
                {data ? "Stale archive view" : "Archive unavailable"}
              </>
            ) : loading ? (
              <>
                <Database size={16} aria-hidden />
                Reading archive…
              </>
            ) : (
              <>
                <Check size={16} aria-hidden />
                Archive connected
              </>
            )}
          </span>
          <span className="hb-status-time">
            {data ? (
              <>
                <span className="font-mono">
                  {data.demo_today.date} {clockLabel(data.demo_today.utc_ms)}
                </span>{" "}
                UTC* · archive
              </>
            ) : (
              "No mission session required"
            )}
          </span>
          <span className="hb-status-readonly">Read-only · NASA archive</span>
        </div>
        <div className="hb-status-message">
          <span role={error ? "alert" : undefined}>
            {error
              ? `${error}. ${data ? "Previous archive values are marked stale." : "No measurements have been substituted."} Use Reload to retry.`
              : "Reference data only. Simulations stay on the map."}
          </span>
          <Button
            variant="ghost"
            aria-label="Reload archive data"
            disabled={loading}
            onClick={reload}
          >
            <RefreshCw size={16} aria-hidden />
            Reload
          </Button>
          <span className="hb-status-hint">[1] Overview · [2] Experiments</span>
        </div>
      </footer>
      <ObservationInspector
        metric={data?.metrics.find((m) => m.id === inspect) ?? null}
        data={data}
        onClose={() => setInspect(null)}
        generation={generation}
      />
      <ReferenceInspector
        open={referenceOpen}
        onClose={() => setReferenceOpen(false)}
        data={data}
        base={base}
        generation={generation}
        onExperiments={() => navigate("experiments")}
      />
      <DebugMenu
        page="Mission console"
        readSections={() => [
          {
            title: "Archive",
            rows: [
              { label: "Page", value: page },
              {
                label: "Connection",
                value: loading ? "Loading" : error ? (data ? "Stale" : "Unavailable") : "Connected",
              },
              { label: "Release", value: data?.release_id ?? "Unavailable" },
              { label: "Archive error", value: error || "None" },
              { label: "Reference date", value: data?.demo_today.date ?? "Unavailable" },
              { label: "Reference sol", value: data?.demo_today.sol ?? "Unavailable" },
              { label: "Experiments", value: data?.experiments.length ?? "Unavailable" },
            ],
          },
          {
            title: "Observations",
            rows: data?.metrics.map((metric) => ({
              label: metric.title,
              value: `${metric.status} · ${metric.points.filter((point) => point.value !== null && Number.isFinite(point.value) && point.count > 0).length}/${metric.points.length} valid samples · ${metric.cadence_s} s cadence`,
            })) ?? [{ label: "Metrics", value: "Unavailable" }],
          },
        ]}
      />
    </div>
  );
}
