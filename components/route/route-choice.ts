import type { Dispatch } from "react";

import type { RouteChoice } from "@/lib/mars/drive-walk";

import type { RoutePlanAction } from "./route-plan";

/** Chooses the route the expedition follows. The shortest also goes on the map, so it can be seen. */
export function chooseRoute(dispatch: Dispatch<RoutePlanAction>, route: RouteChoice) {
  dispatch({ type: "chooseRoute", route });
  if (route === "shortest") dispatch({ type: "showShortest", shown: true });
}
