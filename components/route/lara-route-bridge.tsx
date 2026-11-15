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
import { useMissionView } from "@/components/map/mission-view";
import { useExpedition } from "@/components/expedition/expedition-provider";

/**
 * Carries out LARA's route actions on the plan and the map, and reports the plan to her before each
 * question. Renders nothing.
 */
export function LaraRouteBridge({ map }: { map: MapLibreMap | null }) {
  const plan = useRoutePlan();
  const { conditions } = useConditions();
  const bridge = useLaraBridge();
  const { inputs, dispatch, base, destinations } = plan;
  const { focus } = useMissionView();
  const { setFollow } = useExpedition();

  useLaraContextReader("route_plan", () => routePlanContext(plan, conditions));

  useLaraAction("show_destinations", () => {
    if (!map || !destinations.length) return false;
    if (inputs.mission !== "drive-walk")
      dispatch({ type: "setMission", mission: "drive-walk", start: base });
    dispatch({ type: "goTo", step: "where" });
    // Share the manual Overview camera path, including disabling crew-follow.
    return focus("overview");
  });

  useLaraAction("select_destination", ({ number }) => {
    const site = destinations[number - 1];
    if (!map || !site) return false;
    setFollow(false);
    if (inputs.mission !== "drive-walk")
      dispatch({ type: "setMission", mission: "drive-walk", start: base });
    dispatch({ type: "setEnd", point: site.center });
    dispatch({ type: "goTo", step: "check" });
    fitPoints(map, [base, site.center]);
    bridge.say(ROUTE_CHECK_SENTENCE);
  });

  useLaraAction("choose_route", ({ route }) => chooseRoute(dispatch, route));

  useLaraAction("set_power", ({ power }) => {
    if (inputs.mission !== "drive-walk")
      dispatch({ type: "setMission", mission: "drive-walk", start: base });
    dispatch({ type: "setPower", power });
    if (inputs.end && power !== inputs.power) bridge.say(ROUTE_CHECK_SENTENCE);
  });

  useLaraAction("focus_map", ({ target }) => {
    const view = focusView(target, plan);
    if (!map || !view) return false;
    setFollow(false);
    showView(map, view);
    return true;
  });

  return null;
}

function showView(map: MapLibreMap | null, view: FocusView) {
  if (view.kind === "fit") fitPoints(map, view.points);
  else map?.flyTo({ center: view.point, zoom: view.zoom });
}
