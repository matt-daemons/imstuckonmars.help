"use client";

import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MapPanel } from "@/components/map/map-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  nextItem,
  TRAINING_COMPLETE_LINE,
  TRAINING_ITEMS,
  trainingContext,
} from "@/lib/copilot/training";
import { cn } from "@/lib/utils";

import { useLaraBridge, useLaraContextReader } from "./lara-bridge";
import { useLaraContext } from "./lara-context";
import { useTraining } from "./training-provider";
import { useIsMobile } from "@/hooks/use-media-query";

/**
 * The training checklist at the map's top right while training is active. Items tick off on the
 * card; LARA reads the progress before each question and speaks once, when training is complete.
 */
export function TrainingGuide() {
  const { state, loaded, dismiss } = useTraining();
  const mobile = useIsMobile();
  const bridge = useLaraBridge();
  const { status } = useLaraContext();

  useLaraContextReader("training", () => trainingContext(state));

  // The status at the last render after stored progress was read; null before, so training that
  // was completed in an earlier visit gets no line.
  const lastStatus = useRef<typeof state.status | null>(null);
  const [completeLinePending, setCompleteLinePending] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    if (lastStatus.current === "active" && state.status === "complete")
      setCompleteLinePending(true);
    lastStatus.current = state.status;
  }, [loaded, state.status]);

  // The line waits until LARA is quiet, so it follows her answer instead of interrupting it.
  useEffect(() => {
    if (status !== "idle" || !completeLinePending) return;
    bridge.say(TRAINING_COMPLETE_LINE);
    setCompleteLinePending(false);
  }, [status, completeLinePending, bridge]);

  const visible = loaded && state.status === "active";

  if (!visible) return null;

  const next = nextItem(state);
  const required = TRAINING_ITEMS.filter((item) => item.required);
  const requiredDone = required.filter((item) => state.done[item.id] !== undefined).length;

  return (
    <MapPanel
      key={mobile ? "compact" : "full"}
      defaultOpen={!mobile}
      title={`Training Wheels Protocol · ${requiredDone} of ${required.length}`}
      className="absolute top-16 left-4 w-72 max-w-[calc(100%-2rem)] text-sm"
      bodyClassName="space-y-3 pt-2"
    >
      <p className="text-xs text-muted-foreground">
        Say “deactivate training protocol” to turn it off, “activate training protocol” to start
        over.
      </p>
      <ul className="space-y-1.5" aria-label="Training Wheels Protocol checklist">
        {TRAINING_ITEMS.map((item) => {
          const done = state.done[item.id] !== undefined;
          const isNext = item.id === next?.id;
          return (
            <li key={item.id} className="flex items-start gap-2">
              {done ? (
                <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  done && "text-muted-foreground line-through",
                  isNext && "font-semibold",
                )}
              >
                <span className="sr-only">{done ? "Done: " : "Not done: "}</span>
                {item.title}
                {!item.required && (
                  <span className="text-xs font-normal text-muted-foreground"> (optional)</span>
                )}{" "}
                {isNext && <Badge variant="info">Next</Badge>}
              </span>
            </li>
          );
        })}
      </ul>
      <Button size="xs" variant="ghost" onClick={dismiss}>
        Skip training
      </Button>
    </MapPanel>
  );
}
