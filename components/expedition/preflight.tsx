"use client";

import { RocketIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useRoutePlan } from "@/components/route/route-plan-provider";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { missionApi, type PlanPreview } from "@/lib/mission/client";
import { formatNumber } from "@/lib/mission/format";
import { reasonText } from "@/lib/mission/reasons";
import type { Verdict } from "@/lib/mars/types";

import { SPEEDS, useExpedition, type Speed } from "./expedition-provider";
import {
  ACTIVITY_LABEL,
  STATUS_STYLE,
  grams,
  missionTime,
  signed,
  span,
  wattHours,
} from "./present";
import { routeToPlan } from "./route-to-plan";

/**
 * Step 03's simulated budget for the planned route, computed by the mission engine without
 * launching anything, and the launch control.
 */
export function Preflight({
  verdict,
}: {
  verdict: { verdict: Verdict; reasons: string[] } | null;
}) {
  const { inputs, walk, journey, base, dispatch } = useRoutePlan();
  const expedition = useExpedition();
  const { access, snapshot, launch, lastCommand } = expedition;
  // The expedition follows the route the operator chose; the safest one until the shortest is planned.
  const trip = inputs.route === "shortest" ? (journey.shortest ?? journey.plan) : journey.plan;
  const result = routeToPlan(inputs, base, walk.plan, trip);
  const key = result.plan ? JSON.stringify(result.plan) : null;
  const [preview, setPreview] = useState<{ key: string; value: PlanPreview } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [speed, setSpeed] = useState<Speed>(60);
  const [confirm, setConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!key || !access) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      missionApi
        .preview(access, JSON.parse(key), controller.signal)
        .then((value) => setPreview({ key, value }))
        .catch((cause: Error) => {
          if (!controller.signal.aborted) setError({ key, message: cause.message });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, access]);

  const current = preview?.key === key ? preview.value : null;
  const failure = error?.key === key ? error.message : null;
  const plan = current?.options[0];
  const status = plan ? STATUS_STYLE[plan.status] : null;
  const running =
    snapshot?.config.route &&
    snapshot.state.elapsed_s > 0 &&
    snapshot.state.elapsed_s < snapshot.config.duration_s;
  const risky =
    verdict?.verdict === "NO_GO" ||
    verdict?.verdict === "CAUTION" ||
    plan?.status !== "modeled_resource_feasible" ||
    running;

  async function go() {
    if (!result.plan) return;
    setConfirm(false);
    setLaunching(true);
    const ok = await launch(result.plan, speed);
    setLaunching(false);
    if (ok) dispatch({ type: "goTo", step: "run" });
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-3" aria-labelledby="preflight-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="preflight-title" className="font-heading text-sm font-semibold">
          Simulated resource budget
        </h3>
        {status && !failure && (
          <Badge variant={status.variant}>
            <status.Icon aria-hidden />
            {status.label}
          </Badge>
        )}
      </div>
      <div role="status" className="flex flex-col gap-2">
        {!result.plan ? (
          <p className="text-sm text-muted-foreground">{result.reason}</p>
        ) : failure ? (
          <p className="text-sm text-destructive-foreground">Budget not computed: {failure}.</p>
        ) : !current || !plan ? (
          <p className="text-sm text-muted-foreground">
            {access ? "Computing with the mission engine…" : "Waiting for the mission session…"}
          </p>
        ) : (
          <>
            <table className="preflight-table w-full text-sm">
              <caption className="sr-only">Suit oxygen and energy each leg draws</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="text-left font-normal">
                    Leg
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Time
                  </th>
                  <th scope="col" className="text-right font-normal">
                    O₂
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Energy
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {plan.budget.map((leg) => (
                  <tr key={leg.start_s}>
                    <th scope="row" className="text-left font-sans font-normal">
                      {ACTIVITY_LABEL[leg.activity]}
                    </th>
                    <td className="text-right">{span(leg.end_s - leg.start_s)}</td>
                    <td className="text-right">{grams(leg.oxygen_g)}</td>
                    <td className="text-right">{wattHours(leg.energy_wh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.margins && (
              <dl className="grid grid-cols-3 gap-2 border-t pt-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">O₂ above reserve</dt>
                  <dd className="font-mono">{signed(plan.margins.oxygen_g, "g")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Battery above reserve</dt>
                  <dd className="font-mono">{signed(plan.margins.energy_wh, "Wh")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Back at shelter</dt>
                  <dd className="font-mono">
                    {plan.arrival_s !== null ? missionTime(plan.arrival_s) : "Unknown"}
                  </dd>
                </div>
              </dl>
            )}
            {plan.reasons.length > 0 && (
              <ul className="list-disc pl-4 text-sm text-destructive-foreground">
                {plan.reasons.map((reason) => (
                  <li key={reason}>{reasonText(reason)}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Suits sized to the flight rules: {grams(current.suits.oxygen_g)} O₂ and{" "}
              {wattHours(current.suits.energy_wh)} for{" "}
              {formatNumber(current.suits.eva_limit_s! / 60, 0)} min, reserve{" "}
              {grams(current.suits.oxygen_reserve_g)} / {wattHours(current.suits.energy_reserve_wh)}
              . Simulated, not a safety assessment.
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          aria-label="Launch speed"
          variant="outline"
          size="sm"
          value={[String(speed)]}
          onValueChange={(value) => value[0] && setSpeed(Number(value[0]) as Speed)}
        >
          {SPEEDS.map((s) => (
            <ToggleGroupItem key={s} value={String(s)} className="font-mono">
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          className="flex-1"
          disabled={!result.plan || !current || launching}
          onClick={() => (risky ? setConfirm(true) : void go())}
        >
          <RocketIcon aria-hidden />
          {launching ? "Launching…" : running ? "Launch new expedition" : "Launch expedition"}
        </Button>
      </div>
      {lastCommand?.state === "failed" && lastCommand.label.includes("expedition") && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {lastCommand.label} failed: {lastCommand.message}
        </p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogPopup data-hazard>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Launch this {inputs.mission === "walking" ? "walk" : "drive + walk"} anyway?
            </AlertDialogTitle>
            <AlertDialogDescription render={<div className="flex flex-col gap-2" />}>
              {running && <p>A running expedition will be replaced and its clock rewound.</p>}
              {verdict && verdict.verdict !== "GO" && (
                <p>
                  Route check is {verdict.verdict === "NO_GO" ? "NO-GO" : "CAUTION"}:{" "}
                  {verdict.reasons[0]}
                </p>
              )}
              {plan && plan.status !== "modeled_resource_feasible" && (
                <p>
                  Simulated budget: {STATUS_STYLE[plan.status].label.toLowerCase()} (
                  {plan.reasons.map(reasonText).join(" ")}).
                </p>
              )}
              <p>This is a simulation for planning practice. Launch at {speed}× speed?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Keep planning</AlertDialogClose>
            <Button variant="destructive" onClick={() => void go()}>
              Launch anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
