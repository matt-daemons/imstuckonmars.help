import { describe, expect, it } from "vitest";
import { laraLauncherText, recentWords, speechAlignmentSchema, spokenText } from "./speech";

describe("voice display", () => {
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
