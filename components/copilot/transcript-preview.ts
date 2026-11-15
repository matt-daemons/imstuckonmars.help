import { LiveTranscript } from "./live-transcript";
import { loadSpeechModel } from "./use-wake-word";

/** On-device provisional text for push-to-talk; never replaces the final server transcript. */
export async function startTranscriptPreview(stream: MediaStream, onText: (text: string) => void) {
  const model = await loadSpeechModel();
  if (!stream.active) return () => {};
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const recognizer = new model.KaldiRecognizer(context.sampleRate);
  const transcript = new LiveTranscript();
  recognizer.on("partialresult", (message) => {
    if (message.event === "partialresult") onText(transcript.partial(message.result.partial));
  });
  recognizer.on("result", (message) => {
    if (message.event === "result") onText(transcript.final(message.result.text));
  });
  processor.onaudioprocess = (event) => recognizer.acceptWaveform(event.inputBuffer);
  source.connect(processor);
  processor.connect(context.destination);
  return () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    recognizer.remove();
    void context.close();
  };
}
