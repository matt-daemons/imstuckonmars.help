"use client";

import { useEffect, useRef, useState } from "react";
import type { Model } from "vosk-browser";

/** About 41 MB, fetched once per page load. Too large for Workers static assets. */
const MODEL_URL =
  process.env.NEXT_PUBLIC_VOSK_MODEL_URL ??
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

/** Restricting the grammar to the wake phrase keeps recognition cheap and false triggers rare. */
const GRAMMAR = JSON.stringify(["hey lara", "okay lara", "[unk]"]);
/**
 * Only final results are trusted: partial hypotheses briefly match "lara" on unrelated speech,
 * while the final result for the same audio is "[unk]".
 */
const WAKE_PHRASE = /\b(hey|okay) lara\b/;
/** Words after the wake phrase mean the question was asked in the same breath. */
const WAKE_WITH_QUESTION = /\b(hey|okay) lara \S/;

const COOLDOWN_MS = 2500;
const SPEECH_RMS = 0.02;
const END_SILENCE_MS = 1200;
const NO_SPEECH_MS = 5000;
const MAX_CAPTURE_MS = 15000;
const OUTPUT_RATE = 16000;

export type WakeState = "off" | "loading" | "listening" | "paused" | "error";

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

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);

export interface WakeHandlers {
  /** Called when the wake phrase is heard alone; resolve once the reply has finished playing. */
  onAcknowledge: () => Promise<void>;
  /** Called when the question is being captured. */
  onCapturing: () => void;
  /** The captured question as WAV, including any wake phrase spoken in the same breath. */
  onUtterance: (wav: Blob) => void;
  /** Capture ended without speech. */
  onNoSpeech: () => void;
}

/**
 * Listens on-device for "hey LARA" with Vosk (WebAssembly), then captures the question from the
 * same microphone stream. No audio leaves the browser until a question is captured.
 * While `paused` is true (LARA busy), recognition results are ignored.
 */
export function useWakeWord(options: { enabled: boolean; paused: boolean } & WakeHandlers) {
  const [state, setState] = useState<WakeState>("off");
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
        const maxChunks = Math.ceil((MAX_CAPTURE_MS / 1000) * (rate / 4096));

        // Audio since the last final result, so a question spoken with the wake phrase is kept.
        let recent: Float32Array[] = [];
        let capture: { chunks: Float32Array[]; started: number; spokeAt: number | null } | null =
          null;
        let lastWake = 0;

        const finishCapture = () => {
          if (!capture) return;
          const { chunks, spokeAt } = capture;
          capture = null;
          if (spokeAt === null) latest.current.onNoSpeech();
          else latest.current.onUtterance(encodeWav(chunks, rate));
        };

        const startCapture = (chunks: Float32Array[], spokeAt: number | null) => {
          capture = { chunks, started: Date.now(), spokeAt };
          latest.current.onCapturing();
        };

        recognizer.on("result", (m) => {
          if (m.event !== "result") return;
          const text = m.result.text;
          const heard = recent;
          recent = [];
          const now = Date.now();
          if (capture || latest.current.paused || !WAKE_PHRASE.test(text)) return;
          if (now - lastWake < COOLDOWN_MS) return;
          lastWake = now;
          if (WAKE_WITH_QUESTION.test(text)) {
            startCapture(heard, now);
          } else {
            void latest.current.onAcknowledge().then(() => !stopped && startCapture([], null));
          }
        });

        const source = context.createMediaStreamSource(stream);
        // ScriptProcessorNode is deprecated but is what vosk-browser's waveform API expects.
        const processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const frame = new Float32Array(event.inputBuffer.getChannelData(0));
          if (capture) {
            const now = Date.now();
            capture.chunks.push(frame);
            if (rms(frame) > SPEECH_RMS) capture.spokeAt = now;
            const { started, spokeAt } = capture;
            if (
              (spokeAt !== null && now - spokeAt > END_SILENCE_MS) ||
              (spokeAt === null && now - started > NO_SPEECH_MS) ||
              now - started > MAX_CAPTURE_MS
            )
              finishCapture();
            return;
          }
          if (latest.current.paused) return;
          recent.push(frame);
          if (recent.length > maxChunks) recent.shift();
          recognizer.acceptWaveform(event.inputBuffer);
        };
        source.connect(processor);
        processor.connect(context.destination);
        setState("listening");
        cleanup = () => {
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

  return state === "listening" && options.paused ? "paused" : state;
}
