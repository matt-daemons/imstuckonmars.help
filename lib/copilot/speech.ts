import { z } from "zod";

const times = z.array(z.number().finite().nonnegative()).max(16000);
export const speechAlignmentSchema = z
  .object({
    characters: z.array(z.string().min(1).max(16)).max(16000),
    character_start_times_seconds: times,
    character_end_times_seconds: times,
  })
  .refine(
    (value) =>
      value.characters.length === value.character_start_times_seconds.length &&
      value.characters.length === value.character_end_times_seconds.length &&
      value.character_start_times_seconds.every(
        (start, index, all) =>
          start <= value.character_end_times_seconds[index] &&
          (index === 0 || start >= all[index - 1]),
      ),
    "Invalid speech alignment",
  );

export const timedSpeechSchema = z.object({
  audio_base64: z
    .string()
    .min(1)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  alignment: speechAlignmentSchema.nullish(),
  normalized_alignment: speechAlignmentSchema.nullish(),
});
export type SpeechAlignment = z.infer<typeof speechAlignmentSchema>;
export interface SpeechClip {
  audio: Blob;
  text: string;
  alignment: SpeechAlignment | null;
}

/** Reveal whole words at their actual audio start, not a timer-based typing estimate. */
export function spokenText(
  text: string,
  alignment: SpeechAlignment | null,
  seconds: number,
): string {
  if (!alignment?.characters.length) return text;
  let end = 0;
  for (let index = 0; index < alignment.characters.length; index++) {
    if (alignment.character_start_times_seconds[index] > seconds) break;
    if (!/\s/.test(alignment.characters[index])) end = index + 1;
  }
  if (end === 0) return "";
  while (end < alignment.characters.length && !/\s/.test(alignment.characters[end])) end++;
  return alignment.characters.slice(0, end).join("").trimEnd();
}

export function recentWords(text: string, count = 3): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(-count).join(" ");
}

export function laraLauncherText(status: string, transcript: string, wakeState: string): string {
  if (status === "listening")
    return recentWords(transcript) ? `… ${recentWords(transcript)}` : "Listening…";
  if (status === "transcribing") return "Transcribing…";
  if (status === "thinking") return "Thinking";
  if (status === "speaking") return "LARA speaking";
  if (wakeState === "follow-up") return "Listening…";
  if (wakeState === "listening") return 'Say "Hey Lara"';
  if (wakeState === "loading") return "Starting microphone…";
  return "LARA";
}
