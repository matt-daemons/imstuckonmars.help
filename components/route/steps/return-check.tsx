"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { useLaraContext } from "@/components/copilot/lara-context";
import type { ReturnAssessment } from "@/components/copilot/use-lara";

import { plannedReturn, returnRequest } from "../return-route";
import { useRoutePlan } from "../route-plan-provider";

const STATUS_TEXT: Record<ReturnAssessment["status"], string> = {
  modeled_resource_feasible: "feasible",
  modeled_constraint_violation: "constraint violation",
  unknown: "unknown",
};

/**
 * LARA's modeled check of the planned way home: oxygen, energy and time only, never a safety call.
 * Sent again when the route or the mission revision changes; only the latest answer shows.
 */
export function ReturnCheck() {
  const { inputs, walk, journey } = useRoutePlan();
  const lara = useLaraContext();
  const planned = plannedReturn(inputs.mission, walk.plan, journey.plan);
  const session = lara.snapshot;
  const key = planned && session ? `${planned.id} ${planned.duration_s} ${session.revision}` : null;
  const [answer, setAnswer] = useState<{ key: string; text: string } | null>(null);

  // An effect event reads the clock as it is when sending, so clock ticks alone never resend.
  const check = useEffectEvent(async () => {
    if (!planned || !session) return "";
    const body = returnRequest(planned, {
      revision: session.revision,
      baseId: session.config.base.id,
      atS: session.clock.position_s,
    });
    try {
      const { status, reasons } = await lara.assessReturn(body);
      return reasons[0] ? `${STATUS_TEXT[status]} · ${reasons[0]}` : STATUS_TEXT[status];
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
  if (planned) {
    if (!lara.ready) text = lara.error ? "LARA unavailable" : "waiting for LARA…";
    else text = answer && answer.key === key ? answer.text : "checking…";
  }
  // Mounted even while empty, so the first answer is announced.
  return (
    <p role="status" className="text-xs">
      {text && `LARA resource check (modeled): ${text}`}
    </p>
  );
}
