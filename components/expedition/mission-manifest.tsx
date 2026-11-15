import type { PlanPreview } from "@/lib/mission/client";
import { expeditionDuration, type ExpeditionPlan } from "@/lib/mission/expedition";
import { pathLengthM } from "@/lib/mission/position";
import { grams, metres, signed, span, wattHours } from "./present";

export function MissionManifest({
  plan,
  suits,
  outcome,
  destination,
  choice,
  speed,
}: {
  plan: ExpeditionPlan;
  suits: PlanPreview["suits"];
  outcome?: PlanPreview["options"][number];
  destination: string;
  choice: string;
  speed: number;
}) {
  const point = plan.outbound.path.at(-1)!;
  return (
    <div className="mission-manifest">
      <div className="manifest-destination">
        <h3>{destination}</h3>
        <p className="font-mono">
          {point[1].toFixed(4)}° N · {((point[0] + 360) % 360).toFixed(4)}° E
        </p>
        <p>{plan.mode === "walking" ? "Walk from the habitat" : "Walk from the parked rover"}</p>
      </div>
      <dl className="manifest-facts">
        <div>
          <dt>Selected route</dt>
          <dd>{choice === "shortest" ? "Shortest" : "Safest"}</dd>
        </div>
        <div>
          <dt>Distance on foot</dt>
          <dd>{metres(pathLengthM(plan.outbound.path) + pathLengthM(plan.back.path))}</dd>
        </div>
        <div>
          <dt>Sortie duration</dt>
          <dd>{span(expeditionDuration(plan))}</dd>
        </div>
        <div>
          <dt>Sampling</dt>
          <dd>{span(plan.sampling_s)}</dd>
        </div>
        <div>
          <dt>Playback</dt>
          <dd>{speed}× simulated time</dd>
        </div>
        <div>
          <dt>Oxygen loaded / reserve</dt>
          <dd>
            {grams(suits.oxygen_g)} / {grams(suits.oxygen_reserve_g)}
          </dd>
        </div>
        <div>
          <dt>Battery loaded / reserve</dt>
          <dd>
            {wattHours(suits.energy_wh)} / {wattHours(suits.energy_reserve_wh)}
          </dd>
        </div>
        <div>
          <dt>Predicted return margin</dt>
          <dd>
            {outcome?.margins ? (
              <>
                O₂ {signed(outcome.margins.oxygen_g, "g")} · battery{" "}
                {signed(outcome.margins.energy_wh, "Wh")}
              </>
            ) : (
              "Unknown"
            )}
          </dd>
        </div>
      </dl>
      <p className="manifest-boundary">
        Preparation and recovery included.{" "}
        {plan.mode === "drive_walk" &&
          "The drive stays in the route planner; this simulation covers the walk only. "}
        Modeled resources, not an operational safety clearance.
      </p>
    </div>
  );
}
