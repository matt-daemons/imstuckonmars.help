import { timedSpeechSchema } from "../../lib/copilot/speech";

/** Bound the provider JSON before decoding base64 or timing arrays in a Worker. */
export async function readTimedSpeech(response: Response) {
  if (!response.body) throw new Error("Empty speech response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 10_000_000) {
        await reader.cancel();
        throw new Error("Speech response exceeds limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return timedSpeechSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
