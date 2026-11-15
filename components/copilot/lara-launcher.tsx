"use client";

import { MessageSquareIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useLaraContext } from "./lara-context";

/**
 * "Ask LARA" at the map's bottom right shows or hides the chat in `children`. Hiding is CSS only,
 * so the chat stays mounted and the wake word and Space push-to-talk keep working.
 */
export function LaraLauncher({ children }: { children: ReactNode }) {
  const { turns } = useLaraContext();
  const [open, setOpen] = useState(false);
  const alerts = turns.filter((turn) => turn.alert);
  // How many alert turns there were when the operator last opened or closed the chat.
  const [seen, setSeen] = useState(0);
  const unseen = !open && alerts.length > seen;
  const chatId = useId();

  function toggle() {
    setSeen(alerts.length);
    setOpen(!open);
  }

  return (
    <>
      <div id={chatId} hidden={!open}>
        {children}
      </div>
      <Button
        variant={open ? "default" : "outline"}
        aria-expanded={open}
        aria-controls={chatId}
        className="absolute right-4 bottom-12"
        onClick={toggle}
      >
        <MessageSquareIcon aria-hidden />
        Ask LARA {unseen && <Badge variant="warning">New alert</Badge>}
      </Button>
      {/* The open chat announces its own turns; while it is hidden, new alerts are announced here. */}
      <p role="status" className="sr-only">
        {unseen ? `New alert from LARA: ${alerts.at(-1)?.content}` : ""}
      </p>
    </>
  );
}
