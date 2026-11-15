"use client";

import { useLaraAction } from "@/components/copilot/lara-bridge";
import { useRoutePlan } from "@/components/route/route-plan-provider";

import { useExpedition, type Speed } from "./expedition-provider";
import { routeToPlan } from "./route-to-plan";

/** The speed step ③ offers first, so a voice launch plays like a click on Launch. */
const LAUNCH_SPEED: Speed = 60;

/**
 * Carries out LARA's expedition actions on the page's one expedition session: start (or resume),
 * pause, restart, and following the crew on the map. Renders nothing.
 */
export function LaraExpeditionBridge() {
  const { inputs, walk, journey, base, dispatch } = useRoutePlan();
  const { snapshot, launch, command, setFollow } = useExpedition();

  useLaraAction("start_simulation", () => {
    const trip = inputs.route === "shortest" ? (journey.shortest ?? journey.plan) : journey.plan;
    const { plan } = routeToPlan(inputs, base, walk.plan, trip);
    if (!plan) return;
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
    if (target === "rover") setFollow(true);
  });

  return null;
}
