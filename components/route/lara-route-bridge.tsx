"use client";

import type { Map as MapLibreMap } from "maplibre-gl";

import {
  useLaraAction,
  useLaraBridge,
  useLaraContextReader,
} from "@/components/copilot/lara-bridge";
import { ROUTE_CHECK_SENTENCE } from "@/lib/copilot/lara-context";

import { fitPoints } from "./camera";
import { useConditions } from "./conditions-provider";
import { focusView, routePlanContext, type FocusView } from "./lara-route-context";
import { chooseRoute } from "./route-choice";
import { useRoutePlan } from "./route-plan-provider";

/**
 * Carries out LARA's route actions on the plan and the map, and reports the plan to her before each
 * question. Renders nothing.
 */
export function LaraRouteBridge({ map }: { map: MapLibreMap | null }) {
  const plan = useRoutePlan();
  const { conditions } = useConditions();
  const bridge = useLaraBridge();
  const { inputs, dispatch, base, destinations } = plan;

  useLaraContextReader("route_plan", () => routePlanContext(plan, conditions));

  useLaraAction("show_destinations", () => {
    if (inputs.mission !== "drive-walk") {
      const end = destinations[0]?.center ?? inputs.end;
      dispatch({ type: "setMission", mission: "drive-walk", start: base, end });
    }
    dispatch({ type: "goTo", step: "where" });
    fitPoints(map, [base, ...destinations.map((site) => site.center)]);
  });

  useLaraAction("select_destination", ({ number }) => {
    const site = destinations[number - 1];
    if (!site) return;
    if (inputs.mission !== "drive-walk")
      dispatch({ type: "setMission", mission: "drive-walk", start: base, end: site.center });
    dispatch({ type: "setEnd", point: site.center });
    dispatch({ type: "goTo", step: "check" });
    fitPoints(map, [base, site.center]);
    bridge.say(ROUTE_CHECK_SENTENCE);
  });

  useLaraAction("choose_route", ({ route }) => chooseRoute(dispatch, route));

  useLaraAction("focus_map", ({ target }) => {
    const view = focusView(target, plan);
    if (view) showView(map, view);
  });

  return null;
}

function showView(map: MapLibreMap | null, view: FocusView) {
  if (view.kind === "fit") fitPoints(map, view.points);
  else map?.flyTo({ center: view.point, zoom: view.zoom });
}
