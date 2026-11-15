"use client";

import { useEffect, useRef, useState } from "react";
import type { Model } from "vosk-browser";

import { MAX_CAPTURE_MS, WakeSession, type WakeHandlers } from "./wake-session";

export type { AfterUtterance, WakeHandlers } from "./wake-session";

/** About 41 MB, fetched once per page load. Too large for Workers static assets. */
const MODEL_URL =
  process.env.NEXT_PUBLIC_VOSK_MODEL_URL ??
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

/** Restricting the grammar to the wake phrase keeps recognition cheap and false triggers rare. */
const GRAMMAR = JSON.stringify(["hey lara", "okay lara", "[unk]"]);

const FRAME_SAMPLES = 4096;
const OUTPUT_RATE = 16000;

/** `follow-up` listens for the next question without the wake word, after LARA has answered. */
export type WakeState = "off" | "loading" | "listening" | "paused" | "follow-up" | "error";

let modelPromise: Promise<Model> | null = null;
function loadModel() {
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
  latest.current = options;

  useEffect(() => {
    if (!options.enabled) {
      setState("off");
      return;
    }
    let stopped = false;
    let cleanup = () => {};
    setState("loading");

    (async () => {
      try {
        const [model, stream] = await Promise.all([
          loadModel(),
          navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
          }),
        ]);
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const context = new AudioContext();
        const rate = context.sampleRate;
        const recognizer = new model.KaldiRecognizer(rate, GRAMMAR);
        const session = new WakeSession({
          current: () => latest.current,
          encode: (chunks) => encodeWav(chunks, rate),
          maxRecentChunks: Math.ceil((MAX_CAPTURE_MS / 1000) * (rate / FRAME_SAMPLES)),
          onConversationChange: setConversing,
        });

        recognizer.on("result", (m) => {
          if (m.event === "result") session.hearResult(m.result.text);
        });

        const source = context.createMediaStreamSource(stream);
        // ScriptProcessorNode is deprecated but is what vosk-browser's waveform API expects.
        const processor = context.createScriptProcessor(FRAME_SAMPLES, 1, 1);
        processor.onaudioprocess = (event) => {
          const frame = new Float32Array(event.inputBuffer.getChannelData(0));
          if (session.hearFrame(frame)) recognizer.acceptWaveform(event.inputBuffer);
        };
        source.connect(processor);
        processor.connect(context.destination);
        setState("listening");
        cleanup = () => {
          session.stop();
          processor.disconnect();
          source.disconnect();
          recognizer.remove();
          stream.getTracks().forEach((t) => t.stop());
          void context.close();
        };
      } catch {
        if (!stopped) setState("error");
      }
    })();

    return () => {
      stopped = true;
      cleanup();
    };
  }, [options.enabled]);

  if (state !== "listening") return state;
  if (conversing) return "follow-up";
  return options.paused ? "paused" : state;
}
