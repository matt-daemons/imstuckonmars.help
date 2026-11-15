/** Where the Space key was pressed, for push-to-talk. */
export type SpaceTarget =
  /** A text field: Space types a space and never talks. */
  | "text"
  /** A control that Space activates: a tap still activates it, a hold talks. */
  | "control"
  /** Anywhere else: Space talks at once. */
  | "free";

/** A press on a control longer than this is a hold, which talks; a shorter one is a tap. */
export const HOLD_MS = 250;

const TEXT = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
const CONTROL =
  "button, a[href], summary, [role=button], [role=tab], [role=radio], [role=checkbox], " +
  "[role=switch], [role=link], [role=menuitem], [role=option]";

/** What the focused element does with Space, and the control to activate on a tap. */
export function spaceTarget(target: EventTarget | null): {
  kind: SpaceTarget;
  control: HTMLElement | null;
} {
  if (!(target instanceof HTMLElement)) return { kind: "free", control: null };
  if (target.closest(TEXT)) return { kind: "text", control: null };
  const control = target.closest<HTMLElement>(CONTROL);
  return control ? { kind: "control", control } : { kind: "free", control: null };
}

interface Actions {
  start: () => void;
  stop: () => void;
  /** Activates the control a tap was meant for, as Space would have. */
  activate: (control: HTMLElement) => void;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * Space as push-to-talk that does not fight the page: a press on a control waits HOLD_MS before
 * talking, and a release before then activates the control instead. Every release ends a talk,
 * wherever focus has moved meanwhile. Methods return true when the key event is handled here, so
 * the caller can stop the browser's default.
 */
export class PushToTalk {
  private state:
    | { kind: "idle" }
    | { kind: "pending"; control: HTMLElement; timer: Timer }
    | { kind: "talking" } = { kind: "idle" };

  constructor(
    private readonly actions: Actions,
    // Wrapped: browsers throw "Illegal invocation" when setTimeout is called as a method.
    private readonly schedule: (fn: () => void, ms: number) => Timer = (fn, ms) =>
      setTimeout(fn, ms),
    private readonly cancel: (timer: Timer) => void = (timer) => clearTimeout(timer),
  ) {}

  /** Space went down. `canTalk` is false while LARA is busy answering. */
  down(target: { kind: SpaceTarget; control: HTMLElement | null }, canTalk: boolean): boolean {
    // Repeats of a held key belong to the press already in progress.
    if (this.state.kind !== "idle") return true;
    if (target.kind === "text") return false;
    // While LARA is busy, Space still never scrolls the page; a focused control keeps its own Space.
    if (!canTalk) return target.kind === "free";
    if (target.kind === "free" || !target.control) {
      this.talk();
      return true;
    }
    const timer = this.schedule(() => this.talk(), HOLD_MS);
    this.state = { kind: "pending", control: target.control, timer };
    return true;
  }

  /** Space came up. */
  up(): boolean {
    const state = this.state;
    this.state = { kind: "idle" };
    if (state.kind === "pending") {
      this.cancel(state.timer);
      this.actions.activate(state.control);
      return true;
    }
    if (state.kind === "talking") {
      this.actions.stop();
      return true;
    }
    return false;
  }

  /** The key release may never arrive, for example when the window loses focus: end any press. */
  abandon(): void {
    const state = this.state;
    this.state = { kind: "idle" };
    if (state.kind === "pending") this.cancel(state.timer);
    if (state.kind === "talking") this.actions.stop();
  }

  private talk() {
    this.state = { kind: "talking" };
    this.actions.start();
  }
}
