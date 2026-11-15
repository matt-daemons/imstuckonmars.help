"use client";

let context: AudioContext | null = null;

/**
 * Two short rising tones that tell the operator LARA heard the question and is working on it.
 * Synthesized in the browser, so it plays at once and costs no request.
 */
export function playHeardCue() {
  try {
    context ??= new AudioContext();
    // A context made outside a click starts suspended under the browser's autoplay rules.
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    [660, 880].forEach((frequency, i) => {
      const at = start + i * 0.09;
      const tone = context!.createOscillator();
      const gain = context!.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      tone.connect(gain).connect(context!.destination);
      tone.start(at);
      tone.stop(at + 0.09);
    });
  } catch {
    // Without Web Audio the cue is skipped; it only signals progress.
  }
}
