"use client";

import { Button } from "@/components/ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@/components/ui/number-field";

import { formatLocalHour } from "../conditions";
import { useConditions } from "../conditions-provider";

const percent = (hour: number) => `${(hour / 24) * 100}%`;

/**
 * Step 03's simulation time: today's sunrise and sunset at the habitat, the local solar time the
 * verdict uses, and a start hour to set by hand. A set hour runs on with real time from then.
 */
export function SimulationTime() {
  const { simTime, setSimTime, localHour, sun } = useConditions();
  const simulated = simTime !== null;
  const now = formatLocalHour(localHour);
  return (
    <section aria-label="Simulation time" className="flex flex-col gap-2 border p-3 text-xs">
      <p>
        <span className="font-medium">Local solar time</span>{" "}
        <span className="font-mono">{now}</span>{" "}
        <span className="text-muted-foreground">
          {simulated ? "· simulated, runs with real time" : "· real, at the habitat"}
        </span>
      </p>
      {sun ? (
        <>
          <div
            role="img"
            aria-label={`Daylight from ${formatLocalHour(sun.sunrise)} to ${formatLocalHour(sun.sunset)}. Now ${now}.`}
            className="relative h-3 bg-muted"
          >
            <div
              className="absolute inset-y-0 bg-warning/60"
              style={{ left: percent(sun.sunrise), width: percent(sun.sunset - sun.sunrise) }}
            />
            <div
              className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-foreground"
              style={{ left: percent(localHour) }}
            />
          </div>
          <p className="flex justify-between font-mono text-muted-foreground">
            <span>00:00</span>
            <span>Sunrise {formatLocalHour(sun.sunrise)}</span>
            <span>Sunset {formatLocalHour(sun.sunset)}</span>
            <span>24:00</span>
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">The sun does not rise or set this sol.</p>
      )}
      <div className="flex items-end gap-2">
        <NumberField
          size="sm"
          value={simTime?.hour ?? null}
          onValueChange={(hour) =>
            setSimTime(hour === null ? null : { hour, set_at_ms: Date.now() })
          }
          min={0}
          max={23}
          step={1}
          format={{ maximumFractionDigits: 0 }}
          className="flex-1"
        >
          <NumberFieldScrubArea label="Start hour (local solar, 0–23)" />
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput className="text-right" placeholder="Real" />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
        <Button size="sm" variant="outline" disabled={!simulated} onClick={() => setSimTime(null)}>
          Use real time
        </Button>
      </div>
    </section>
  );
}
