"use client";

import type { Map as MapLibreMap } from "maplibre-gl";

import { DriveControls } from "@/components/map/drive-controls";
import { fitPoints } from "@/components/route/camera";
import type { MissionType } from "@/components/route/route-plan";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { RadioGroup } from "@/components/ui/radio-group";
import type { LngLat } from "@/lib/mars/types";

import { ChoiceCard } from "./choice-card";

/** Step ①: what kind of mission, and for a drive + walk, its power and time at the site. */
export function MissionStep({
  map,
  base,
  target,
}: {
  map: MapLibreMap | null;
  base: LngLat;
  target: LngLat;
}) {
  const { inputs, dispatch, destinations } = useRoutePlan();
  const { mission, power, samplingMin } = inputs;

  // Each mission starts from its defaults: walking to the science stop, drive + walk to the nearest site.
  function chooseMission(next: MissionType) {
    const end = next === "drive-walk" ? (destinations[0]?.center ?? target) : target;
    dispatch({ type: "setMission", mission: next, start: base, end });
    if (next === "drive-walk") fitPoints(map, [base, end]);
    else map?.flyTo({ center: base, zoom: 12 });
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
      {mission === "drive-walk" && (
        <DriveControls
          power={power}
          onPower={(next) => dispatch({ type: "setPower", power: next })}
          samplingMin={samplingMin}
          onSamplingMin={(minutes) => dispatch({ type: "setSampling", minutes })}
        />
      )}
    </div>
  );
}
