import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  END_SILENCE_MS,
  NO_SPEECH_MS,
  WakeSession,
  type AfterUtterance,
  type WakeHandlers,
} from "./wake-session";

const FRAME_MS = 100;
const speech = () => new Float32Array(64).fill(0.1);
const silence = () => new Float32Array(64);

/** A promise the test settles by hand, standing in for LARA's spoken reply. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  let now = 0;
  const conversation: boolean[] = [];
  const replies: ReturnType<typeof deferred<AfterUtterance>>[] = [];
  const acknowledgement = deferred<void>();
  const handlers = {
    paused: false,
    onAcknowledge: vi.fn<WakeHandlers["onAcknowledge"]>(() => acknowledgement.promise),
    onCapturing: vi.fn<WakeHandlers["onCapturing"]>(),
    onUtterance: vi.fn<WakeHandlers["onUtterance"]>(() => {
      const reply = deferred<AfterUtterance>();
      replies.push(reply);
      return reply.promise;
    }),
    onNoSpeech: vi.fn<WakeHandlers["onNoSpeech"]>(),
  };
  const session = new WakeSession({
    current: () => handlers,
    encode: (chunks) => new Blob([`${chunks.length} frames`]),
    maxRecentChunks: 50,
    onConversationChange: (active) => conversation.push(active),
    now: () => now,
  });
  /** Feeds frames for `ms` of audio; returns how many went to the wake recognizer. */
  const hear = (frame: () => Float32Array, ms: number) => {
    let toRecognizer = 0;
    for (let t = 0; t < ms; t += FRAME_MS) {
      now += FRAME_MS;
      if (session.hearFrame(frame())) toRecognizer++;
    }
    return toRecognizer;
  };
  const askQuestion = () => {
    hear(speech, 1000);
    hear(silence, END_SILENCE_MS + FRAME_MS);
  };
  return { session, handlers, conversation, replies, acknowledgement, hear, askQuestion };
}

describe("WakeSession", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("feeds the recognizer until the wake phrase, then acknowledges before capturing", async () => {
    expect(h.hear(silence, 500)).toBe(5);
    h.session.hearResult("hey lara");
    expect(h.handlers.onAcknowledge).toHaveBeenCalledOnce();
    // "Yes?" is playing: the microphone is ignored, so LARA does not hear herself.
    expect(h.hear(speech, 500)).toBe(0);
    expect(h.handlers.onCapturing).not.toHaveBeenCalled();

    h.acknowledgement.settle();
    await flush();
    expect(h.handlers.onCapturing).toHaveBeenCalledOnce();
  });

  it("captures a question asked in the same breath as the wake phrase", () => {
    h.hear(speech, 1000);
    h.session.hearResult("hey lara what is the battery");
    expect(h.handlers.onAcknowledge).not.toHaveBeenCalled();
    expect(h.handlers.onCapturing).toHaveBeenCalledOnce();
    h.hear(silence, END_SILENCE_MS + FRAME_MS);
    expect(h.handlers.onUtterance).toHaveBeenCalledOnce();
  });

  it("accepts LARA alone and preserves same-breath frames for live transcription", () => {
    h.hear(speech, 1000);
    h.session.hearResult("lara what is the battery");
    expect(h.session.isCapturing).toBe(true);
    expect(h.handlers.onCapturing.mock.calls[0][0]).toHaveLength(10);
    h.session.finish();
    expect(h.handlers.onUtterance).toHaveBeenCalledOnce();
    expect(h.session.isCapturing).toBe(false);
  });

  it("acknowledges a standalone LARA without capturing its reply", async () => {
    h.session.hearResult("lara");
    expect(h.handlers.onAcknowledge).toHaveBeenCalledOnce();
    expect(h.session.isCapturing).toBe(false);
    h.acknowledgement.settle();
    await flush();
    expect(h.session.isCapturing).toBe(true);
  });

  it("keeps capturing questions without the wake word while replies ask for a follow-up", async () => {
    h.session.hearResult("hey lara how much oxygen");
    h.askQuestion();
    expect(h.handlers.onUtterance).toHaveBeenCalledTimes(1);

    // LARA answers and says "Anything else?": no capture, no recognizer, until the reply ends.
    expect(h.hear(speech, 2000)).toBe(0);
    expect(h.handlers.onCapturing).toHaveBeenCalledTimes(1);
    h.replies[0].settle("follow-up");
    await flush();
    expect(h.handlers.onCapturing).toHaveBeenCalledTimes(2);
    expect(h.conversation).toEqual([true]);

    // The second question needs no wake word, and no rounds limit applies.
    for (let round = 1; round <= 3; round++) {
      h.askQuestion();
      expect(h.handlers.onUtterance).toHaveBeenCalledTimes(round + 1);
      h.replies[round].settle("follow-up");
      await flush();
    }
    expect(h.handlers.onCapturing).toHaveBeenCalledTimes(5);
    expect(h.conversation).toEqual([true]);
  });

  it("goes back to the wake word when the reply ends the conversation", async () => {
    h.session.hearResult("hey lara status");
    h.askQuestion();
    h.replies[0].settle("follow-up");
    await flush();
    h.askQuestion();
    h.replies[1].settle("end");
    await flush();

    expect(h.conversation).toEqual([true, false]);
    expect(h.handlers.onCapturing).toHaveBeenCalledTimes(2);
    expect(h.hear(silence, 300)).toBe(3);
  });

  it("ends the conversation when nobody speaks within the no-speech window", async () => {
    h.session.hearResult("hey lara status");
    h.askQuestion();
    h.replies[0].settle("follow-up");
    await flush();

    h.hear(silence, NO_SPEECH_MS - FRAME_MS);
    expect(h.handlers.onNoSpeech).not.toHaveBeenCalled();
    h.hear(silence, 2 * FRAME_MS);
    expect(h.handlers.onNoSpeech).toHaveBeenCalledOnce();
    expect(h.conversation).toEqual([true, false]);
    expect(h.hear(silence, 300)).toBe(3);
  });

  it("ignores the wake phrase while a follow-up question is being captured", async () => {
    h.session.hearResult("hey lara status");
    h.askQuestion();
    h.replies[0].settle("follow-up");
    await flush();

    h.session.hearResult("hey lara");
    expect(h.handlers.onAcknowledge).not.toHaveBeenCalled();
    expect(h.handlers.onCapturing).toHaveBeenCalledTimes(2);
  });

  it("treats a failed reply as the end of the conversation", async () => {
    h.session.hearResult("hey lara status");
    h.askQuestion();
    h.replies[0].fail(new Error("offline"));
    await flush();

    expect(h.handlers.onCapturing).toHaveBeenCalledOnce();
    expect(h.hear(silence, 300)).toBe(3);
  });

  it("does not capture again once stopped mid-reply", async () => {
    h.session.hearResult("hey lara status");
    h.askQuestion();
    h.session.stop();
    h.replies[0].settle("follow-up");
    await flush();

    expect(h.handlers.onCapturing).toHaveBeenCalledOnce();
    expect(h.conversation).toEqual([]);
  });

  it("ignores the wake phrase while LARA is busy", () => {
    h.handlers.paused = true;
    expect(h.hear(silence, 300)).toBe(0);
    h.session.hearResult("hey lara");
    expect(h.handlers.onAcknowledge).not.toHaveBeenCalled();
  });
});
