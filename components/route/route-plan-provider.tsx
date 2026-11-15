"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import type { SitePoi } from "@/components/map/scene-panel";
import type { LngLat } from "@/lib/mars/types";

import {
  initialRoutePlan,
  routePlanReducer,
  type RoutePlanAction,
  type RoutePlanInputs,
} from "./route-plan";
import { useRoutePlanResult, type RoutePlanResult } from "./use-route-plan-result";

export type RoutePlan = RoutePlanResult & {
  inputs: RoutePlanInputs;
  dispatch: Dispatch<RoutePlanAction>;
  /** The habitat, so readers can tell whether a walk starts there. */
  base: LngLat;
};

const RoutePlanContext = createContext<RoutePlan | null>(null);

/** Holds the route choices and plans them once, for every panel below it to read. */
export function RoutePlanProvider({
  base,
  target,
  sites,
  children,
}: {
  base: LngLat;
  target: LngLat;
  sites: SitePoi[];
  children: ReactNode;
}) {
  const [inputs, dispatch] = useReducer(routePlanReducer, initialRoutePlan(base, target));
  const result = useRoutePlanResult(inputs, base, sites);
  // The map fetches the sites after the plan starts, so the opening drive + walk ends at the
  // nearest one only once they arrive.
  const nearest = result.destinations[0]?.center;
  useEffect(() => {
    if (nearest) dispatch({ type: "sitesLoaded", nearest });
  }, [nearest]);
  return (
    <RoutePlanContext value={{ ...result, inputs, dispatch, base }}>{children}</RoutePlanContext>
  );
}

export function useRoutePlan(): RoutePlan {
  const plan = useContext(RoutePlanContext);
  if (!plan) throw new Error("useRoutePlan needs a RoutePlanProvider above it.");
  return plan;
}
