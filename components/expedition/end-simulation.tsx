"use client";

import { SquareIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useExpedition } from "./expedition-provider";
import { missionTime } from "./present";

export function EndSimulation() {
  const { snapshot, command, lastCommand } = useExpedition();
  const [confirm, setConfirm] = useState(false);
  if (!snapshot?.config.route) return null;
  const busy = lastCommand?.state === "running";
  const ended =
    snapshot.clock.mode === "ended" || snapshot.state.elapsed_s >= snapshot.config.duration_s;

  async function end() {
    const result = await command({ type: "end" }, "End simulation");
    if (result) {
      setConfirm(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive-outline"
        disabled={busy || ended}
        onClick={() => setConfirm(true)}
      >
        <SquareIcon aria-hidden />
        End simulation
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogPopup data-hazard>
          <AlertDialogHeader>
            <AlertDialogTitle>End this simulation?</AlertDialogTitle>
            <AlertDialogDescription>
              The run stops at the current server time (now about{" "}
              {missionTime(snapshot.state.elapsed_s)}). Crew position, supplies and history are kept
              in the report. This does not return the crew to shelter. To run again, restart or
              launch a new expedition.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={busy} />}>
              Keep simulation
            </AlertDialogClose>
            <Button variant="destructive" disabled={busy || ended} onClick={() => void end()}>
              {busy ? "Ending simulation…" : "End simulation"}
            </Button>
          </AlertDialogFooter>
          {(lastCommand?.state === "failed" || lastCommand?.state === "unknown") &&
            lastCommand.label === "End simulation" && (
              <p className="px-6 pb-4 text-destructive-foreground" role="alert">
                {lastCommand.message}
              </p>
            )}
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
