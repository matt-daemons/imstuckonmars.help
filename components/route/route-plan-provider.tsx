"use client";

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import { useTrainingEmit } from "@/components/copilot/training-provider";
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
  sites,
  children,
}: {
  base: LngLat;
  sites: SitePoi[];
  children: ReactNode;
}) {
  const [inputs, planDispatch] = useReducer(routePlanReducer, base, initialRoutePlan);
  // Every route change, by the operator or by LARA, can check off a training item.
  const emitTraining = useTrainingEmit();
  const dispatch = useCallback(
    (action: RoutePlanAction) => {
      planDispatch(action);
      emitTraining({ type: "route_plan", action });
    },
    [emitTraining],
  );
  const result = useRoutePlanResult(inputs, base, sites);
  return (
    <RoutePlanContext value={{ ...result, inputs, dispatch, base }}>{children}</RoutePlanContext>
  );
}

export function useRoutePlan(): RoutePlan {
  const plan = useContext(RoutePlanContext);
  if (!plan) throw new Error("useRoutePlan needs a RoutePlanProvider above it.");
  return plan;
}
