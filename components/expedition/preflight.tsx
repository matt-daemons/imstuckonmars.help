"use client";

import { InfoIcon, RocketIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { selectedRoute } from "@/components/route/selected-route";
import { useMissionView } from "@/components/map/mission-view";
import { MissionManifest } from "./mission-manifest";
import type { ExpeditionPlan } from "@/lib/mission/expedition";

type LaunchReview = {
  key: string;
  plan: ExpeditionPlan;
  preview: PlanPreview;
  destination: string;
  choice: "safest" | "shortest";
  speed: Speed;
  verdict: { verdict: Verdict; reasons: string[] } | null;
  replacing: boolean;
  risky: boolean;
};

/**
 * Step 03's simulated budget for the planned route, computed by the mission engine without
 * launching anything, and the launch control.
 */
export function Preflight({
  verdict,
}: {
  verdict: { verdict: Verdict; reasons: string[] } | null;
}) {
  const { inputs, walk, journey, base, dispatch, destination } = useRoutePlan();
  const expedition = useExpedition();
  const { access, snapshot, launch, lastCommand } = expedition;
  // The expedition follows the route the operator chose; the safest one until the shortest is planned.
  const selected = selectedRoute(inputs, { walk, journey });
  const result = routeToPlan(inputs, base, selected.walk, selected.trip);
  const { inspectedLeg, inspectLeg } = useMissionView();
  const key = result.plan ? JSON.stringify(result.plan) : null;
  const [preview, setPreview] = useState<{ key: string; value: PlanPreview } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [speed, setSpeed] = useState<Speed>(60);
  const [review, setReview] = useState<LaunchReview | null>(null);
  const manifestTitle = useRef<HTMLHeadingElement>(null);
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
    snapshot.clock.mode !== "ended" &&
    snapshot.state.elapsed_s > 0 &&
    snapshot.state.elapsed_s < snapshot.config.duration_s;
  const risky =
    verdict?.verdict === "NO_GO" ||
    verdict?.verdict === "CAUTION" ||
    plan?.status !== "modeled_resource_feasible" ||
    running;

  async function go() {
    if (!review || review.key !== key) return;
    setLaunching(true);
    const ok = await launch(review.plan, review.speed);
    setLaunching(false);
    if (ok) {
      setReview(null);
      dispatch({ type: "goTo", step: "run" });
    }
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
                  <tr key={leg.start_s} data-inspected={inspectedLeg === leg.activity || undefined}>
                    <th scope="row" className="text-left font-sans font-normal">
                      <button
                        type="button"
                        className="mission-leg-button"
                        aria-pressed={inspectedLeg === leg.activity}
                        onClick={() =>
                          inspectLeg(inspectedLeg === leg.activity ? null : leg.activity)
                        }
                      >
                        {ACTIVITY_LABEL[leg.activity]}
                      </button>
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
          variant={risky ? "destructive" : "default"}
          disabled={!result.plan || !current || launching}
          onClick={() => {
            if (!result.plan || !current || !key) return;
            setReview({
              key,
              plan: result.plan,
              preview: current,
              destination:
                destination?.title ??
                (inputs.mission === "walking" ? "Science stop" : "Selected destination"),
              choice: selected.choice,
              speed,
              verdict,
              replacing: Boolean(running),
              risky: Boolean(risky),
            });
          }}
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
      <AlertDialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !launching) setReview(null);
        }}
      >
        <AlertDialogPopup
          data-hazard={review?.risky || undefined}
          className="mission-manifest-dialog"
          bottomStickOnMobile={false}
          initialFocus={() => manifestTitle.current}
        >
          <AlertDialogHeader>
            <AlertDialogTitle ref={manifestTitle} tabIndex={-1}>
              Mission manifest
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription
            render={<div className="mission-manifest-body flex flex-col gap-2" />}
          >
            <Badge variant="info">
              <InfoIcon aria-hidden />
              Simulated expedition
            </Badge>
            {review && (
              <MissionManifest
                plan={review.plan}
                suits={review.preview.suits}
                outcome={review.preview.options[0]}
                destination={review.destination}
                choice={review.choice}
                speed={review.speed}
              />
            )}
          </AlertDialogDescription>
          <AlertDialogFooter className="mission-manifest-footer">
            {review?.replacing && (
              <p>The existing expedition will be replaced and its clock rewound.</p>
            )}
            {review?.verdict && (
              <p className={review.verdict.verdict === "GO" ? "" : "text-destructive-foreground"}>
                {review.verdict.verdict !== "GO" && (
                  <TriangleAlertIcon aria-hidden className="mr-2 inline size-4" />
                )}
                Route check: {review.verdict.verdict === "NO_GO" ? "NO-GO" : review.verdict.verdict}
                . {review.verdict.reasons[0]}
              </p>
            )}
            {review?.preview.options[0]?.status !== "modeled_resource_feasible" && (
              <p>
                Resource check:{" "}
                {review?.preview.options[0]?.reasons.map(reasonText).join(" ") || "Unknown"}
              </p>
            )}
            {review?.key !== key && (
              <p role="alert" className="text-destructive-foreground">
                The plan changed during review. Close this manifest and review the updated plan.
              </p>
            )}
            {lastCommand?.state === "failed" && lastCommand.label.includes("expedition") && (
              <p role="alert">{lastCommand.message}</p>
            )}
            <div className="manifest-actions">
              <AlertDialogClose render={<Button variant="outline" disabled={launching} />}>
                Keep planning
              </AlertDialogClose>
              <Button
                variant={review?.risky ? "destructive" : "default"}
                disabled={launching || review?.key !== key}
                onClick={() => void go()}
              >
                {launching ? "Launching…" : review?.risky ? "Launch anyway" : "Begin expedition"}
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
