import type { LaraContext } from "../../lib/copilot/lara-context";
import type { LaraAction } from "../../components/copilot/lara-bridge";
import { uiActionRecorder } from "./ui-actions";

/** Handle direct display commands without asking the model to remember an action tool. */
export function answerMapRequest(question: string, context: LaraContext) {
  const text = question
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .trim();
  const request = text.match(
    /^(?:(?:hey )?lara[, ]+)?(?:please )?(?:(?:can|could|would|will) you )?(?:show|display)(?: me| us)? (?:all |the |all the |possible |available )?(?:destinations|destination options|sites)(?: on (?:the )?map)?(?: again| please)?$/,
  );
  if (!request) return null;
  if (context.route_plan.status !== "present" || !context.route_plan.value.destinations.length)
    return {
      text: "The destinations are not available yet. Wait for the map to load, then ask again.",
      actions: [],
      tools: [],
      model: null,
    };
  const recorder = uiActionRecorder(context);
  recorder.record("show_destinations", {});
  return {
    text: "I will show the destinations on the map.",
    actions: recorder.actions,
    tools: [{ name: "show_destinations", args: {} }],
    model: null,
  };
}

/** Model prose is not evidence that the browser received a camera action. */
export function verifyMapActionText(text: string, actions: LaraAction[]): string {
  const claimsMovement =
    /\b(?:i(?:'ve| have)? (?:moved|centered|centred|zoomed|recentered|re-centred|re-centered)|(?:the )?map (?:is |has been )?(?:moved|centered|centred|zoomed)|i (?:am |have )?(?:showing|displaying) (?:you )?(?:the |all )?(?:destinations|sites))\b/i.test(
      text,
    );
  const hasCameraAction = actions.some(
    (action) =>
      action.type === "show_destinations" ||
      action.type === "select_destination" ||
      action.type === "focus_map",
  );
  if (claimsMovement)
    return hasCameraAction
      ? "I will update the map view."
      : "I did not send a map movement command. Please ask me to show the destinations or choose a camera view.";
  return text;
}
