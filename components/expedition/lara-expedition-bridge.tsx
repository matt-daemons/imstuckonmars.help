"use client";

import { useEffect, useRef } from "react";

import { useLaraAction } from "@/components/copilot/lara-bridge";
import { useLaraContext } from "@/components/copilot/lara-context";
import { useRoutePlan } from "@/components/route/route-plan-provider";

import { alertDetail, alertToAnnounce } from "./alert-announcements";
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

  useAlertAnnouncements();

  return null;
}

/** Alerts seen this soon after the page first gets a mission were already there: not announced. */
const LOAD_GRACE_MS = 5000;

/**
 * LARA announces newly raised Warning-or-above expedition alerts (an injected suit leak, a reserve
 * close to its limit) once per run. Findings that are snapshot reasons use LARA's own path.
 */
function useAlertAnnouncements() {
  const { snapshot, alerts } = useExpedition();
  const lara = useLaraContext();
  const ask = useRef(lara.ask);
  ask.current = lara.ask;
  const run = useRef<{
    mission: string;
    route: string | undefined;
    at: number;
    loaded: { revision: number; ms: number } | null;
    announced: Set<string>;
  } | null>(null);
  const idle = lara.ready && lara.status === "idle";

  useEffect(() => {
    if (!snapshot) return;
    const at = snapshot.state.elapsed_s;
    const route = snapshot.config.route?.id;
    const prior = run.current;
    if (!prior || prior.mission !== snapshot.mission_id) {
      run.current = {
        mission: snapshot.mission_id,
        route,
        at,
        loaded: { revision: snapshot.revision, ms: Date.now() },
        announced: new Set(),
      };
    } else if (prior.route !== route || at < prior.at - 1e-6) {
      // A reset or a new plan starts a new run: its alerts are announced again.
      Object.assign(prior, { route, loaded: null, announced: new Set() });
    }
    const current = run.current!;
    current.at = at;
    const { loaded } = current;
    if (loaded && (loaded.revision !== snapshot.revision || Date.now() - loaded.ms > LOAD_GRACE_MS))
      current.loaded = null;
    if (current.loaded) {
      for (const a of alerts) current.announced.add(a.code);
      return;
    }
    if (!idle) return;
    const fresh = alertToAnnounce(alerts, current.announced, snapshot.state.reasons, at);
    if (!fresh) return;
    current.announced.add(fresh.code);
    void ask.current({ alert: { code: fresh.code, detail: alertDetail(fresh) } });
  }, [snapshot, alerts, idle]);
}
