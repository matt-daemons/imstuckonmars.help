"use client";

import type { Map as MapLibreMap } from "maplibre-gl";

import { DriveControls, SamplingField } from "@/components/map/drive-controls";
import { fitPoints, focusHomebase } from "@/components/route/camera";
import type { MissionType } from "@/components/route/route-plan";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { RadioGroup } from "@/components/ui/radio-group";
import type { LngLat } from "@/lib/mars/types";

import { ChoiceCard } from "./choice-card";

/** Step 01: what kind of mission, and for a drive + walk, its power and time at the site. */
export function MissionStep({ map, base }: { map: MapLibreMap | null; base: LngLat }) {
  const { inputs, dispatch, destinations } = useRoutePlan();
  const { mission, power, samplingMin } = inputs;

  // A mission starts at the base with no destination: step 02 is where the operator picks one.
  function chooseMission(next: MissionType) {
    dispatch({ type: "setMission", mission: next, start: base });
    if (next === "drive-walk") fitPoints(map, [base, ...destinations.map((site) => site.center)]);
    else focusHomebase(map, base);
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Mission"
        value={mission}
        // Safe cast: the only values are the two cards below.
        onValueChange={(value) => chooseMission(value as MissionType)}
      >
        <ChoiceCard value="walking" title="Walk from the base">
          On foot from the habitat and back.
        </ChoiceCard>
        <ChoiceCard value="drive-walk" title="Drive + walk to a site">
          By rover to a water-ice site, then on foot from where the rover parks.
        </ChoiceCard>
      </RadioGroup>
      {mission === "drive-walk" ? (
        <DriveControls
          power={power}
          onPower={(next) => dispatch({ type: "setPower", power: next })}
          samplingMin={samplingMin}
          onSamplingMin={(minutes) => dispatch({ type: "setSampling", minutes })}
        />
      ) : (
        <SamplingField
          samplingMin={samplingMin}
          onSamplingMin={(minutes) => dispatch({ type: "setSampling", minutes })}
        />
      )}
    </div>
  );
}
