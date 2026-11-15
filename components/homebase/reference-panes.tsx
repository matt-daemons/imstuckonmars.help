"use client";

import { ExternalLink, Info } from "lucide-react";
import type { HomebaseData } from "@/lib/homebase/types";
import { HOMEBASE } from "@/lib/homebase/context";
import { formatDuration, formatNumber } from "@/lib/mission/format";
import { ConsolePane } from "./pane";
import { clockLabel } from "./observation-plot";
import { Readout } from "./readout";
import { SurfaceMap } from "./surface-map";

export function ReferencePanes({
  data,
  base = HOMEBASE,
  generation,
  onExperiments,
  section,
}: {
  data: HomebaseData | null;
  base?: typeof HOMEBASE;
  generation: number;
  onExperiments: () => void;
  section?: string;
}) {
  const today = data?.experiments.find((e) => e.sol === data.demo_today.sol);
  const number = (n: number | null | undefined, dp = 2) =>
    n == null ? "No data" : formatNumber(n, dp);
  return (
    <div className="hb-top-grid" data-section={section}>
      <div className="hb-left-stack">
        <ConsolePane
          id={`${section ? "inspect-" : ""}hb-clock-pane`}
          className="hb-clock-pane"
          number="01"
          title="Archive clock"
          detail="Fixed reference"
        >
          <div className="hb-clock-body">
            <span className="hb-muted">Demo today · historical snapshot</span>
            <div className="hb-clock">
              <span>
                {data ? new Date(data.demo_today.utc_ms).toISOString().slice(11, 19) : "··:··:··"}
              </span>
              <span>UTC*</span>
            </div>
            <div className="hb-clock-date">
              <span>
                Sol <b>{data?.demo_today.sol ?? "···"}</b>
              </span>
              <time dateTime={data?.demo_today.date}>
                {data?.demo_today.date ?? "Awaiting archive"}
              </time>
            </div>
            <dl className="hb-clock-window">
              <div>
                <dt>Window*</dt>
                <dd>
                  {data
                    ? `${clockLabel(data.coverage.from_utc_ms)}–${clockLabel(data.coverage.to_utc_ms)} UTC`
                    : "No data"}
                </dd>
              </div>
              <div>
                <dt>Weather cadence</dt>
                <dd>60 s means</dd>
              </div>
            </dl>
            <p className="hb-muted">UTC* approximate · gaps retained.</p>
          </div>
        </ConsolePane>
        <ConsolePane
          id={`${section ? "inspect-" : ""}hb-source-pane`}
          className="hb-source-pane"
          number="04"
          title="Reference sites"
          detail="Not base sensors"
        >
          <dl className="hb-site-list">
            <div>
              <dt>Jezero · MEDA</dt>
              <dd>Weather reference</dd>
            </div>
            <div>
              <dt>Gale · RAD</dt>
              <dd>Radiation proxy</dd>
            </div>
          </dl>
          <p className="hb-source-boundary">
            <Info size={16} aria-hidden />
            Wind / dust not observed.
          </p>
        </ConsolePane>
      </div>
      <ConsolePane
        id={`${section ? "inspect-" : ""}hb-surface-pane`}
        className="hb-surface-pane"
        number="02"
        title="Surface context"
        detail="Arcadia · hypothetical base"
      >
        <div className="hb-orbital-label">
          <span>Orbital image · north up</span>
          <span className="font-mono">Mars 2000</span>
        </div>
        <SurfaceMap base={base} />
        <p className="hb-surface-note">
          Jezero weather and Gale radiation are remote references, not measurements at this base.
          Routes and simulations stay on the map.
        </p>
        <a
          className="hb-context-source"
          href="https://tiles.imstuckonmars.help/mars-v2/arcadia-imagery-provenance.json"
          target="_blank"
          rel="noreferrer"
        >
          Image provenance <ExternalLink size={14} aria-hidden />
        </a>
      </ConsolePane>
      <ConsolePane
        id={`${section ? "inspect-" : ""}hb-moxie-pane`}
        className="hb-moxie-pane"
        number="03"
        title="Oxygen experiment"
        detail={data ? `MOXIE · sol ${data.demo_today.sol}` : "MOXIE archive"}
      >
        <div className="hb-moxie-body">
          <span className="hb-muted">Recorded run output · current-derived</span>
          <Readout value={today?.oxygen_g ?? null} decimals={2} unit="g" revealKey={generation} />
          <dl className="hb-moxie-stats">
            <div>
              <dt>Peak rate</dt>
              <dd>
                {number(today?.peak_rate_g_h)} <span>g/h</span>
              </dd>
            </div>
            <div>
              <dt>Active mean</dt>
              <dd>
                {number(today?.active_mean_g_h)} <span>g/h</span>
              </dd>
            </div>
            <div>
              <dt>Active time</dt>
              <dd>
                {today?.active_seconds == null ? "No data" : formatDuration(today.active_seconds)}
              </dd>
            </div>
            <div>
              <dt>Run energy</dt>
              <dd>
                {number(today?.energy_wh, 1)} <span>Wh</span>
              </dd>
            </div>
          </dl>
          <p className="hb-muted">
            Archived engineering output, not crew supply or verified purity.
          </p>
          <button type="button" className="hb-text-action" onClick={onExperiments}>
            Open experiment log{" "}
            <span className="font-mono">[{data?.experiments.length ?? "··"}] →</span>
          </button>
        </div>
      </ConsolePane>
    </div>
  );
}
