import type { RoutePlanInputs } from "./route-plan";
import type { RoutePlanResult } from "./use-route-plan-result";

/** Never substitute the safest route when a chosen shortest route is not yet available. */
export function selectedRoute(
  inputs: Pick<RoutePlanInputs, "route">,
  result: Pick<RoutePlanResult, "walk" | "journey">,
) {
  const shortest = inputs.route === "shortest";
  return {
    choice: shortest ? ("shortest" as const) : ("safest" as const),
    walk: shortest ? result.walk.shortest : result.walk.plan,
    trip: shortest ? result.journey.shortest : result.journey.plan,
  };
}
