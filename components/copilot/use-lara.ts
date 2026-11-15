"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReturnRoute } from "@/lib/mission/types";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  alert?: boolean;
}

/** The subset of GET /api/missions/:id the panel reads. */
interface MissionSnapshot {
  revision: number;
  clock: { mode: "paused" | "playing"; position_s: number; speed: number };
  config: {
    base: { id: string };
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

/** The subset of POST /api/missions/:id/assess-return the route check reads. */
export interface ReturnAssessment {
  status: "modeled_resource_feasible" | "modeled_constraint_violation" | "unknown";
  reasons: string[];
}

type Status = "starting" | "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const WAKE_REPLY = "Yes?";
const LEADING_WAKE_PHRASE = /^\s*(hey|okay|ok)[\s,]+(lara|laura|lora)\b[\s,.!?]*/i;
export const POLL_MS = 2000;
const HISTORY_TURNS = 8;

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

/** Owns one demo mission, its polled snapshot, and the ask → speak loop for LARA. */
export function useLara() {
  const [mission, setMission] = useState<{ id: string; token: string } | null>(null);
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  // When the last poll succeeded (ms since epoch), so readers can tell a stale snapshot.
  const [polledAt, setPolledAt] = useState<number | null>(null);
  const [voice, setVoice] = useState(true);
  const seenReasons = useRef<Set<string> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const busy = useRef(false);

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

  useEffect(() => {
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
      .catch((e: Error) => !cancelled && setError(e.message));
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
    if (!mission) return null;
    const next = await json<MissionSnapshot>(await authed(`missions/${mission.id}`));
    store(next);
    setPolledAt(Date.now());
    return next;
  }, [authed, mission, store]);

  const synthesize = useCallback(
    async (text: string) => {
      if (!mission) throw new Error("The mission is not ready yet");
      const response = await authed(`copilot/${mission.id}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("LARA's voice is unavailable");
      return response.blob();
    },
    [authed, mission],
  );

  const play = useCallback(async (clip: Blob) => {
    const url = URL.createObjectURL(clip);
    audio.current?.pause();
    const player = new Audio(url);
    audio.current = player;
    await new Promise<void>((resolve) => {
      player.onended = player.onerror = () => resolve();
      player.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!mission || !voice) return;
      setStatus("speaking");
      await play(await synthesize(text));
    },
    [mission, play, synthesize, voice],
  );

  const ask = useCallback(
    async (input: { question: string } | { alert: { code: string; detail?: string } }) => {
      if (!mission || busy.current) return;
      busy.current = true;
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
        const answer = await json<{ text: string }>(
          await authed(`copilot/${mission.id}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, history }),
          }),
        );
        setTurns((t) => [...t, { role: "assistant", content: answer.text, alert: userTurn.alert }]);
        await speak(answer.text);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    },
    [authed, mission, speak, turns],
  );

  // Poll the mission; announce any finding that was not present before.
  useEffect(() => {
    if (!mission) return;
    const timer = setInterval(async () => {
      try {
        const next = await refresh();
        if (!next) return;
        const reasons = new Set(next.state.reasons);
        const seen = seenReasons.current;
        seenReasons.current = reasons;
        if (!seen) return;
        const fresh = [...reasons].find((r) => !seen.has(r));
        if (fresh) void ask({ alert: { code: fresh } });
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS);
    void refresh();
    return () => clearInterval(timer);
  }, [mission, refresh, ask]);

  const command = useCallback(
    async (body: Record<string, unknown>) => {
      if (!mission) return;
      const current = latest.current ?? (await refresh());
      if (!current) return;
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
      } catch (e) {
        setError((e as Error).message);
        void refresh();
      }
    },
    [authed, mission, refresh, store],
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

  /** Transcribes a recorded question and asks LARA, dropping a leading wake phrase. */
  const askFromAudio = useCallback(
    async (clip: Blob) => {
      if (!mission) return;
      setStatus("transcribing");
      try {
        const { text } = await json<{ text: string }>(
          await authed(`copilot/${mission.id}/transcribe`, {
            method: "POST",
            headers: { "Content-Type": clip.type.split(";")[0] },
            body: clip,
          }),
        );
        const question = text.replace(LEADING_WAKE_PHRASE, "").trim();
        if (question) await ask({ question });
        else setStatus("idle");
      } catch (e) {
        setError((e as Error).message);
        setStatus("idle");
      }
    },
    [ask, authed, mission],
  );

  const startListening = useCallback(async () => {
    if (!mission || recorder.current) return;
    setError(null);
    audio.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        const clip = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (clip.size === 0) setStatus("idle");
        else void askFromAudio(clip);
      };
      recorder.current = r;
      r.start();
      setStatus("listening");
    } catch {
      setError("The microphone is not available, or the browser denied permission to use it");
      setStatus("idle");
    }
  }, [askFromAudio, mission]);

  const stopListening = useCallback(() => recorder.current?.stop(), []);

  /** Handlers for the on-device wake word, which captures the question itself. */
  const ackClip = useRef<Promise<Blob> | null>(null);
  const wakeHandlers = {
    onAcknowledge: async () => {
      setError(null);
      setStatus("speaking");
      if (!voice) return;
      try {
        ackClip.current ??= synthesize(WAKE_REPLY);
        await play(await ackClip.current);
      } catch {
        ackClip.current = null;
      }
    },
    onCapturing: () => {
      audio.current?.pause();
      setStatus("listening");
    },
    onUtterance: (clip: Blob) => void askFromAudio(clip),
    onNoSpeech: () => setStatus("idle"),
  };

  return {
    ready: Boolean(mission),
    snapshot,
    polledAt,
    turns,
    status,
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

/** `crypto.randomUUID` exists only in secure contexts (HTTPS/localhost); LAN-IP dev over HTTP lacks it. */
function commandId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
