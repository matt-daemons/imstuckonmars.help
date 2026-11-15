"use client";

import { useId, useState } from "react";

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@/components/ui/number-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import type { PowerSource } from "@/lib/mars/driving";
import { marsDistanceM } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import type { SitePoi } from "./scene-panel";

/** The sites, nearest to the base first by straight-line distance. */
export function nearestFirst(sites: SitePoi[], base: LngLat): SitePoi[] {
  return sites.toSorted((a, b) => marsDistanceM(base, a.center) - marsDistanceM(base, b.center));
}

/** Named the way the scene panel names them. */
export function siteLabel(site: SitePoi): string {
  return site.confirmed ? site.title : `${site.title} (unconfirmed)`;
}

/** The power and sampling-time choices of a drive + walk mission. */
export function DriveControls({
  power,
  onPower,
  samplingMin,
  onSamplingMin,
}: {
  power: PowerSource;
  onPower: (power: PowerSource) => void;
  samplingMin: number;
  onSamplingMin: (minutes: number) => void;
}) {
  const powerLabel = useId();
  // What the field shows while typing; the planner only sees committed values.
  const [sampling, setSampling] = useState<number | null>(samplingMin);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span id={powerLabel} className="text-sm font-medium">
          Power
        </span>
        <ToggleGroup
          aria-labelledby={powerLabel}
          variant="outline"
          size="sm"
          value={[power]}
          // Pressing the pressed item empties the value; keep the current source then.
          // Safe cast: the only values are the two items below.
          onValueChange={(value) => value[0] && onPower(value[0] as PowerSource)}
        >
          <ToggleGroupItem value="fission">Fission</ToggleGroupItem>
          <ToggleGroupItem value="solar">Solar</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {/* Replans on commit (blur, Enter, step), not on every keystroke: a long drive takes seconds.
          Sampling can't outlast the suit's main supply. An emptied field commits as 0 min. */}
      <NumberField
        size="sm"
        value={sampling}
        onValueChange={setSampling}
        min={0}
        max={FLIGHT_RULES.suit_supply.primary_minutes}
        onValueCommitted={(minutes) => {
          setSampling(minutes ?? 0);
          onSamplingMin(minutes ?? 0);
        }}
      >
        <NumberFieldScrubArea label="Sampling time (min)" />
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput className="text-right" />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
    </div>
  );
}
