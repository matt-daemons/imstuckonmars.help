import { describe, expect, it } from "vitest";
import { readTimedSpeech } from "./timed-speech";

describe("timestamped speech boundary", () => {
  it("preserves bounded audio and provider timing", async () => {
    const speech = {
      audio_base64: "YQ==",
      alignment: {
        characters: ["A"],
        character_start_times_seconds: [0],
        character_end_times_seconds: [0.2],
      },
    };
    expect(await readTimedSpeech(Response.json(speech))).toEqual(speech);
  });

  it("rejects malformed timing and invalid audio", async () => {
    await expect(readTimedSpeech(Response.json({ audio_base64: "not audio!" }))).rejects.toThrow();
    await expect(
      readTimedSpeech(
        Response.json({
          audio_base64: "YQ==",
          alignment: {
            characters: ["A"],
            character_start_times_seconds: [],
            character_end_times_seconds: [],
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("cancels oversized streams before decoding JSON", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10_000_001));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readTimedSpeech(new Response(body))).rejects.toThrow("exceeds limit");
    expect(cancelled).toBe(true);
  });
});
