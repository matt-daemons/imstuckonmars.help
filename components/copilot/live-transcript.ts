import { stripWakePhrase } from "./follow-up";

/** Partial results replace the current hypothesis; final results append one recognized segment. */
export class LiveTranscript {
  private confirmed = "";

  partial(text: string): string {
    return stripWakePhrase(`${this.confirmed} ${text}`.trim());
  }

  final(text: string): string {
    this.confirmed = `${this.confirmed} ${text}`.trim();
    return stripWakePhrase(this.confirmed);
  }
}
