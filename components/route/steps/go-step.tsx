"use client";

import {
  ArrowDownIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useId, type ReactNode } from "react";

import { formatNumber } from "@/components/map/drive-result";
import { activityText, formatElapsed, SIMULATED_LABEL } from "@/components/route/expedition";
import { SPEEDS, useExpedition, type Speed } from "@/components/route/expedition-provider";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from "@/components/ui/meter";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ROVER_RULES } from "@/lib/flight-rules/rover-rules";
import { PLAYBACK_SECONDS_PER_PART, type ExpeditionTimeline } from "@/lib/mars/expedition";
import { cn } from "@/lib/utils";

const SPEED_LABELS: Record<Speed, string> = { 0.5: "½×", 1: "1×", 2: "2×", 4: "4×" };
const BATTERY_CAUTION_PERCENT = ROVER_RULES.battery.caution_below_percent;
const BATTERY_NO_GO_PERCENT = ROVER_RULES.battery.no_go_below_percent;

type Level = "normal" | "caution" | "no_go";
const LEVEL_STYLES: Record<Level, { bar: string; text: string; label?: string }> = {
  normal: { bar: "bg-primary", text: "" },
  caution: { bar: "bg-warning", text: "text-warning-foreground", label: "Below caution level" },
  no_go: { bar: "bg-destructive", text: "text-destructive-foreground", label: "Below reserve" },
};

/** Step ④: plays the planned trip back as a simulated expedition, with its resources against reserve. */
export function GoStep() {
  const expedition = useExpedition();
  const { timeline, state } = expedition;
  const reason = useUnavailableReason();
  return (
    <div className="flex flex-col gap-3 border border-dashed border-info p-3">
      <Alert variant="info">
        <InfoIcon aria-hidden />
        <AlertTitle>Simulation</AlertTitle>
        <AlertDescription>{SIMULATED_LABEL}</AlertDescription>
      </Alert>
      {reason || !timeline || !state ? (
        <>
          <p role="status">{reason ?? "Planning the trip…"}</p>
          <PlaybackControls disabled />
        </>
      ) : (
        <Playing timeline={timeline} />
      )}
    </div>
  );
}

/** Why there is nothing to play, or null when there is a trip. */
function useUnavailableReason(): string | null {
  const { inputs, journey, destination } = useRoutePlan();
  const { followed } = useExpedition();
  if (inputs.mission !== "drive-walk") {
    return "Playback follows a drive + walk trip. Choose Drive + walk to a site in step ① Mission.";
  }
  if (!destination) return "No destination yet. Choose a destination site in step ② Where.";
  if (journey.driveFailed || journey.siteFailed) {
    return "Terrain did not load, so no trip can be played. Reload the page to retry.";
  }
  if (!followed.plan) {
    return followed.following === "shortest" ? "Planning the shortest route…" : null;
  }
  if (followed.plan.status !== "ok") {
    return "No trip to play: this route could not be planned. Step ③ Check says why.";
  }
  return null;
}

function Playing({ timeline }: { timeline: ExpeditionTimeline }) {
  const { state, playback, followed } = useExpedition();
  if (!state) return null;
  const percent = (state.elapsedMin / timeline.totalMin) * 100;
  return (
    <>
      {followed.isFallback ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Following the safest route</AlertTitle>
          <AlertDescription>
            The shortest route could not be planned, so the playback follows the safest one.
          </AlertDescription>
        </Alert>
      ) : (
        <p>
          Following the <strong>{followed.following}</strong> route.
        </p>
      )}
      {/* Announces the phase, which changes a few times per trip; the numbers below change every frame. */}
      <p role="status" className="font-heading font-medium">
        Sol <span className="font-mono">{state.sol}</span> · {activityText(state, playback)}
      </p>
      <PlaybackControls />
      <Progress value={percent} aria-valuetext={`${Math.round(percent)} % of the trip`}>
        <div className="flex items-baseline justify-between gap-2">
          <ProgressLabel>Elapsed</ProgressLabel>
          <span className="font-mono text-sm tabular-nums">
            {formatElapsed(state.elapsedMin)} of {formatElapsed(timeline.totalMin)}
          </span>
        </div>
        <ProgressTrack>
          <ProgressIndicator className="transition-none" />
        </ProgressTrack>
        <p className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>Mission time, sols/h:min</span>
          <span className="font-mono tabular-nums">
            {formatNumber(state.distanceDoneKm, 1)} of {formatNumber(timeline.distanceTotalKm, 1)}{" "}
            km
          </span>
        </p>
      </Progress>
      <ResourceMeter
        label="Rover battery"
        value={state.batteryWh / 1000}
        max={timeline.battery.capacityWh / 1000}
        reserve={timeline.battery.reserveWh / 1000}
        unit="kWh"
        digits={1}
        level={batteryLevel((state.batteryWh / timeline.battery.capacityWh) * 100)}
      />
      <ResourceMeter
        label="Suit oxygen, main supply"
        value={state.suitMin}
        max={timeline.suit.primaryMin}
        reserve={timeline.suit.reserveMin}
        unit="min"
        digits={0}
        level={state.suitMin < timeline.suit.reserveMin ? "no_go" : "normal"}
        note={
          state.mode === "walk"
            ? "Suited: draining minute for minute."
            : "In the rover: suits not in use."
        }
      />
      <LimitingResource timeline={timeline} />
      <p className="text-xs text-muted-foreground">
        Rover energy from the plan&apos;s model (mass, slope, ground, life support). Assumed: the
        battery recharges to full while parked overnight, and the parked rover&apos;s draw during
        the walk is left out. Suits start the walk full and drain only while suited.
      </p>
    </>
  );
}

function PlaybackControls({ disabled = false }: { disabled?: boolean }) {
  const { playback, play, pause, reset, speed, setSpeed } = useExpedition();
  const speedLabel = useId();
  const isPlaying = playback === "playing";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={isPlaying ? pause : play}>
          {isPlaying ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button variant="outline" disabled={disabled || playback === "idle"} onClick={reset}>
          <RotateCcwIcon aria-hidden />
          Reset
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={speedLabel} className="text-sm">
          Speed
        </span>
        <ToggleGroup
          aria-labelledby={speedLabel}
          variant="outline"
          size="sm"
          disabled={disabled}
          value={[String(speed)]}
          // Pressing the pressed item empties the value; keep the current speed then.
          onValueChange={(value) => value[0] && setSpeed(Number(value[0]) as Speed)}
        >
          {SPEEDS.map((choice) => (
            <ToggleGroupItem key={choice} value={String(choice)} className="font-mono">
              {SPEED_LABELS[choice]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p className="text-xs text-muted-foreground">
        At 1×, the drive out, the walk and the drive back each play in {PLAYBACK_SECONDS_PER_PART}{" "}
        s.
      </p>
    </div>
  );
}

function ResourceMeter({
  label,
  value,
  max,
  reserve,
  unit,
  digits,
  level,
  note,
}: {
  label: string;
  value: number;
  max: number;
  reserve: number;
  unit: string;
  digits: number;
  level: Level;
  note?: ReactNode;
}) {
  const style = LEVEL_STYLES[level];
  const reservePercent = (reserve / max) * 100;
  const shown = Math.min(Math.max(value, 0), max);
  return (
    <Meter value={shown} max={max} aria-valuetext={`${formatNumber(value, digits)} ${unit}`}>
      <div className="flex items-baseline justify-between gap-2">
        <MeterLabel>{label}</MeterLabel>
        <span className={cn("flex items-center gap-1 font-mono text-sm tabular-nums", style.text)}>
          {style.label && <LevelIcon Icon={ArrowDownIcon} label={style.label} />}
          {formatNumber(value, digits)} {unit}
        </span>
      </div>
      <div className="relative">
        <MeterTrack>
          <MeterIndicator className={cn("transition-none", style.bar)} />
        </MeterTrack>
        {/* The reserve, as a tick on the track; the text below gives the number. */}
        <span
          aria-hidden
          className="absolute -top-1 -bottom-1 w-0.5 bg-foreground"
          style={{ left: `${reservePercent}%` }}
        />
      </div>
      <p className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{note}</span>
        <span className="font-mono tabular-nums">
          {formatNumber(value - reserve, digits)} {unit} above the {formatNumber(reserve, digits)}{" "}
          {unit} reserve
        </span>
      </p>
    </Meter>
  );
}

function LevelIcon({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return <Icon role="img" aria-label={label} className="size-3.5" />;
}

function LimitingResource({ timeline }: { timeline: ExpeditionTimeline }) {
  const isBattery = timeline.limiting === "rover_battery";
  const lowest = isBattery
    ? `${formatNumber(timeline.battery.lowestWh / 1000, 1)} kWh, ${formatNumber((timeline.battery.lowestWh - timeline.battery.reserveWh) / 1000, 1)} kWh above the reserve`
    : `${formatNumber(timeline.suit.lowestMin, 0)} min, ${formatNumber(timeline.suit.lowestMin - timeline.suit.reserveMin, 0)} min above the reserve`;
  return (
    <p>
      <span className="text-muted-foreground">Limiting resource: </span>
      {isBattery ? "rover battery" : "suit oxygen"}. Lowest on this trip: {lowest}.
    </p>
  );
}

function batteryLevel(percent: number): Level {
  if (percent < BATTERY_NO_GO_PERCENT) return "no_go";
  if (percent < BATTERY_CAUTION_PERCENT) return "caution";
  return "normal";
}
