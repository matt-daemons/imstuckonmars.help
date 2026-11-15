import { describe, expect, it } from "vitest";

import {
  answerWakeQuestion,
  isDecline,
  pickPhrase,
  SIGN_OFFS,
  stripWakePhrase,
  type WakeTurnSteps,
} from "./follow-up";

describe("isDecline", () => {
  it.each([
    "no",
    "No.",
    "Nope!",
    "No thanks.",
    "no, thank you",
    "Nothing.",
    "Nothing else, thanks.",
    "That's all.",
    "That’s it, LARA.",
    "that is all for now",
    "I'm good.",
    "I'm good, thank you.",
    "We're good",
    "Stop.",
    "Stop listening",
    "Goodbye!",
    "Bye bye.",
    "Never mind.",
    "No, no.",
    "Okay, that's all, thanks LARA.",
    "Um, no thanks.",
    "Hey LARA, no thanks.",
    "okay lara, I'm done",
    "Thank you.",
    "  NO THANKS  ",
  ])("declines: %s", (text) => {
    expect(isDecline(text)).toBe(true);
  });

  it.each([
    "No, what's the battery level?",
    "No. What's the battery level?",
    "Nothing is wrong with the battery?",
    "Stop the replay.",
    "Is that all?",
    "What's my oxygen reserve?",
    "Thanks, and how long until sunset?",
    "Okay",
    "Hey LARA",
    "",
    "   ",
    "...",
  ])("does not decline: %s", (text) => {
    expect(isDecline(text)).toBe(false);
  });
});

describe("stripWakePhrase", () => {
  it("strips a standalone LARA prefix from the recognized question", () => {
    expect(stripWakePhrase("LARA, how much oxygen?")).toBe("how much oxygen?");
  });
  it("drops a leading wake phrase and its punctuation", () => {
    expect(stripWakePhrase("Hey LARA, what's the dose rate?")).toBe("what's the dose rate?");
    expect(stripWakePhrase("ok laura. battery?")).toBe("battery?");
  });

  it("keeps LARA's name elsewhere in the question", () => {
    expect(stripWakePhrase("Is LARA online?")).toBe("Is LARA online?");
  });
});

describe("pickPhrase", () => {
  it("never repeats the previous phrase", () => {
    for (const previous of SIGN_OFFS) {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        expect(pickPhrase(SIGN_OFFS, previous, () => r)).not.toBe(previous);
      }
    }
  });

  it("can pick any phrase when there is no previous one", () => {
    const picked = new Set([0, 0.26, 0.51, 0.76].map((r) => pickPhrase(SIGN_OFFS, null, () => r)));
    expect(picked.size).toBe(SIGN_OFFS.length);
  });

  it("repeats the only phrase there is", () => {
    expect(pickPhrase(["Okay."], "Okay.", () => 0.5)).toBe("Okay.");
  });
});

describe("answerWakeQuestion", () => {
  /** Steps that log what LARA does, in order. */
  function recordingSteps(transcript: string) {
    const log: string[] = [];
    const steps: WakeTurnSteps = {
      waitForAskDone: async () => void log.push("wait"),
      transcribe: async () => {
        log.push("transcribe");
        return transcript;
      },
      ask: async (question) => void log.push(`ask: ${question}`),
      say: async (phrase) => void log.push(`say: ${phrase}`),
      choose: (phrases) => phrases[0],
    };
    return { log, steps };
  }
  const clip = new Blob(["wav"]);

  it("answers and keeps listening without asking another question", async () => {
    const { log, steps } = recordingSteps("Hey LARA, what's the battery level?");
    await expect(answerWakeQuestion(clip, steps)).resolves.toBe("follow-up");
    expect(log).toEqual(["wait", "transcribe", "ask: what's the battery level?", "wait"]);
  });

  it("signs off and stops listening after a decline", async () => {
    const { log, steps } = recordingSteps("No thanks.");
    await expect(answerWakeQuestion(clip, steps)).resolves.toBe("end");
    expect(log).toEqual(["wait", "transcribe", `say: ${SIGN_OFFS[0]}`]);
  });

  it("asks a question that starts with no", async () => {
    const { log, steps } = recordingSteps("No, what's the battery level?");
    await expect(answerWakeQuestion(clip, steps)).resolves.toBe("follow-up");
    expect(log).toContain("ask: No, what's the battery level?");
  });

  it("stops listening without a word when the transcript is empty", async () => {
    const { log, steps } = recordingSteps("Hey LARA.");
    await expect(answerWakeQuestion(clip, steps)).resolves.toBe("end");
    expect(log).toEqual(["wait", "transcribe"]);
  });
});
