"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Expedition } from "@/components/expedition/expedition-provider";
import { parseTrainingCommand, trainingCommandLine, type AskVia } from "@/lib/copilot/training";
import type { Command } from "@/lib/mission/client";
import type { ReturnRoute } from "@/lib/mission/types";

import { playHeardCue } from "./cue";
import { useLaraBridge, type LaraAction } from "./lara-bridge";
import { useOptionalTraining } from "./training-provider";
import {
  answerWakeQuestion,
  pickPhrase,
  SIGN_OFFS,
  stripWakePhrase,
  type WakeTurnSteps,
} from "./follow-up";
import type { AfterUtterance } from "./wake-session";
import {
  displaySpeechText,
  spokenText,
  timedSpeechSchema,
  type SpeechClip,
} from "@/lib/copilot/speech";
import { startTranscriptPreview } from "./transcript-preview";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  alert?: boolean;
}

/** The subset of GET /api/missions/:id the panel reads. */
interface MissionSnapshot {
  revision: number;
  clock: { mode: "paused" | "playing" | "ended"; position_s: number; speed: number };
  config: {
    base: { id: string };
    /** Set once an expedition is loaded; without it the session is the base-only simulation. */
    route?: { id: string } | null;
    duration_s: number;
    oxygen: Record<"base" | "eva", { reserve_g: number }>;
    battery: Record<"base" | "eva", { reserve_wh: number }>;
  };
  state: {
    activity: string;
    reasons: string[];
    oxygen: Record<"base" | "eva", { remaining_g: number }>;
    battery: Record<"base" | "eva", { remaining_wh: number }>;
  };
  observed: {
    radiation: { status: string; observation?: { dose_rate_e_ugy_day: number | null } | null };
  };
}

/** The subset of POST /api/copilot/:id/ask the chat reads. */
interface AskReply {
  text: string;
  /** App actions LARA named, for the browser to carry out. */
  actions?: LaraAction[];
}

/** The subset of POST /api/missions/:id/assess-return the route check reads. */
export interface ReturnAssessment {
  status: "modeled_resource_feasible" | "modeled_constraint_violation" | "unknown";
  reasons: string[];
}

type Status = "starting" | "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const WAKE_REPLY = "Yes?";
/** How often a follow-up waits for an alert LARA is still answering. */
const ASK_DONE_CHECK_MS = 100;
export const POLL_MS = 2000;
const HISTORY_TURNS = 8;
/** A push-to-talk recording ends after this even if the key release is lost. */
const MAX_PUSH_TO_TALK_MS = 30_000;
const ACTION_GAP_MS = 50;

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok)
    throw new Error(body.error?.message ?? `Mission server returned ${response.status}`);
  return body;
}

/** An error message in three parts (S-2): what failed, the cause if known, what to do. */
function failure(what: string, cause: unknown, action: string) {
  const text = cause instanceof Error ? cause.message.trim() : "";
  const reason = text && !/[.!?]$/.test(text) ? `${text}.` : text;
  return [`${what}.`, reason, action].filter(Boolean).join(" ");
}

export type SharedLaraMission = Pick<
  Expedition,
  "access" | "snapshot" | "lastOkAt" | "link" | "command"
>;

/** The shared mission reader and ask → speak loop; only standalone demos own a poller. */
export function useLara(shared?: SharedLaraMission) {
  const [demoMission, setMission] = useState<{ id: string; token: string } | null>(null);
  const mission = shared === undefined ? demoMission : shared.access;
  const [demoSnapshot, setSnapshot] = useState<MissionSnapshot | null>(null);
  const snapshot: MissionSnapshot | null = shared === undefined ? demoSnapshot : shared.snapshot;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  // When the last poll succeeded (ms since epoch), so readers can tell a stale snapshot.
  const [demoPolledAt, setPolledAt] = useState<number | null>(null);
  const polledAt = shared === undefined ? demoPolledAt : shared.lastOkAt;
  const [voice, setVoice] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<{
    id: number;
    text: string;
    visibleText: string;
    speaking: boolean;
  } | null>(null);
  const replyId = useRef(0);
  const seenReasons = useRef<Set<string> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  // Push-to-talk can be released while the microphone is still opening.
  const micOpening = useRef(false);
  const wantsMic = useRef(false);
  const captureLimit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechGeneration = useRef(0);
  const voiceEnabled = useRef(voice);
  voiceEnabled.current = voice;
  const mounted = useRef(true);
  const busy = useRef(false);
  const bridge = useLaraBridge();
  const training = useOptionalTraining();
  const emitTraining = training?.emit;
  // Each line waits for the one before it, so a line never cuts off another.
  const speechQueue = useRef<Promise<void>>(Promise.resolve());
  /** Lines LARA repeats (the wake reply, follow-up prompts, sign-offs, fixed lines), synthesized once. */
  const phraseClips = useRef(new Map<string, Promise<SpeechClip>>());

  const authed = useCallback(
    (path: string, init: RequestInit = {}) => {
      if (!mission) throw new Error("The mission is not ready yet");
      return fetch(`/api/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${mission.token}`, ...init.headers },
      });
    },
    [mission],
  );

  const sharedMode = shared !== undefined;
  const missionId = mission?.id;
  useEffect(() => {
    if (sharedMode) setStatus(missionId ? "idle" : "starting");
    seenReasons.current = null;
  }, [sharedMode, missionId]);

  useEffect(() => {
    if (shared !== undefined) return;
    let cancelled = false;
    const scenario = new URLSearchParams(window.location.search).get("scenario");
    fetch("/api/copilot/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario ? { scenario } : {}),
    })
      .then((r) => json<{ id: string; token: string }>(r))
      .then((m) => {
        if (cancelled) return;
        setMission({ id: m.id, token: m.token });
        setStatus("idle");
      })
      .catch(
        (e: Error) =>
          !cancelled && setError(failure("LARA did not start", e, "Reload the page to try again.")),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = useRef<MissionSnapshot | null>(null);
  const store = useCallback((next: MissionSnapshot) => {
    latest.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    if (sharedMode || !mission) return null;
    const next = await json<MissionSnapshot>(await authed(`missions/${mission.id}`));
    store(next);
    setPolledAt(Date.now());
    return next;
  }, [authed, mission, sharedMode, store]);

  const synthesize = useCallback(
    async (text: string) => {
      if (!mission) throw new Error("The mission is not ready yet");
      const response = await authed(`copilot/${mission.id}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timestamps: true }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error("LARA's voice is unavailable");
      const result = timedSpeechSchema.parse(await response.json());
      const bytes = Uint8Array.from(atob(result.audio_base64), (character) =>
        character.charCodeAt(0),
      );
      return {
        audio: new Blob([bytes], { type: "audio/mpeg" }),
        text,
        alignment: result.normalized_alignment ?? result.alignment ?? null,
      };
    },
    [authed, mission],
  );

  const phraseClip = useCallback(
    (text: string) => {
      const cached = phraseClips.current.get(text);
      if (cached) return cached;
      const clip = synthesize(text);
      phraseClips.current.set(text, clip);
      clip.catch(() => phraseClips.current.delete(text));
      return clip;
    },
    [synthesize],
  );

  const play = useCallback(async (clip: SpeechClip) => {
    const text = displaySpeechText(clip.text);
    const url = URL.createObjectURL(clip.audio);
    audio.current?.pause();
    const player = new Audio(url);
    player.playbackRate = 1.4;
    player.preservesPitch = true;
    audio.current = player;
    const id = ++replyId.current;
    let frame = 0;
    let last = "";
    const update = () => {
      const visibleText = spokenText(clip.text, clip.alignment, player.currentTime);
      if (visibleText !== last) {
        last = visibleText;
        setReply({ id, text, visibleText, speaking: true });
      }
      frame = requestAnimationFrame(update);
    };
    setReply({ id, text, visibleText: clip.alignment ? "" : text, speaking: true });
    try {
      await new Promise<void>((resolve, reject) => {
        // A clip cut off by the next one (an alert over a follow-up prompt) must still resolve.
        player.onended = player.onpause = () => resolve();
        player.onerror = () =>
          reject(new Error("LARA's audio could not play. Read the reply below."));
        player.onplaying = () => {
          cancelAnimationFrame(frame);
          update();
        };
        player
          .play()
          .catch(() => reject(new Error("Audio playback was blocked. Read the reply below.")));
      });
    } finally {
      cancelAnimationFrame(frame);
      player.onplaying = player.onended = player.onpause = player.onerror = null;
      URL.revokeObjectURL(url);
      if (audio.current === player) audio.current = null;
      setReply((current) =>
        current?.id === id ? { ...current, visibleText: text, speaking: false } : current,
      );
    }
  }, []);

  const enqueueSpeech = useCallback(
    (clip: Promise<SpeechClip>) => {
      const generation = speechGeneration.current;
      const readyClip = clip.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      const spoken = speechQueue.current.then(async () => {
        const result = await readyClip;
        if (!mounted.current || generation !== speechGeneration.current || !voiceEnabled.current)
          return;
        if ("error" in result) throw result.error;
        setStatus("speaking");
        try {
          await play(result.value);
        } finally {
          if (!busy.current) setStatus("idle");
        }
      });
      speechQueue.current = spoken.catch(() => {});
      return spoken;
    },
    [play],
  );

  const speak = useCallback(
    async (speech: string) => {
      const text = displaySpeechText(speech);
      const id = ++replyId.current;
      if (!mission || !voice) {
        setReply({ id, text, visibleText: text, speaking: false });
        return;
      }
      try {
        await enqueueSpeech(synthesize(speech));
        if (!voiceEnabled.current) setReply({ id, text, visibleText: text, speaking: false });
      } catch (error) {
        setReply({ id, text, visibleText: text, speaking: false });
        throw error;
      }
    },
    [enqueueSpeech, mission, synthesize, voice],
  );

  /** Says one of the app's fixed lines at once, keeping its clip for the next time. */
  const say = useCallback(
    (speech: string) => {
      const text = displaySpeechText(speech);
      setTurns((t) => [...t, { role: "assistant", content: text }]);
      if (!mission || !voice) {
        setReply({ id: ++replyId.current, text, visibleText: text, speaking: false });
        return;
      }
      enqueueSpeech(phraseClip(speech)).catch(() => {
        setReply({ id: ++replyId.current, text, visibleText: text, speaking: false });
        setError("LARA's voice is unavailable. Read the reply or try again.");
      });
    },
    [enqueueSpeech, mission, phraseClip, voice],
  );

  useEffect(() => bridge.speaker(say), [bridge, say]);

  // A gap between actions lets React render the last one, so the next handler sees its result.
  const runActions = useCallback(
    async (actions: LaraAction[]) => {
      for (const [index, action] of actions.entries()) {
        if (index > 0) await afterRender();
        if (!bridge.run(action))
          throw new Error(
            `I could not carry out ${action.type.replaceAll("_", " ")}. The requested view or action is not available yet. Try again when the map is ready.`,
          );
      }
    },
    [bridge],
  );

  const ask = useCallback(
    async (
      input: { question: string } | { alert: { code: string; detail?: string } },
      via: AskVia = "text",
    ) => {
      if (busy.current) return;
      // The training command is handled here, without the model or the mission session, so it
      // works the same every time.
      const command = "question" in input && training && parseTrainingCommand(input.question);
      if (command) {
        const before = training.state.status;
        if (command === "activate") training.restart();
        else training.dismiss();
        setTurns((t) => [...t, { role: "user", content: input.question }]);
        say(trainingCommandLine(command, before));
        return;
      }
      if (!mission) return;
      busy.current = true;
      if ("question" in input) emitTraining?.({ type: "lara_asked", via });
      setError(null);
      const userTurn: Turn =
        "question" in input
          ? { role: "user", content: input.question }
          : { role: "user", content: `Alert: ${input.alert.code}`, alert: true };
      const history = turns
        .filter((t) => !t.alert)
        .slice(-HISTORY_TURNS)
        .map(({ role, content }) => ({ role, content }));
      setTurns((t) => [...t, userTurn]);
      setStatus("thinking");
      try {
        const answer = await json<AskReply>(
          await authed(`copilot/${mission.id}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, history, context: bridge.context() }),
          }),
        );
        try {
          await runActions(answer.actions ?? []);
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : "I could not complete the requested action. Please try again.";
          setError(message);
          setTurns((turns) => [...turns, { role: "assistant", content: message }]);
          await speak(message);
          return;
        }
        setTurns((t) => [
          ...t,
          { role: "assistant", content: displaySpeechText(answer.text), alert: userTurn.alert },
        ]);
        await speak(answer.text);
      } catch (e) {
        setError(failure("LARA did not answer", e, "Ask again."));
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    },
    [authed, bridge, emitTraining, mission, runActions, say, speak, training, turns],
  );

  // Voice/history changes must not re-announce a finding from the same snapshot.
  const askRef = useRef(ask);
  askRef.current = ask;

  // The expedition provider owns shared polling and out-of-order response protection.
  useEffect(() => {
    if (sharedMode || !mission) return;
    const timer = setInterval(() => void refresh().catch(() => {}), POLL_MS);
    void refresh().catch(() => {});
    return () => clearInterval(timer);
  }, [mission, refresh, sharedMode]);

  useEffect(() => {
    if (!snapshot) return;
    const reasons = new Set(snapshot.state.reasons);
    const seen = seenReasons.current;
    seenReasons.current = reasons;
    if (!seen) return;
    const fresh = [...reasons].find((reason) => !seen.has(reason));
    if (fresh) void askRef.current({ alert: { code: fresh } });
  }, [snapshot]);

  const command = useCallback(
    async (body: Command, label = "Simulation command") => {
      if (!mission) throw new Error("The mission is not ready yet. Wait and try again.");
      if (shared !== undefined) {
        const next = await shared.command(body, label);
        if (!next)
          throw new Error("Command not accepted. Review the mission command status and try again");
        return;
      }
      const current = latest.current ?? (await refresh());
      if (!current) throw new Error("Mission readings are unavailable");
      try {
        const next = await json<MissionSnapshot>(
          await authed(`missions/${mission.id}/commands`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command_id: commandId(),
              expected_revision: current.revision,
              ...body,
            }),
          }),
        );
        store(next);
        setPolledAt(Date.now());
      } catch (e) {
        setError(
          failure(
            "Simulation command not applied",
            e,
            "Wait for current readings, then try again.",
          ),
        );
        void refresh().catch(() => {});
        throw e;
      }
    },
    [authed, mission, refresh, shared, store],
  );

  /** Asks the backend whether the modeled oxygen, energy and time cover a planned return. */
  const assessReturn = useCallback(
    async (body: { at_s: number; route: ReturnRoute }) => {
      if (!mission) throw new Error("The mission is not ready yet");
      return json<ReturnAssessment>(
        await authed(`missions/${mission.id}/assess-return`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    [authed, mission],
  );

  const transcribe = useCallback(
    async (clip: Blob) => {
      if (!mission) throw new Error("The mission is not ready yet");
      setStatus("transcribing");
      const { text } = await json<{ text: string }>(
        await authed(`copilot/${mission.id}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": clip.type.split(";")[0] },
          body: clip,
        }),
      );
      setTranscript(stripWakePhrase(text));
      return text;
    },
    [authed, mission],
  );

  /** Transcribes a recorded question and asks LARA, dropping a leading wake phrase. */
  const askFromAudio = useCallback(
    async (clip: Blob) => {
      if (!mission) return;
      try {
        const question = stripWakePhrase(await transcribe(clip));
        if (question) await ask({ question }, "voice");
        else setStatus("idle");
      } catch (e) {
        setError(failure("Question not transcribed", e, "Ask again, or type the question."));
        setStatus("idle");
      }
    },
    [ask, mission, transcribe],
  );

  const startListening = useCallback(async () => {
    if (!mission || recorder.current || micOpening.current) return;
    wantsMic.current = true;
    micOpening.current = true;
    setError(null);
    setTranscript("");
    audio.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micOpening.current = false;
      // Released while the microphone was opening: nothing to record.
      if (!wantsMic.current) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus("idle");
        return;
      }
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      let stopPreview = () => {};
      void startTranscriptPreview(stream, setTranscript)
        .then((stop) => {
          if (recorder.current !== r) stop();
          else stopPreview = stop;
        })
        .catch(() => {
          /* Final server transcription still works if the local preview is unavailable. */
        });
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stopPreview();
        clearTimeout(captureLimit.current);
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        if (!mounted.current) return;
        const clip = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (clip.size === 0) setStatus("idle");
        else {
          playHeardCue();
          void askFromAudio(clip);
        }
      };
      recorder.current = r;
      r.start();
      setStatus("listening");
      captureLimit.current = setTimeout(() => recorder.current?.stop(), MAX_PUSH_TO_TALK_MS);
    } catch {
      micOpening.current = false;
      setError(
        "Microphone not available: it is missing, or the browser denied permission. Allow microphone access, or type the question.",
      );
      setStatus("idle");
    }
  }, [askFromAudio, mission]);

  const stopListening = useCallback(() => {
    wantsMic.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const stopSpeaking = useCallback(() => {
    speechGeneration.current++;
    audio.current?.pause();
  }, []);
  useEffect(() => {
    if (!voice) stopSpeaking();
  }, [voice, stopSpeaking]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      speechGeneration.current++;
      wantsMic.current = false;
      clearTimeout(captureLimit.current);
      audio.current?.pause();
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  const prefetchSignOffs = () => {
    if (voice) SIGN_OFFS.forEach(phraseClip);
  };
  /** Plays a short phrase. Resolves once it has finished, or at once with the voice off. */
  const sayPhrase = async (text: string) => {
    if (!voice) return;
    try {
      // Queued, so a phrase never cuts off a fixed line or an answer still playing.
      await enqueueSpeech(phraseClip(text));
    } catch {
      // Without the clip, LARA skips the phrase and keeps going.
    }
  };

  const lastPhrase = useRef<string | null>(null);
  const wakeTurnSteps: WakeTurnSteps = {
    waitForAskDone: async () => {
      while (busy.current) await new Promise((r) => setTimeout(r, ASK_DONE_CHECK_MS));
    },
    transcribe,
    ask: (question) => ask({ question }, "wake_word"),
    say: sayPhrase,
    choose: (phrases) => (lastPhrase.current = pickPhrase(phrases, lastPhrase.current)),
  };

  /** Handlers for the on-device wake word, which captures the question itself. */
  const wakeHandlers = {
    onAcknowledge: async () => {
      setError(null);
      setStatus("speaking");
      await sayPhrase(WAKE_REPLY);
    },
    onCapturing: () => {
      audio.current?.pause();
      setTranscript("");
      setStatus("listening");
      prefetchSignOffs();
    },
    onTranscript: setTranscript,
    onUtterance: async (clip: Blob): Promise<AfterUtterance> => {
      playHeardCue();
      try {
        const next = await answerWakeQuestion(clip, wakeTurnSteps);
        if (next === "end") setStatus("idle");
        return next;
      } catch (e) {
        setError(
          failure("LARA did not answer", e, 'Say "Hey Lara" to ask again, or type the question.'),
        );
        setStatus("idle");
        return "end";
      }
    },
    onNoSpeech: () => setStatus("idle"),
  };

  return {
    ready: Boolean(mission),
    snapshot,
    polledAt,
    // Paused missions poll less often; use the owner's link health, not the demo interval.
    readingsStale: shared === undefined ? undefined : shared.link !== "live",
    turns,
    status,
    transcript,
    reply,
    dismissReply: () => setReply(null),
    stopSpeaking,
    error,
    voice,
    setVoice,
    ask,
    command,
    assessReturn,
    startListening,
    stopListening,
    wakeHandlers,
  };
}

function afterRender(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ACTION_GAP_MS));
}

/** `crypto.randomUUID` exists only in secure contexts (HTTPS/localhost); LAN-IP dev over HTTP lacks it. */
function commandId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
