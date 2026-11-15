"use client";

import { useLaraAction } from "@/components/copilot/lara-bridge";
import { useRoutePlan } from "@/components/route/route-plan-provider";

import { useExpedition, type Speed } from "./expedition-provider";
import { routeToPlan } from "./route-to-plan";
import { selectedRoute } from "@/components/route/selected-route";

/** The speed step 03 offers first, so a voice launch plays like a click on Launch. */
const LAUNCH_SPEED: Speed = 60;

/**
 * Carries out LARA's expedition actions on the page's one expedition session: start (or resume),
 * pause, restart, and following the crew on the map. Renders nothing.
 */
export function LaraExpeditionBridge() {
  const { inputs, walk, journey, base, dispatch } = useRoutePlan();
  const { snapshot, launch, command, setFollow } = useExpedition();

  useLaraAction("start_simulation", () => {
    const selected = selectedRoute(inputs, { walk, journey });
    const { plan } = routeToPlan(inputs, base, selected.walk, selected.trip);
    if (!plan) return false;
    dispatch({ type: "goTo", step: "run" });
    const loaded = snapshot?.config.route?.id === plan.id;
    const resumable =
      loaded &&
      snapshot.clock.mode === "paused" &&
      snapshot.state.elapsed_s < snapshot.config.duration_s;
    if (resumable) void command({ type: "play" }, "Play");
    else void launch(plan, LAUNCH_SPEED);
  });

  useLaraAction("pause_simulation", () => void command({ type: "pause" }, "Pause"));

  useLaraAction("reset_simulation", () => void command({ type: "reset" }, "Restart expedition"));

  useLaraAction("focus_map", ({ target }) => {
    if (target !== "rover" || !snapshot?.state.position) return false;
    setFollow(true);
    return true;
  });

  return null;
}
