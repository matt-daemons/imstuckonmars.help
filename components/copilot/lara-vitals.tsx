"use client";

import { ArrowDown, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { missionTime } from "@/components/expedition/present";
import { MapPanel } from "@/components/map/map-panel";
import { formatDuration, formatNumber } from "@/lib/mission/format";
import { Button } from "@/components/ui/button";
import { useLaraContext } from "./lara-context";
import { POLL_MS } from "./use-lara";
import type { Lara } from "./lara-context";
import { useIsMobile } from "@/hooks/use-media-query";
import "./lara-ui.css";

export const fmtMin = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function Readout({
  label,
  value,
  note,
  belowReserve = false,
}: {
  label: string;
  value: string;
  note: string;
  belowReserve?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt>{label}</dt>
      <dd className={`font-mono tabular-nums ${belowReserve ? "text-destructive-foreground" : ""}`}>
        {belowReserve && <ArrowDown aria-hidden className="mr-1 inline size-4" />}
        {value}
      </dd>
      <dd className="text-muted-foreground">
        {belowReserve ? "Below reserve · " : ""}
        {note}
      </dd>
    </div>
  );
}

/** At (or stopped before) its configured end, play is refused until the run is restarted. */
export function vitalsFinished(s: Lara["snapshot"]): boolean {
  return Boolean(
    s && (s.clock.mode === "ended" || s.clock.position_s >= s.config.duration_s - 1e-6),
  );
}

const RESTART_LABEL = "Restart simulation";

export function LaraVitals() {
  const lara = useLaraContext();
  const mobile = useIsMobile();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(timer);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <LaraVitalsView
      key={mobile ? "compact" : "full"}
      defaultOpen={!mobile}
      snapshot={lara.snapshot}
      ageSeconds={lara.polledAt ? Math.max(0, Math.floor((now - lara.polledAt) / 1000)) : null}
      stale={lara.readingsStale}
      pending={pending}
      error={error}
      onToggle={async () => {
        setPending(true);
        setError(null);
        try {
          if (vitalsFinished(lara.snapshot)) {
            await lara.command({ type: "reset" }, RESTART_LABEL);
          } else if (lara.snapshot?.clock.mode === "playing")
            await lara.command({ type: "pause" }, "Pause simulation");
          else {
            await lara.command({ type: "speed", speed: 20 }, "Simulation speed 20×");
            await lara.command({ type: "play" }, "Run simulation");
          }
        } catch (cause) {
          setError(
            `${cause instanceof Error ? cause.message : "Simulation command failed"}. Wait for current readings, then try again.`,
          );
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

export function LaraVitalsView({
  snapshot: s,
  ageSeconds,
  stale = ageSeconds === null || ageSeconds > (POLL_MS * 3) / 1000,
  pending,
  error,
  onToggle,
  defaultOpen = true,
}: {
  snapshot: Lara["snapshot"];
  ageSeconds: number | null;
  stale?: boolean;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
  defaultOpen?: boolean;
}) {
  const dose = s?.observed.radiation.observation?.dose_rate_e_ugy_day;
  const finished = vitalsFinished(s);
  const playing = !finished && s?.clock.mode === "playing";
  // Before an expedition is loaded the session is the base-only demo, not an expedition.
  const base = !s?.config.route;
  return (
    <MapPanel
      title="Vitals and mission details"
      className="lara-vitals"
      bodyClassName="space-y-3 pt-3"
      defaultOpen={defaultOpen}
    >
      {s ? (
        <>
          <p role="status">
            {stale
              ? `Mission readings stale · ${ageSeconds ?? "Unknown"} s old · reconnecting`
              : finished
                ? "Simulation complete"
                : playing
                  ? `Simulation running · ${s.clock.speed}×`
                  : "Simulation paused"}
          </p>
          <dl className={`grid grid-cols-2 gap-3 ${stale ? "text-muted-foreground" : ""}`}>
            <Readout
              label="Mission elapsed"
              value={missionTime(s.clock.position_s)}
              note={`of ${formatDuration(s.config.duration_s)} · hh:mm:ss`}
            />
            <Readout
              label="Suit O₂"
              value={`${formatNumber(s.state.oxygen.eva.remaining_g)} g`}
              note={`Reserve ${s.config.oxygen.eva.reserve_g} g`}
              belowReserve={s.state.oxygen.eva.remaining_g < s.config.oxygen.eva.reserve_g}
            />
            <Readout
              label="Suit battery"
              value={`${formatNumber(s.state.battery.eva.remaining_wh)} Wh`}
              note={`Reserve ${s.config.battery.eva.reserve_wh} Wh`}
              belowReserve={s.state.battery.eva.remaining_wh < s.config.battery.eva.reserve_wh}
            />
            <Readout
              label="Dose rate"
              value={dose == null ? "No data" : `${formatNumber(dose / 24, 1)} µGy/h`}
              note="Gale proxy · archived"
            />
          </dl>
          <Button size="default" variant="outline" disabled={pending || stale} onClick={onToggle}>
            {finished ? (
              <RotateCcw aria-hidden />
            ) : playing ? (
              <Pause aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
            {finished
              ? RESTART_LABEL
              : playing
                ? "Pause simulation"
                : base
                  ? "Run base simulation at 20×"
                  : "Run simulation at 20×"}
          </Button>
          <p role="status">{pending ? "Applying simulation command…" : ""}</p>
          {error && <p role="alert">{error}</p>}
        </>
      ) : (
        <p role="status" className="text-sm">
          Mission data unavailable: no reading received yet. If this message stays, reload the page.
        </p>
      )}
      <p className="text-muted-foreground">
        Resources are simulated. MOXIE, MEDA and RAD are archived NASA data, not live measurements.
        Dose rate is a proxy from Curiosity at Gale crater, about 3,900 km away, not crew exposure.
        No rover has operated in Arcadia, so it is not ground-truthed for the base.
      </p>
    </MapPanel>
  );
}
