"use client";

import { Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLaraContext } from "./lara-context";

export function LaraReply({ chatOpen }: { chatOpen: boolean }) {
  const { reply, dismissReply, stopSpeaking } = useLaraContext();
  return (
    <LaraReplyView
      reply={reply}
      onStop={stopSpeaking}
      onDismiss={() => {
        stopSpeaking();
        dismissReply();
        document.querySelector<HTMLButtonElement>(".lara-launcher")?.focus();
      }}
      announce={!chatOpen}
    />
  );
}

export function LaraReplyView({
  reply,
  onStop,
  onDismiss,
  announce = true,
}: {
  reply: ReturnType<typeof useLaraContext>["reply"];
  onStop: () => void;
  onDismiss: () => void;
  announce?: boolean;
}) {
  const text = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (text.current) text.current.scrollTop = text.current.scrollHeight;
  }, [reply?.visibleText]);
  useEffect(() => {
    if (!reply) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        event.target instanceof Node &&
        text.current?.parentElement?.contains(event.target)
      ) {
        onDismiss();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [reply, onDismiss]);
  return (
    <>
      {reply && (
        <aside className="lara-reply" aria-label="LARA reply">
          <div className="lara-reply-header">
            <span className="flex items-center gap-2 font-heading">
              <Sparkles aria-hidden className="size-4" />
              LARA{" "}
              <span className="text-xs text-muted-foreground">AI-generated voice and response</span>
            </span>
            <div className="flex gap-1">
              {reply.speaking && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Stop LARA speech"
                  onClick={() => {
                    onStop();
                    text.current?.focus();
                  }}
                >
                  <Square aria-hidden />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss LARA reply"
                onClick={onDismiss}
              >
                <X aria-hidden />
              </Button>
            </div>
          </div>
          <p ref={text} className="lara-reply-text" aria-label="Spoken reply" tabIndex={0}>
            {reply.visibleText || "…"}
          </p>
          <p className="text-xs text-muted-foreground">
            Not a safety assessment. NASA has not reviewed this response.
          </p>
        </aside>
      )}
      {/* Announce each reply once, not on every revealed word. */}
      <p className="sr-only" role="status">
        {announce ? reply?.text : ""}
      </p>
    </>
  );
}
