import type { DestinationFacts, LaraContext } from "../../lib/copilot/lara-context";
import { uiActionRecorder } from "./ui-actions";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Only explicit travel requests qualify. Questions about a site's properties are read-only. */
export function requestedDestination(
  question: string,
  destinations: DestinationFacts[],
): DestinationFacts | null {
  const text = normalize(question)
    .replace(/\b(?:um|uh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(?:not|dont|never|instead|or|if)\b/.test(text)) return null;
  const request = text.match(
    /^(?:lara )?(?:please )?(?:(?:can|could|would|will) (?:we|you) |lets |let us |i want to |id like to )?(?:go|travel|drive|head|navigate|route|take)(?: me| us)? to (.+)$/,
  );
  if (!request) return null;
  const destinationText = request[1]
    .replace(/^the /, "")
    .replace(/ please$/, "")
    .replace(/ in arcadia planitia$/, "");
  const matches = destinations.filter((site) => {
    const name = normalize(site.title)
      .replace(/^possible /, "")
      .replace(/ in arcadia planitia$/, "");
    return name.length > 0 && (destinationText === name || destinationText === `possible ${name}`);
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Uses the same validated selection action as the model; never starts an expedition. */
export function answerDestinationRequest(question: string, context: LaraContext) {
  if (context.route_plan.status !== "present") return null;
  const destination = requestedDestination(question, context.route_plan.value.destinations);
  if (!destination) return null;
  const recorder = uiActionRecorder(context);
  const receipt = recorder.record("select_destination", { number: destination.number });
  if (!receipt.done) return null;
  return {
    text: `Planning a route to ${destination.title}.`,
    actions: recorder.actions,
    tools: [{ name: "select_destination", args: { number: destination.number } }],
    model: null,
  };
}
