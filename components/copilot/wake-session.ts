/**
 * Only final results are trusted: partial hypotheses briefly match "lara" on unrelated speech,
 * while the final result for the same audio is "[unk]".
 */
const WAKE_PHRASE = /\b(hey|okay) lara\b/;
/** Words after the wake phrase mean the question was asked in the same breath. */
const WAKE_WITH_QUESTION = /\b(hey|okay) lara \S/;

export const COOLDOWN_MS = 2500;
export const SPEECH_RMS = 0.02;
export const END_SILENCE_MS = 900;
export const NO_SPEECH_MS = 5000;
export const MAX_CAPTURE_MS = 15000;

/** What to do once a captured question has been handled. */
export type AfterUtterance = "follow-up" | "end";

export interface WakeHandlers {
  /** Called when the wake phrase is heard alone; resolve once the reply has finished playing. */
  onAcknowledge: () => Promise<void>;
  /** Called when the question is being captured. */
  onCapturing: () => void;
  /**
   * The captured question as WAV, including any wake phrase spoken in the same breath. Resolve
   * once LARA has finished replying: "follow-up" captures the next question without the wake
   * word, "end" goes back to waiting for it.
   */
  onUtterance: (wav: Blob) => Promise<AfterUtterance>;
  /** Capture ended without speech, which also ends a follow-up conversation. */
  onNoSpeech: () => void;
}

export interface WakeSessionOptions {
  /** The current handlers and whether LARA is busy, read at the moment they are needed. */
  current: () => WakeHandlers & { paused: boolean };
  /** Turns captured frames into the clip handed to `onUtterance`. */
  encode: (chunks: Float32Array[]) => Blob;
  /** Frames of audio kept before a wake phrase, so a question in the same breath is not lost. */
  maxRecentChunks: number;
  /** Told when a follow-up conversation (listening without the wake word) starts or ends. */
  onConversationChange: (active: boolean) => void;
  now?: () => number;
}

interface Capture {
  chunks: Float32Array[];
  started: number;
  spokeAt: number | null;
}

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);

/**
 * The wake word's listening logic without the browser audio around it: waits for a wake phrase,
 * captures one question per turn, and keeps capturing while `onUtterance` asks for a follow-up.
 * The microphone is ignored while a handler runs, so LARA's own reply is never captured.
 */
export class WakeSession {
  private recent: Float32Array[] = [];
  private capture: Capture | null = null;
  private lastWake = -Infinity;
  private handlerRunning = false;
  private conversing = false;
  private stopped = false;
  private readonly now: () => number;

  constructor(private readonly options: WakeSessionOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Takes one microphone frame. Returns true when the frame should go to the wake recognizer. */
  hearFrame(frame: Float32Array): boolean {
    if (this.capture) {
      this.recordFrame(this.capture, frame);
      return false;
    }
    if (this.handlerRunning || this.options.current().paused) return false;
    this.recent.push(frame);
    if (this.recent.length > this.options.maxRecentChunks) this.recent.shift();
    return true;
  }

  /** Takes one final recognizer result. */
  hearResult(text: string): void {
    const heard = this.recent;
    this.recent = [];
    if (!this.isListeningForWake() || !WAKE_PHRASE.test(text)) return;
    const now = this.now();
    if (now - this.lastWake < COOLDOWN_MS) return;
    this.lastWake = now;
    if (WAKE_WITH_QUESTION.test(text)) this.startCapture(heard, now);
    else void this.acknowledgeThenCapture();
  }

  stop(): void {
    this.stopped = true;
    this.capture = null;
    this.setConversing(false);
  }

  private isListeningForWake(): boolean {
    return !this.capture && !this.handlerRunning && !this.options.current().paused;
  }

  private async acknowledgeThenCapture() {
    await this.runHandler(() => this.options.current().onAcknowledge());
    if (!this.stopped) this.startCapture([], null);
  }

  private startCapture(chunks: Float32Array[], spokeAt: number | null) {
    this.capture = { chunks, started: this.now(), spokeAt };
    this.options.current().onCapturing();
  }

  private recordFrame(capture: Capture, frame: Float32Array) {
    const now = this.now();
    capture.chunks.push(frame);
    if (rms(frame) > SPEECH_RMS) capture.spokeAt = now;
    const { started, spokeAt } = capture;
    const finished =
      (spokeAt !== null && now - spokeAt > END_SILENCE_MS) ||
      (spokeAt === null && now - started > NO_SPEECH_MS) ||
      now - started > MAX_CAPTURE_MS;
    if (finished) void this.finishCapture(capture);
  }

  private async finishCapture({ chunks, spokeAt }: Capture) {
    this.capture = null;
    if (spokeAt === null) {
      this.setConversing(false);
      this.options.current().onNoSpeech();
      return;
    }
    const wav = this.options.encode(chunks);
    const next = await this.runHandler(() => this.options.current().onUtterance(wav));
    if (this.stopped) return;
    if (next !== "follow-up") {
      this.setConversing(false);
      return;
    }
    this.setConversing(true);
    this.startCapture([], null);
  }

  /** Runs a handler with the microphone ignored. A failed handler ends the conversation. */
  private async runHandler<T>(handler: () => Promise<T>): Promise<T | "end"> {
    this.handlerRunning = true;
    try {
      return await handler();
    } catch {
      return "end";
    } finally {
      this.handlerRunning = false;
      this.recent = [];
    }
  }

  private setConversing(active: boolean) {
    if (this.conversing === active) return;
    this.conversing = active;
    this.options.onConversationChange(active);
  }
}
