"use client";

import { FileTextIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useExpedition } from "./expedition-provider";
import { missionTime } from "./present";

export function CompletionNotice() {
  const { completionOpen, snapshot, setReportOpen, reportSave } = useExpedition();
  if (!completionOpen || !snapshot) return null;
  return (
    <CompletionBanner
      ended={snapshot.clock.mode === "ended"}
      elapsed={snapshot.state.elapsed_s}
      status={
        reportSave === "saved"
          ? "Report saved in this browser"
          : reportSave === "removed"
            ? "Saved browser copy removed"
            : reportSave === "error"
              ? "Report needs attention"
              : "Preparing report"
      }
      onOpen={() => setReportOpen(true)}
    />
  );
}

export function CompletionBanner({
  ended,
  elapsed,
  status,
  onOpen,
}: {
  ended: boolean;
  elapsed: number;
  status: string;
  onOpen: () => void;
}) {
  const titleId = useId();
  return (
    <section className="mission-completion" aria-labelledby={titleId} role="status">
      <FileTextIcon aria-hidden />
      <div>
        <h2 id={titleId}>{ended ? "Simulation ended" : "Simulation complete"}</h2>
        <p>
          <span className="font-mono">{missionTime(elapsed)}</span> · {status}
        </p>
      </div>
      <Button variant="outline" onClick={onOpen}>
        Open report
      </Button>
    </section>
  );
}
