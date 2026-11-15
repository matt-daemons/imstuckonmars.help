"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { useLaraContext } from "@/components/copilot/lara-context";
import { fmtMin } from "@/components/copilot/lara-panel";
import type { ReturnAssessment } from "@/components/copilot/use-lara";
import { MAX_DURATION_S } from "@/lib/mission/types";

import { plannedReturn, reasonText, returnCheckKey, returnRequest } from "../return-route";
import { useRoutePlan } from "../route-plan-provider";
import { samePoint } from "../use-route-plan-result";

const STATUS_TEXT: Record<ReturnAssessment["status"], string> = {
  modeled_resource_feasible: "feasible",
  modeled_constraint_violation: "constraint violation",
  unknown: "unknown",
};

/**
 * LARA's modeled check of the planned way home: oxygen, energy and time only, never a safety call.
 * Sent again when the route or the mission revision changes, and every 5 mission minutes while the
 * clock plays; only the latest answer shows, with the mission time it was computed at.
 */
export function ReturnCheck() {
  const { inputs, walk, journey, base } = useRoutePlan();
  const lara = useLaraContext();
  const planned = plannedReturn(
    inputs.mission,
    walk.plan,
    journey.plan,
    samePoint(inputs.start, base),
  );
  // LARA's clock covers one EVA; a longer return would be rejected, so it is not sent.
  const tooLong = planned !== null && planned.duration_s > MAX_DURATION_S;
  const session = lara.snapshot;
  const key =
    planned && session && !tooLong
      ? returnCheckKey(planned, {
          revision: session.revision,
          playing: session.clock.mode === "playing",
          atS: session.clock.position_s,
        })
      : null;
  const [answer, setAnswer] = useState<{ key: string; text: string } | null>(null);

  // An effect event reads the clock as it is when sending, so only a new key sends again.
  const check = useEffectEvent(async () => {
    if (!planned || !session) return "";
    const atS = session.clock.position_s;
    const body = returnRequest(planned, {
      revision: session.revision,
      baseId: session.config.base.id,
      atS,
    });
    try {
      const { status, reasons } = await lara.assessReturn(body);
      const result = `${STATUS_TEXT[status]} at Mission ${fmtMin(atS)}`;
      return reasons[0] ? `${result} · ${reasonText(reasons[0])}` : result;
    } catch (error) {
      return `not checked: ${(error as Error).message}`;
    }
  });

  useEffect(() => {
    if (!key) return;
    let stale = false;
    void check().then((text) => !stale && setAnswer({ key, text }));
    return () => {
      stale = true;
    };
  }, [key]);

  let text = "";
  if (tooLong) {
    text = `not checked: the walk back is longer than LARA's ${MAX_DURATION_S / 3600} h mission clock`;
  } else if (planned) {
    if (!lara.ready) text = lara.error ? "LARA unavailable" : "waiting for LARA…";
    else text = answer && answer.key === key ? answer.text : "checking…";
  }
  // Mounted even while empty, so the first answer is announced.
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {text && `Resource check (LARA, modeled): ${text}`}
    </p>
  );
}
