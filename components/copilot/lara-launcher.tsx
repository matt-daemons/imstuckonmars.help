"use client";

import { MessageSquareIcon, Mic } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ListeningEffect } from "./listening-effect";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useLaraContext, type Lara } from "./lara-context";

// What LARA is doing, shown on the button so push-to-talk and replies are visible with the chat hidden.
const STATUS_BADGE: Partial<Record<Lara["status"], string>> = {
  listening: "Listening",
  transcribing: "Transcribing",
  thinking: "Thinking",
  speaking: "Speaking",
};

/**
 * "Ask LARA" at the map's bottom right shows or hides the chat in `children`. Hiding is CSS only,
 * so the chat stays mounted and the wake word and Space push-to-talk keep working.
 */
export function LaraLauncher({ children }: { children: ReactNode }) {
  const { turns, status, error } = useLaraContext();
  const [open, setOpen] = useState(false);
  const alerts = turns.filter((turn) => turn.alert);
  // How many alert turns there were when the operator last opened or closed the chat.
  const [seen, setSeen] = useState(0);
  const unseen = !open && alerts.length > seen;
  const statusBadge = STATUS_BADGE[status];
  const hiddenError = open ? null : error;
  const chatId = useId();
  const listening = status === "listening";
  useEffect(() => {
    if (listening) setOpen(true);
  }, [listening]);

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
      <div className="absolute right-4 bottom-12">
        <ListeningEffect active={listening}>
          <Button
            variant={open ? "default" : "outline"}
            aria-expanded={open}
            aria-controls={chatId}
            className="bg-background"
            aria-label={listening ? "Ask LARA, listening" : undefined}
            onClick={toggle}
          >
            {listening ? <Mic aria-hidden /> : <MessageSquareIcon aria-hidden />}
            Ask LARA {statusBadge && !listening && <Badge variant="info">{statusBadge}</Badge>}{" "}
            {unseen && <Badge variant="warning">New alert</Badge>}{" "}
            {hiddenError && <Badge variant="error">Error</Badge>}
          </Button>
        </ListeningEffect>
      </div>
      <div id={chatId} hidden={!open}>
        {children}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
