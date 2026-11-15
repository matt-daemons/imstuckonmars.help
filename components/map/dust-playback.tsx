"use client";

import { useEffect, useState } from "react";
import type { Map } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DUST_FIELDS,
  DUST_RELEASE,
  loadDustSimulation,
  nextDustFrame,
  type DustField,
  type DustSimulation,
} from "@/lib/mars/dust-simulation";
import { hideDustSimulation, showDustSimulation } from "./dust-storm";
import { DustLegendOverlay } from "./dust-legend-overlay";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; simulation: DustSimulation }
  | { kind: "error"; message: string };

const speeds = [
  { value: 2000, label: "1 sol/s" },
  { value: 1000, label: "2 sols/s" },
  { value: 500, label: "4 sols/s" },
];

export function DustPlayback({ map }: { map: Map }) {
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [field, setField] = useState<DustField>("tau_current");
  const [interval, setIntervalMs] = useState(1000);
  const simulation = load.kind === "ready" ? load.simulation : null;
  const count = simulation?.manifest.time.elapsedSols.length ?? 0;

  useEffect(() => {
    if (attempt === 0) return;
    const controller = new AbortController();
    setLoad({ kind: "loading" });
    loadDustSimulation(controller.signal).then(
      (simulation) => {
        if (!controller.signal.aborted) setLoad({ kind: "ready", simulation });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setLoad({
            kind: "error",
            message: error instanceof Error ? error.message : "Dust download failed. Retry.",
          });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!playing || !visible || !count) return;
    const timer = window.setInterval(
      () => setFrame((current) => nextDustFrame(current, count)),
      interval,
    );
    return () => window.clearInterval(timer);
  }, [playing, visible, count, interval]);

  useEffect(() => {
    if (count && frame === count - 1) setPlaying(false);
  }, [frame, count]);
  useEffect(() => {
    if (simulation && visible) showDustSimulation(map, simulation, frame, field);
    else hideDustSimulation(map);
  }, [map, simulation, visible, frame, field]);
  useEffect(() => () => hideDustSimulation(map), [map]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  function overview() {
    map.flyTo({ center: [0, 0], zoom: 1.5, pitch: 0, bearing: 0, duration: 1500 });
  }

  return (
    <section className="space-y-3 border-t pt-3" aria-label="NASA dust simulation">
      <h3 className="font-heading">2018 global dust storm</h3>
      <p className="border-l-2 border-info pl-2 text-sm">
        NASA Ames model simulation · not observed or live weather
      </p>
      {load.kind !== "ready" ? (
        <>
          <p className="text-sm">Global 2° grid. Download: 4 MB. Playback samples every 2 sols.</p>
          <Button
            size="sm"
            variant="outline"
            disabled={load.kind === "loading"}
            onClick={() => {
              setAttempt((value) => value + 1);
              overview();
            }}
          >
            {load.kind === "loading"
              ? "Loading simulation…"
              : load.kind === "error"
                ? "Retry simulation"
                : "Load NASA simulation"}
          </Button>
          <p role="status">
            {load.kind === "error"
              ? load.message
              : load.kind === "loading"
                ? "Downloading and verifying NASA model frames."
                : ""}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-pressed={visible}
              onClick={() => {
                setVisible(!visible);
                setPlaying(false);
              }}
            >
              {visible ? "Hide dust" : "Show dust"}
            </Button>
            <Button size="sm" variant="outline" onClick={overview}>
              View global storm
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Dust field">
            <Button
              size="sm"
              variant="outline"
              aria-pressed={field === "tau_current"}
              className={field === "tau_current" ? "border-info bg-info/15" : undefined}
              onClick={() => setField("tau_current")}
            >
              Opacity
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={field === "dst_mass_source"}
              className={field === "dst_mass_source" ? "border-info bg-info/15" : undefined}
              onClick={() => setField("dst_mass_source")}
            >
              Surface lifting
            </Button>
          </div>
          {visible && <DustLegendOverlay map={map} field={field} />}
          <p className="font-mono">
            Global mean:{" "}
            {load.simulation.manifest.fields[field === "tau_current" ? 0 : 1].globalMean[
              frame
            ].toPrecision(3)}{" "}
            {DUST_FIELDS[field].unit}
          </p>
          <p id="dust-time-label" className="font-mono">
            Elapsed: {load.simulation.manifest.time.elapsedSols[frame]} / 254 sols
          </p>
          <Slider
            min={0}
            max={count - 1}
            step={1}
            value={frame}
            aria-labelledby="dust-time-label"
            getAriaLabel={() => "Simulation frame"}
            aria-valuetext={`${frame * 2} sols elapsed`}
            onValueChange={(value) => {
              setPlaying(false);
              setFrame(typeof value === "number" ? value : value[0]);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!visible}
              onClick={() => {
                if (frame === count - 1) setFrame(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlaying(false);
                setFrame(0);
              }}
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlaying(false);
                setFrame(nextDustFrame(frame, count));
              }}
              disabled={frame === count - 1}
            >
              Next frame
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span id="dust-speed-label">Playback speed</span>
            <Select
              items={speeds}
              value={interval}
              onValueChange={(value) => {
                if (value !== null) setIntervalMs(value);
              }}
            >
              <SelectTrigger aria-labelledby="dust-speed-label" className="w-32 min-w-0 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {speeds.map((speed) => (
                  <SelectItem key={speed.value} value={speed.value}>
                    {speed.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <p role="status" className="text-sm">
            {!visible
              ? "Dust hidden"
              : playing
                ? "Playing NASA simulation"
                : frame === count - 1
                  ? "End of simulation"
                  : "Paused"}
          </p>
          <p className="text-sm text-muted-foreground">
            No wind trajectories in this subset. Polar caps above 80° are not displayed. Global
            means include those caps.
          </p>
          <a
            className="text-sm underline"
            href={`${DUST_RELEASE}manifest.json`}
            target="_blank"
            rel="noreferrer"
          >
            Source, processing and limitations
          </a>
        </>
      )}
    </section>
  );
}
