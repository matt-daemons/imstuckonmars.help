"use client";

import { useId } from "react";
import { Info } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  FAKE_LAST_FRAME,
  FAKE_LAYERS,
  FAKE_SENSORS,
  fakeReading,
  fakeTimeLabel,
} from "@/lib/mars/fake-sensors";
import { formatNumber } from "@/lib/mission/format";
import type { FakeSensorMode } from "./use-fake-sensor-mode";
import { FAKE_COLORS } from "./fake-sensor-layers";

export function FakeDataToggle({ mode }: { mode: FakeSensorMode }) {
  return (
    <section className="debug-section">
      <label className="flex items-center justify-between gap-4">
        <span>Fake data mode</span>
        <Switch
          checked={mode.state.enabled}
          onCheckedChange={(enabled) => mode.dispatch({ type: "enable", enabled })}
          aria-label="Fake data mode"
        />
      </label>
      <p className="mt-2 text-sm text-muted-foreground">
        Fictional future sensors across Mars. Separate from NASA data and mission calculations.
        Resets off on reload.
      </p>
    </section>
  );
}

export function FakeSensorControls({
  mode,
  map,
}: {
  mode: FakeSensorMode;
  map: MapLibreMap | null;
}) {
  const id = useId();
  const { state, dispatch } = mode;
  if (!state.enabled) return null;
  const sensor = FAKE_SENSORS.find((sensor) => sensor.id === state.selected);
  const reading = sensor ? fakeReading(sensor, state.frame) : null;
  return (
    <section aria-label="Fake sensor layers" className="mt-4 space-y-3 border-t pt-3">
      <h3 className="font-heading">Fake data · future sensors</h3>
      <p className="text-xs text-muted-foreground">
        {FAKE_SENSORS.length} fictional stations · 7 SOLs · one reading per 10 seconds. Select a
        sensor to inspect its values.
      </p>
      <p id={id} className="font-mono">
        {fakeTimeLabel(state.frame)}
      </p>
      <Slider
        min={0}
        max={FAKE_LAST_FRAME}
        step={1}
        value={state.frame}
        aria-labelledby={id}
        getAriaLabel={() => "Fake sensor time"}
        aria-valuetext={fakeTimeLabel(state.frame)}
        onValueChange={(value) =>
          dispatch({ type: "frame", frame: typeof value === "number" ? value : value[0] })
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch({ type: "play", playing: !state.playing })}
        >
          {state.playing ? "Pause fake playback" : "Play fake playback"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: "frame", frame: 0 })}>
          Reset time
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            map?.flyTo({
              center: [0, 0],
              zoom: 1.5,
              pitch: 0,
              duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1000,
            })
          }
        >
          View global sensors
        </Button>
      </div>
      <label className="flex items-center justify-between gap-2 text-sm">
        Playback speed
        <select
          className="border bg-background p-1 font-mono"
          value={state.speed}
          onChange={(event) => dispatch({ type: "speed", speed: Number(event.target.value) })}
        >
          <option value={60}>60×</option>
          <option value={3600}>3600×</option>
          <option value={21600}>21,600×</option>
        </select>
      </label>
      <ul className="space-y-3">
        {FAKE_LAYERS.map((layer) => (
          <li key={layer.id}>
            <label className="flex items-center justify-between gap-3">
              <span>{layer.label}</span>
              <Switch
                checked={state.visible[layer.id]}
                onCheckedChange={(visible) => dispatch({ type: "layer", layer: layer.id, visible })}
                aria-label={`Show fake ${layer.label.toLowerCase()}`}
              />
            </label>
          </li>
        ))}
      </ul>
      <label className="block space-y-1 text-sm">
        <span>Inspect fake sensor</span>
        <select
          className="w-full border bg-background p-2 font-mono"
          value={state.selected ?? ""}
          onChange={(event) => dispatch({ type: "select", id: event.target.value || null })}
        >
          <option value="">Select a station</option>
          {FAKE_SENSORS.map((station) => (
            <option key={station.id} value={station.id}>
              {station.id} · {formatNumber(station.position[1], 1)}°,{" "}
              {formatNumber(station.position[0], 1)}°
            </option>
          ))}
        </select>
      </label>
      {reading && (
        <section className="space-y-2 border-t pt-3" aria-label="Selected fake sensor">
          <h4 className="font-mono">{reading.sensor.id} · synthetic</h4>
          <p className="font-mono text-xs">
            {formatNumber(reading.sensor.position[1], 1)}° latitude ·{" "}
            {formatNumber(reading.sensor.position[0], 1)}° east
          </p>
          <dl className="space-y-1 text-sm">
            {FAKE_LAYERS.filter((layer) => layer.id !== "sensors" && layer.id !== "wind").map(
              (layer) => (
                <div key={layer.id} className="flex justify-between gap-2">
                  <dt>{layer.label}</dt>
                  <dd className="font-mono">
                    {formatNumber(reading[layer.id], 1)} {layer.unit}
                  </dd>
                </div>
              ),
            )}
          </dl>
          <p className="font-mono text-sm">
            Wind {formatNumber(reading.windSpeed, 1)} m/s toward{" "}
            {formatNumber(reading.windBearing, 0)}° · storm index {formatNumber(reading.storm, 2)}
          </p>
        </section>
      )}
    </section>
  );
}

export function FakeSensorLegend({ mode }: { mode: FakeSensorMode }) {
  if (!mode.state.enabled) return null;
  const { state } = mode;
  return (
    <aside
      aria-label="Fake data legend"
      className="fake-sensor-legend absolute top-24 right-4 max-h-[45svh] w-64 max-w-[calc(100%-2rem)] overflow-y-auto border border-info bg-background/90 p-3 text-sm backdrop-blur-md"
    >
      <h2 className="flex items-center gap-2 font-heading">
        <Info className="size-4" aria-hidden />
        Fake data mode
      </h2>
      <p className="text-xs">Fictional future sensors · not NASA observations</p>
      <p className="mt-1 font-mono">{fakeTimeLabel(state.frame)}</p>
      <ul className="mt-2 space-y-2">
        {FAKE_LAYERS.filter((layer) => state.visible[layer.id]).map((layer) => (
          <li key={layer.id}>
            <span>{layer.label}</span>
            {layer.id === "sensors" ? (
              <p className="text-xs text-muted-foreground">White center dots · select to inspect</p>
            ) : layer.id === "wind" ? (
              <p className="text-xs text-muted-foreground">
                Arrow points toward travel · size: 0–35 m/s · orange halo: storm index 0–1
              </p>
            ) : (
              <>
                <div
                  aria-hidden
                  className="mt-1 h-1.5"
                  style={{ background: `linear-gradient(to right, ${FAKE_COLORS.join(",")})` }}
                />
                <p className="flex justify-between font-mono text-xs">
                  <span>
                    {formatNumber(layer.low)} {layer.unit}
                  </span>
                  <span>
                    {formatNumber(layer.high)} {layer.unit}
                  </span>
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      {!FAKE_LAYERS.some((layer) => state.visible[layer.id]) && (
        <p className="mt-2">All fake layers hidden.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Dot positions around a station: ground upper left, air upper right, hardness right, pressure
        lower right, radiation lower left, humidity left. These are point samples, not a continuous
        global field.
      </p>
    </aside>
  );
}
