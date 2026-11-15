"use client";

import { Ear, EarOff, Mic, Send, Square, Volume2, VolumeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { MapPanel } from "@/components/map/map-panel";
import { useLaraContext } from "@/components/copilot/lara-context";
import type { WakeState } from "@/components/copilot/use-wake-word";

import { PushToTalk, spaceTarget } from "./push-to-talk";

const STATUS_TEXT = {
  starting: "Starting mission…",
  idle: "Ready",
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
} as const;

const WAKE_TEXT: Record<WakeState, string> = {
  off: "Wake word is off",
  loading: "Loading wake word model (about 41 MB)…",
  listening: 'Say "Hey Lara"',
  paused: "Wake word is paused while LARA is busy",
  "follow-up": "Ask another question, or say “no thanks” to finish",
  error: "Wake word is not available. The microphone or the model did not load.",
};

/** Voice and text copilot over the authoritative mission snapshot. Read-only for now. */
export function LaraPanel() {
  const lara = useLaraContext();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listening = lara.status === "listening";
  const busy = !lara.ready || (lara.status !== "idle" && !listening);
  const { wakeOn, setWakeOn, finishListening } = lara;
  useEffect(() => {
    if (listening && input.current) input.current.scrollLeft = input.current.scrollWidth;
  }, [listening, lara.transcript]);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [lara.turns]);

  // Space bar is push-to-talk. Text fields keep Space for typing; on a focused control a tap still
  // activates it, which keyboard users rely on, and a hold talks. Listeners run in the capture
  // phase so a focused control never sees a Space that push-to-talk handles.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const { startListening, stopListening } = lara;
  useEffect(() => {
    const ptt = new PushToTalk({
      start: () => void startListening(),
      stop: stopListening,
      activate: (control) => control.click(),
    });
    const take = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (ptt.down(spaceTarget(e.target), !busyRef.current)) take(e);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && ptt.up()) take(e);
    };
    const abandon = () => ptt.abandon();
    const hidden = () => document.visibilityState === "hidden" && ptt.abandon();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", abandon);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      ptt.abandon();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", abandon);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [startListening, stopListening]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (listening || busy) return;
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    void lara.ask({ question });
  }

  return (
    <MapPanel
      title="LARA"
      // Its top stays 1rem below the training card while that shows (see TrainingGuide), but never
      // below 12rem of height.
      className="absolute right-4 bottom-24 flex max-h-[max(12rem,min(60svh,calc(100%_-_7rem)))] w-96 max-w-[calc(100%-2rem)] flex-col text-sm"
      bodyClassName="flex min-h-0 flex-col gap-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {STATUS_TEXT[lara.status]}
          </p>
          {!listening && (
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
              {WAKE_TEXT[lara.wakeState]}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant={wakeOn ? "default" : "ghost"}
            aria-pressed={wakeOn}
            aria-label={
              wakeOn ? "Stop listening for Hey LARA or LARA" : "Listen for Hey LARA or LARA"
            }
            onClick={() => setWakeOn(!wakeOn)}
          >
            {wakeOn ? <Ear aria-hidden /> : <EarOff aria-hidden />}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-pressed={lara.voice}
            aria-label={lara.voice ? "Mute LARA's voice" : "Unmute LARA's voice"}
            onClick={() => lara.setVoice(!lara.voice)}
          >
            {lara.voice ? <Volume2 aria-hidden /> : <VolumeOff aria-hidden />}
          </Button>
        </div>
      </header>

      <p className="text-[11px] text-muted-foreground">
        LARA&apos;s answers and voice are AI-generated. NASA has not reviewed them.
      </p>

      <ol ref={log} className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
        {lara.turns.map((t, i) => (
          <li
            key={i}
            className={
              t.role === "user"
                ? "ml-8 rounded-md bg-secondary px-2 py-1 text-secondary-foreground"
                : "mr-8 rounded-md border px-2 py-1"
            }
          >
            <span className="sr-only">{t.role === "user" ? "You: " : "LARA: "}</span>
            {t.content}
          </li>
        ))}
      </ol>

      {lara.error && (
        <p role="alert" className="rounded-md bg-destructive px-2 py-1 text-xs text-white">
          {lara.error}
        </p>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="lara-input" className="sr-only">
          Ask LARA
        </label>
        <input
          ref={input}
          id="lara-input"
          value={listening || lara.status === "transcribing" ? lara.transcript : draft}
          readOnly={listening || lara.status === "transcribing"}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            listening ? "Listening… speak your question" : "Ask about oxygen, battery, or radiation"
          }
          disabled={!lara.ready}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <Button
          size="sm"
          type="submit"
          disabled={busy || listening || !draft.trim()}
          aria-label="Send"
        >
          <Send aria-hidden />
        </Button>
        <Button
          size="sm"
          type="button"
          variant={listening ? "destructive" : "outline"}
          disabled={busy}
          aria-pressed={listening}
          aria-label={
            listening
              ? "Stop recording and send the question"
              : "Talk to LARA. You can also hold the space bar."
          }
          onClick={() => (listening ? finishListening() : void lara.startListening())}
        >
          {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
        </Button>
      </form>
    </MapPanel>
  );
}
