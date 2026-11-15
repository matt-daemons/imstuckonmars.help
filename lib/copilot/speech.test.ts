import { describe, expect, it } from "vitest";
import {
  displaySpeechText,
  laraLauncherText,
  recentWords,
  speechAlignmentSchema,
  spokenText,
} from "./speech";

describe("voice display", () => {
  it("omits speech tags and delivery cues without removing text or citations", () => {
    expect(displaySpeechText('Leave earlier. <break time="1.2s" /> Anything else?')).toBe(
      "Leave earlier. Anything else?",
    );
    expect(
      displaySpeechText(
        '<speak><prosody rate="slow">Use <say-as interpret-as="characters">O2</say-as>.</prosody><mark name="end"/></speak>',
      ),
    ).toBe("Use O2.");
    expect(displaySpeechText("Ready. [short pause] [sighs] Continue [1].")).toBe(
      "Ready. Continue [1].",
    );
    expect(displaySpeechText("Battery < 20 Wh and reserve > 10 Wh.")).toBe(
      "Battery < 20 Wh and reserve > 10 Wh.",
    );
  });
  it("never reveals partial tags from timestamped speech", () => {
    const text = 'Ready. <break time="1.2s" /> Anything else?';
    const alignment = {
      characters: [...text],
      character_start_times_seconds: [...text].map((_, i) => i),
      character_end_times_seconds: [...text].map((_, i) => i + 1),
    };
    for (let time = 0; time < text.length; time++) {
      const visible = spokenText(text, alignment, time);
      expect(visible).not.toMatch(/[<>]|break|time=|1\.2s/);
    }
    expect(spokenText(text, null, 0)).toBe("Ready. Anything else?");
    expect(spokenText(text, alignment, text.length)).toBe("Ready. Anything else?");
  });
  const alignment = {
    characters: [..."Hi Mars"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.5, 0.6, 0.7, 0.8],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.6, 0.7, 0.8, 0.9],
  };
  it("reveals words using playback time and never guesses when timestamps are absent", () => {
    expect(spokenText("Hi Mars", alignment, -1)).toBe("");
    expect(spokenText("Hi Mars", alignment, 0.05)).toBe("Hi");
    expect(spokenText("Hi Mars", alignment, 0.3)).toBe("Hi");
    expect(spokenText("Hi Mars", alignment, 0.2)).toBe("Hi");
    expect(spokenText("Hi Mars", alignment, 0.5)).toBe("Hi Mars");
    expect(spokenText("Hi Mars", null, 0)).toBe("Hi Mars");
  });
  it("rejects misaligned or backward timing arrays", () => {
    expect(speechAlignmentSchema.safeParse(alignment).success).toBe(true);
    expect(speechAlignmentSchema.safeParse({ ...alignment, characters: ["H"] }).success).toBe(
      false,
    );
    expect(
      speechAlignmentSchema.safeParse({
        ...alignment,
        character_start_times_seconds: [2, 0.1, 0.2, 0.5, 0.6, 0.7, 0.8],
      }).success,
    ).toBe(false);
  });
  it("keeps only three recent words and distinguishes wake, capture and thinking", () => {
    expect(recentWords(" how much oxygen is left ")).toBe("oxygen is left");
    expect(laraLauncherText("idle", "", "listening")).toBe('Say "Hey Lara"');
    expect(laraLauncherText("listening", "", "paused")).toBe("Listening…");
    expect(laraLauncherText("listening", "how much oxygen is left", "paused")).toBe(
      "… oxygen is left",
    );
    expect(laraLauncherText("thinking", "old text", "paused")).toBe("Thinking");
    expect(laraLauncherText("idle", "", "follow-up")).toBe("Listening…");
  });
});
