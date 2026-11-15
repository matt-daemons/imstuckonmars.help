"use client";

import { useEffect, useRef, useState } from "react";
import type { KaldiRecognizer, Model } from "vosk-browser";
import { LiveTranscript } from "./live-transcript";

import { MAX_CAPTURE_MS, WakeSession, type WakeHandlers } from "./wake-session";

export type { AfterUtterance, WakeHandlers } from "./wake-session";

/** About 41 MB, fetched once per page load. Too large for Workers static assets. */
const MODEL_URL =
  process.env.NEXT_PUBLIC_VOSK_MODEL_URL ??
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

/** Restricting the grammar to the wake phrase keeps recognition cheap and false triggers rare. */
const GRAMMAR = JSON.stringify(["hey lara", "okay lara", "lara", "[unk]"]);

const FRAME_SAMPLES = 4096;
const OUTPUT_RATE = 16000;

/** `follow-up` listens for the next question without the wake word, after LARA has answered. */
export type WakeState = "off" | "loading" | "listening" | "paused" | "follow-up" | "error";

let modelPromise: Promise<Model> | null = null;
export function loadSpeechModel() {
  modelPromise ??= import("vosk-browser").then(({ createModel }) => createModel(MODEL_URL, -1));
  modelPromise.catch(() => (modelPromise = null));
  return modelPromise;
}

/** Mono 16-bit PCM WAV at 16 kHz, linearly resampled from `rate`. */
export function encodeWav(chunks: Float32Array[], rate: number): Blob {
  const input = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    input.set(c, offset);
    offset += c.length;
  }
  const length = Math.floor((input.length * OUTPUT_RATE) / rate);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (at: number, s: string) =>
    [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, OUTPUT_RATE, true);
  view.setUint32(28, OUTPUT_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const position = (i * rate) / OUTPUT_RATE;
    const j = Math.floor(position);
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    const sample = Math.max(-1, Math.min(1, a + (b - a) * (position - j)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Listens on-device for "hey LARA" with Vosk (WebAssembly), then captures the question from the
 * same microphone stream, and the next questions too while `onUtterance` asks for a follow-up.
 * No audio leaves the browser until a question is captured.
 * While `paused` is true (LARA busy), recognition results are ignored.
 */
export function useWakeWord(options: { enabled: boolean; paused: boolean } & WakeHandlers) {
  const [state, setState] = useState<WakeState>("off");
  const [conversing, setConversing] = useState(false);
  const latest = useRef(options);
  const capture = useRef<WakeSession | null>(null);
  latest.current = options;

  useEffect(() => {
    if (!options.enabled) {
      setState("off");
      return;
    }
    let stopped = false;
    let cleanup = () => {};
    let microphone: MediaStream | undefined;
    setState("loading");

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
        microphone = stream;
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const model = await loadSpeechModel();
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const context = new AudioContext();
        const rate = context.sampleRate;
        const recognizer = new model.KaldiRecognizer(rate, GRAMMAR);
        let transcriptRecognizer: KaldiRecognizer | null = null;
        const startTranscript = () => {
          transcriptRecognizer?.remove();
          const transcript = new LiveTranscript();
          const next = new model.KaldiRecognizer(rate);
          transcriptRecognizer = next;
          next.on("partialresult", (message) => {
            if (
              next !== transcriptRecognizer ||
              !session.isCapturing ||
              message.event !== "partialresult"
            )
              return;
            latest.current.onTranscript?.(transcript.partial(message.result.partial));
          });
          next.on("result", (message) => {
            if (next !== transcriptRecognizer || !session.isCapturing || message.event !== "result")
              return;
            latest.current.onTranscript?.(transcript.final(message.result.text));
          });
        };
        const session = new WakeSession({
          current: () => ({
            ...latest.current,
            onCapturing: (preroll) => {
              startTranscript();
              latest.current.onCapturing();
              for (const frame of preroll ?? [])
                transcriptRecognizer?.acceptWaveformFloat(frame, rate);
            },
          }),
          encode: (chunks) => encodeWav(chunks, rate),
          maxRecentChunks: Math.ceil((MAX_CAPTURE_MS / 1000) * (rate / FRAME_SAMPLES)),
          onConversationChange: setConversing,
        });
        capture.current = session;

        recognizer.on("result", (m) => {
          if (m.event === "result") session.hearResult(m.result.text);
        });

        const source = context.createMediaStreamSource(stream);
        // ScriptProcessorNode is deprecated but is what vosk-browser's waveform API expects.
        const processor = context.createScriptProcessor(FRAME_SAMPLES, 1, 1);
        processor.onaudioprocess = (event) => {
          const frame = new Float32Array(event.inputBuffer.getChannelData(0));
          if (session.hearFrame(frame)) recognizer.acceptWaveform(event.inputBuffer);
          else if (session.isCapturing) transcriptRecognizer?.acceptWaveform(event.inputBuffer);
        };
        source.connect(processor);
        processor.connect(context.destination);
        setState("listening");
        cleanup = () => {
          const wasCapturing = session.isCapturing;
          session.stop();
          if (wasCapturing) latest.current.onNoSpeech();
          capture.current = null;
          processor.disconnect();
          source.disconnect();
          recognizer.remove();
          transcriptRecognizer?.remove();
          transcriptRecognizer = null;
          stream.getTracks().forEach((t) => t.stop());
          void context.close();
        };
      } catch {
        microphone?.getTracks().forEach((track) => track.stop());
        if (!stopped) setState("error");
      }
    })();

    return () => {
      stopped = true;
      cleanup();
      microphone?.getTracks().forEach((track) => track.stop());
    };
  }, [options.enabled]);

  const displayedState =
    state !== "listening" ? state : conversing ? "follow-up" : options.paused ? "paused" : state;
  return { state: displayedState, finish: () => capture.current?.finish() };
}
