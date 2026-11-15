"use client";

import { ArrowDown, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { MapPanel } from "@/components/map/map-panel";
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
      pending={pending}
      error={error}
      onToggle={async () => {
        setPending(true);
        setError(null);
        try {
          if (lara.snapshot?.clock.mode === "playing") await lara.command({ type: "pause" });
          else {
            await lara.command({ type: "speed", speed: 20 });
            await lara.command({ type: "play" });
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
  pending,
  error,
  onToggle,
  defaultOpen = true,
}: {
  snapshot: Lara["snapshot"];
  ageSeconds: number | null;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
  defaultOpen?: boolean;
}) {
  const stale = ageSeconds === null || ageSeconds > (POLL_MS * 3) / 1000;
  const dose = s?.observed.radiation.observation?.dose_rate_e_ugy_day;
  const playing = s?.clock.mode === "playing";
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
              : playing
                ? `Simulation running · ${s.clock.speed}×`
                : "Simulation paused"}
          </p>
          <dl className={`grid grid-cols-2 gap-3 ${stale ? "text-muted-foreground" : ""}`}>
            <Readout
              label="Mission elapsed"
              value={fmtMin(s.clock.position_s)}
              note={`of ${fmtMin(s.config.duration_s)} · min:s`}
            />
            <Readout
              label="Suit O₂"
              value={`${Math.round(s.state.oxygen.eva.remaining_g)} g`}
              note={`Reserve ${s.config.oxygen.eva.reserve_g} g`}
              belowReserve={s.state.oxygen.eva.remaining_g < s.config.oxygen.eva.reserve_g}
            />
            <Readout
              label="Suit battery"
              value={`${Math.round(s.state.battery.eva.remaining_wh)} Wh`}
              note={`Reserve ${s.config.battery.eva.reserve_wh} Wh`}
              belowReserve={s.state.battery.eva.remaining_wh < s.config.battery.eva.reserve_wh}
            />
            <Readout
              label="Dose rate"
              value={dose == null ? "No data" : `${(dose / 24).toFixed(1)} µGy/h`}
              note="Gale proxy · archived"
            />
          </dl>
          <Button size="default" variant="outline" disabled={pending || stale} onClick={onToggle}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? "Pause simulation" : "Run simulation at 20×"}
          </Button>
          <p role="status">{pending ? "Applying simulation command…" : ""}</p>
          {error && <p role="alert">{error}</p>}
        </>
      ) : (
        <p role="status" className="text-sm">
          Mission data unavailable.
        </p>
      )}
      <p className="text-muted-foreground">
        Resources are simulated. MOXIE, MEDA and RAD are archived NASA data, not live measurements.
        Dose rate is a distant Gale proxy, not crew exposure.
      </p>
    </MapPanel>
  );
}
