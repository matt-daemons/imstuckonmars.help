"use client";

import { Ear, EarOff, Mic, Pause, Play, Send, Square, Volume2, VolumeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { MapPanel } from "@/components/map/map-panel";
import { useLara } from "@/components/copilot/use-lara";
import { useWakeWord, type WakeState } from "@/components/copilot/use-wake-word";

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
  listening: "Say “Hey LARA”",
  paused: "Wake word is paused while LARA is busy",
  error: "Wake word is not available. The microphone or the model did not load.",
};

/** Playback speed of the demo. At 20×, the scripted battery failure plays out in about 3 minutes. */
const DEMO_SPEED = 20;

/** Mission time as minutes and seconds, so the readout moves every second during playback. */
const fmtMin = (s: number) => {
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
  const lara = useLara();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const s = lara.snapshot;
  const listening = lara.status === "listening";
  const busy = !lara.ready || (lara.status !== "idle" && !listening);
  const [wakeOn, setWakeOn] = useState(false);
  const wake = useWakeWord({
    enabled: wakeOn && lara.ready,
    paused: lara.status !== "idle",
    ...lara.wakeHandlers,
  });

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [lara.turns]);

  // Space bar is push-to-talk when focus is not in a text field.
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e) || busy) return;
      e.preventDefault();
      void lara.startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e)) lara.stopListening();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [busy, lara]);

  function submit(e: FormEvent) {
    e.preventDefault();
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
      className="absolute bottom-12 left-4 flex max-h-[60svh] w-96 max-w-[calc(100%-2rem)] flex-col text-sm"
      bodyClassName="flex min-h-0 flex-col gap-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {STATUS_TEXT[lara.status]}
          </p>
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {WAKE_TEXT[wake]}
          </p>
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
            aria-label={wakeOn ? "Stop listening for Hey LARA" : "Listen for Hey LARA"}
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
        Resources are simulated. MOXIE, MEDA, and RAD are archived NASA data. The app replays them
        as live data.
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
          id="lara-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about oxygen, battery, or radiation"
          disabled={!lara.ready}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <Button size="sm" type="submit" disabled={busy || !draft.trim()} aria-label="Send">
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
          onClick={() => (listening ? lara.stopListening() : void lara.startListening())}
        >
          {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
        </Button>
      </form>
    </MapPanel>
  );
}
