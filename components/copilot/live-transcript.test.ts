import { describe, expect, it } from "vitest";
import { LiveTranscript } from "./live-transcript";

describe("live transcript", () => {
  it("replaces partial hypotheses without duplicating words", () => {
    const transcript = new LiveTranscript();
    expect(transcript.partial("how much")).toBe("how much");
    expect(transcript.partial("how much oxygen")).toBe("how much oxygen");
    expect(transcript.final("how much oxygen")).toBe("how much oxygen");
    expect(transcript.partial("do we have")).toBe("how much oxygen do we have");
    expect(transcript.final("do we have")).toBe("how much oxygen do we have");
  });
  it("removes the wake phrase and starts fresh for each capture", () => {
    const transcript = new LiveTranscript();
    expect(transcript.partial("hey lara")).toBe("");
    expect(transcript.final("lara how much oxygen")).toBe("how much oxygen");
    expect(new LiveTranscript().partial("what about battery")).toBe("what about battery");
  });
});
