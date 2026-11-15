"use client";

import { Ear, EarOff, Mic, Pause, Play, Send, Square, Volume2, VolumeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { MapPanel } from "@/components/map/map-panel";
import { useLaraContext } from "@/components/copilot/lara-context";
import { useWakeWord, type WakeState } from "@/components/copilot/use-wake-word";

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
  listening: "Say “Hey LARA” or “LARA”",
  paused: "Wake word is paused while LARA is busy",
  "follow-up": "Ask another question, or say “no thanks” to finish",
  error: "Wake word is not available. The microphone or the model did not load.",
};

/** Playback speed of the demo. At 20×, the scripted battery failure plays out in about 3 minutes. */
const DEMO_SPEED = 20;

/** Mission time as minutes and seconds, so the readout moves every second during playback. */
export const fmtMin = (s: number) => {
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function Readout({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** Voice and text copilot over the authoritative mission snapshot. Read-only for now. */
export function LaraPanel() {
  const lara = useLaraContext();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = lara.snapshot;
  const listening = lara.status === "listening";
  const busy = !lara.ready || (lara.status !== "idle" && !listening);
  const [wakeOn, setWakeOn] = useState(false);
  const wake = useWakeWord({
    enabled: wakeOn && lara.ready,
    paused: lara.status !== "idle",
    ...lara.wakeHandlers,
  });
  const finishListening = () => {
    if (wakeOn) wake.finish();
    lara.stopListening();
  };
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

  const doseH = s?.observed.radiation.observation?.dose_rate_e_ugy_day;
  const playing = s?.clock.mode === "playing";

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
              {WAKE_TEXT[wake.state]}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="outline"
            disabled={!s}
            aria-label={playing ? "Pause replay" : "Play replay at 20× speed"}
            onClick={() =>
              playing
                ? lara.command({ type: "pause" })
                : lara
                    .command({ type: "speed", speed: DEMO_SPEED })
                    .then(() => lara.command({ type: "play" }))
            }
          >
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? "Pause" : "Play 20×"}
          </Button>
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

      {s && (
        <dl className="grid grid-cols-4 gap-2 rounded-md border p-2">
          <Readout
            label="Mission"
            value={fmtMin(s.clock.position_s)}
            note={`of ${fmtMin(s.config.duration_s)}`}
          />
          <Readout
            label="Suit O₂"
            value={`${Math.round(s.state.oxygen.eva.remaining_g)} g`}
            note={`reserve ${s.config.oxygen.eva.reserve_g}`}
          />
          <Readout
            label="Suit battery"
            value={`${Math.round(s.state.battery.eva.remaining_wh)} Wh`}
            note={`reserve ${s.config.battery.eva.reserve_wh}`}
          />
          <Readout
            label="Dose rate"
            value={doseH == null ? "No data" : `${(doseH / 24).toFixed(1)} µGy/h`}
            note="Gale proxy"
          />
        </dl>
      )}
      <p className="text-[11px] text-muted-foreground">
        Resources are simulated. MOXIE, MEDA, and RAD are archived NASA data, not live measurements.
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
