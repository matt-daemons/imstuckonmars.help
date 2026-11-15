import type { PlannerResponse } from "@/lib/mars/planner-contract";

export type RouteRequestState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; response: PlannerResponse; cache: string }
  | { kind: "failed"; message: string };

export interface LoadedRouteRequest {
  key: string;
  attempt: number;
  state: Extract<RouteRequestState, { kind: "ready" | "failed" }>;
}

export function routeRequestState(
  key: string | null,
  attempt: number,
  loaded: LoadedRouteRequest | null,
): RouteRequestState {
  if (!key) return { kind: "idle" };
  return loaded?.key === key && loaded.attempt === attempt ? loaded.state : { kind: "pending" };
}
