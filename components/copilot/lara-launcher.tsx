"use client";

import { Sparkles } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ListeningEffect } from "./listening-effect";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useLaraContext } from "./lara-context";
import { laraLauncherText } from "@/lib/copilot/speech";
import { LaraReply } from "./lara-reply";

/**
 * The AI launcher shows or hides the chat in `children`. Hiding is CSS only,
 * so the chat stays mounted and the wake word and Space push-to-talk keep working.
 */
export function LaraLauncher({ children }: { children: ReactNode }) {
  const { turns, status, error, transcript, wakeState } = useLaraContext();
  const [open, setOpen] = useState(false);
  const alerts = turns.filter((turn) => turn.alert);
  // How many alert turns there were when the operator last opened or closed the chat.
  const [seen, setSeen] = useState(0);
  const unseen = !open && alerts.length > seen;
  const hiddenError = open ? null : error;
  const chatId = useId();
  const listening = status === "listening";
  const label = laraLauncherText(status, transcript, wakeState);

  function toggle() {
    setSeen(alerts.length);
    setOpen(!open);
  }

  // The open chat shows and announces its own status, turns and errors; while it is hidden, errors
  // and new alerts are announced here.
  let announcement = "";
  if (hiddenError) announcement = `LARA error: ${hiddenError}`;
  else if (unseen) announcement = `New alert from LARA: ${alerts.at(-1)?.content}`;

  return (
    <>
      {/* Before the chat, so Tab moves from the button into the chat it opens. */}
      <div className="lara-launcher-position absolute right-4 bottom-4">
        <ListeningEffect active={listening}>
          <Button
            variant="outline"
            aria-expanded={open}
            aria-controls={chatId}
            className="lara-launcher"
            aria-label={`${label}. ${open ? "Close" : "Open"} LARA chat`}
            onClick={toggle}
          >
            <Sparkles aria-hidden />
            <span className="lara-launcher-label">{label}</span>{" "}
            {unseen && <Badge variant="warning">New alert</Badge>}{" "}
            {hiddenError && <Badge variant="error">Error</Badge>}
          </Button>
        </ListeningEffect>
      </div>
      <div id={chatId} hidden={!open}>
        {children}
      </div>
      <LaraReply chatOpen={open} />
      <p role="status" className="sr-only">
        {!open && status !== "listening" && status !== "speaking" ? label : ""}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
