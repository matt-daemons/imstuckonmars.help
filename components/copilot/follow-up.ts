import type { AfterUtterance } from "./wake-session";

/** What LARA says after an answer to a wake-word question, before listening again. */
export const FOLLOW_UP_PROMPTS = [
  "Do you need anything else?",
  "Anything else?",
  "Can I help with anything else?",
  "What else do you need?",
] as const;

/** Silence between the end of an answer and the follow-up prompt, in seconds. */
export const FOLLOW_UP_PAUSE_S = 1.2;

/**
 * The answer and the follow-up prompt as one line to synthesize, with a pause between them. One
 * recording keeps the prompt in the same delivery as the answer; a separate short clip does not.
 * An answer that asks the operator a question already invites a reply, so it gets no prompt.
 */
export function withFollowUp(answer: string, prompt: string): string {
  if (answer.includes("?")) return answer;
  return `${answer} <break time="${FOLLOW_UP_PAUSE_S}s" /> ${prompt}`;
}

/** What LARA says when the operator declines a follow-up, before going back to the wake word. */
export const SIGN_OFFS = ["Okay.", "Standing by."] as const;

const LEADING_WAKE_PHRASE = /^\s*(?:(hey|okay|ok)[\s,]+)?(lara|laura|lora)\b[\s,.!?]*/i;

/** Words that only decline when the rest of the utterance is made of declining words too. */
const DECLINING_WORDS = [
  "no",
  "nope",
  "nah",
  "no thanks",
  "no thank you",
  "nothing",
  "nothing else",
  "nothing more",
  "thats all",
  "thats it",
  "that is all",
  "that is it",
  "thats everything",
  "im good",
  "i am good",
  "im fine",
  "im done",
  "i am done",
  "im all set",
  "all good",
  "all set",
  "were good",
  "we are good",
  "were done",
  "done",
  "stop",
  "stop listening",
  "cancel",
  "goodbye",
  "good bye",
  "bye",
  "bye bye",
  "never mind",
  "nevermind",
  "not now",
  "no more questions",
  "i dont need anything",
  "i dont need anything else",
  "thanks",
  "thank you",
  "thanks a lot",
  "thank you very much",
  "cheers",
];
/** Words allowed around declining words without changing their meaning. */
const FILLER_WORDS = ["okay", "ok", "um", "uh", "oh", "well", "so", "lara", "laura", "please"];
/** Fillers that may only follow a declining word ("that's all for now", "no thanks then"). */
const TRAILING_WORDS = ["for now", "then", "for today", "really", "actually"];

const alternation = (words: readonly string[]) =>
  [...words].sort((a, b) => b.length - a.length).join("|");
const DECLINE = new RegExp(
  `^(?:(?:${alternation(FILLER_WORDS)}) )*(?:${alternation(DECLINING_WORDS)})` +
    `(?: (?:${alternation([...DECLINING_WORDS, ...FILLER_WORDS, ...TRAILING_WORDS])}))*$`,
);

/** Drops a wake phrase spoken in the same breath as the question ("Hey LARA, what's…"). */
export function stripWakePhrase(text: string): string {
  return text.replace(LEADING_WAKE_PHRASE, "").trim();
}

/** Lower case words only: apostrophes vanish ("that's" → "thats"), other punctuation splits words. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * True when a transcribed reply to "Anything else?" means the operator is done, such as "No
 * thanks." or "That's all, LARA". A reply that carries a question ("No, what's the battery
 * level?") is not a decline.
 */
export function isDecline(text: string): boolean {
  return DECLINE.test(normalize(stripWakePhrase(text)));
}

/** What LARA does in one turn of a wake-word conversation. */
export interface WakeTurnSteps {
  /** Resolves once LARA is not answering anything else, such as an alert. */
  waitForAskDone: () => Promise<void>;
  transcribe: (clip: Blob) => Promise<string>;
  /** Resolves once the answer, followed by `followUp`, has been spoken. */
  ask: (question: string, followUp: string) => Promise<void>;
  /** Resolves once the phrase has finished playing, so listening never overlaps LARA's voice. */
  say: (phrase: string) => Promise<void>;
  /** The phrase from `phrases` to say this time. */
  choose: (phrases: readonly string[]) => string;
}

/**
 * Answers a question captured after the wake word, then asks whether the operator needs anything
 * else. Resolves "follow-up" to listen for the next question without the wake word, or "end"
 * after a decline or an empty transcript.
 */
export async function answerWakeQuestion(
  clip: Blob,
  steps: WakeTurnSteps,
): Promise<AfterUtterance> {
  await steps.waitForAskDone();
  const text = await steps.transcribe(clip);
  if (isDecline(text)) {
    await steps.say(steps.choose(SIGN_OFFS));
    return "end";
  }
  const question = stripWakePhrase(text);
  if (!question) return "end";
  await steps.ask(question, steps.choose(FOLLOW_UP_PROMPTS));
  await steps.waitForAskDone();
  return "follow-up";
}

/** A random phrase from `phrases`, never the same as `previous` when there is a choice. */
export function pickPhrase<T extends string>(
  phrases: readonly T[],
  previous: T | null,
  random: () => number = Math.random,
): T {
  const choices = phrases.length > 1 ? phrases.filter((p) => p !== previous) : phrases;
  return choices[Math.floor(random() * choices.length)];
}
