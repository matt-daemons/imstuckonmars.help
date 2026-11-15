const SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"];
const MAX_GAP_MS = 1500;

/** Partial matches expire; held keys and modified keys never advance the code. */
export class ResetCode {
  private keys: string[] = [];
  private lastAt = 0;

  reset() {
    this.keys = [];
  }

  press(
    event: Pick<
      KeyboardEvent,
      "key" | "repeat" | "isComposing" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
    >,
    at: number,
  ): boolean {
    if (
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      this.reset();
      return false;
    }
    if (at - this.lastAt > MAX_GAP_MS) this.reset();
    this.lastAt = at;
    this.keys = [...this.keys, event.key].slice(-SEQUENCE.length);
    if (!SEQUENCE.every((key, index) => key === this.keys[index])) return false;
    this.reset();
    return true;
  }
}
