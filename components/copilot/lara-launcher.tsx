"use client";

import { MessageSquareIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      {/* Before the chat, so Tab moves from the button into the chat it opens. Closed, it is opaque
          like Mission dashboard, since outline's tint lets bright terrain wash out the label and
          the Error badge; bottom-14 keeps it above the map credits when they wrap to two lines. */}
      <Button
        variant={open ? "default" : "outline"}
        aria-expanded={open}
        aria-controls={chatId}
        className={cn(
          "absolute right-4 bottom-14",
          // Hover steps to --muted, where the Error badge still measures 6.6:1 (--secondary: 5.9:1).
          !open && "dark:bg-background dark:hover:bg-muted",
        )}
        onClick={toggle}
      >
        <MessageSquareIcon aria-hidden />
        Ask LARA {statusBadge && <Badge variant="info">{statusBadge}</Badge>}{" "}
        {unseen && <Badge variant="warning">New alert</Badge>}{" "}
        {hiddenError && <Badge variant="error">Error</Badge>}
      </Button>
      <div id={chatId} hidden={!open}>
        {children}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
