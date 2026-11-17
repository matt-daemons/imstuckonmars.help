import type { DestinationFacts, LaraContext } from "../../lib/copilot/lara-context";
import { uiActionRecorder } from "./ui-actions";
import { compassDirection } from "../../lib/mars/direction";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bbulls? eye\b/g, "bullseye")
    .trim();

/**
 * The HiRISE observation behind each site title, from public/data/processed/sites.geojson (the
 * route plan the browser sends has titles, not ids). destination-request.test.ts keeps the two in step.
 */
export const HIRISE_SITE_TITLES: Record<string, string> = {
  "033225": "Possible Terraced Crater in Arcadia Planitia",
  "034082": "Possible Terraced Bullseye-Like Crater in Arcadia Planitia",
  "037352": "Terraced Bullseye-Like Crater in Arcadia Planitia",
  "054060": "Ridges in Arcadia Planitia",
};

/** The site's own name: no "possible" and no region, which every site shares. */
const siteName = (site: DestinationFacts) =>
  normalize(site.title)
    .replace(/^possible /, "")
    .replace(/ in arcadia planitia$/, "");

/** Singular word stems, so "ridge" matches "Ridges" and "craters" matches "Crater". */
const stems = (text: string) =>
  text
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));

/** Words that say nothing about which site is meant. */
const FILLER = new Set(["the", "a", "an", "site", "destination", "area", "feature", "one"]);

const isCrater = (site: DestinationFacts) => stems(siteName(site)).includes("crater");

export type DestinationMatch =
  | { kind: "match"; site: DestinationFacts }
  | { kind: "ambiguous"; sites: DestinationFacts[] };

const one = (sites: DestinationFacts[]): DestinationMatch | null =>
  sites.length === 1
    ? { kind: "match", site: sites[0] }
    : sites.length > 1
      ? { kind: "ambiguous", sites }
      : null;

const TRAVEL_REQUEST =
  /^(?:lara )?(?:please )?(?:(?:can|could|would|will) (?:we|you) |lets |let us |i want to |i would like to |id like to )?(?:please )?(?:(?:go|travel|drive|head|navigate|route|take)(?: me| us)?|plan (?:a |the |our |my |an )?(?:trip|route|traverse|drive|journey|expedition|mission|eva|walk)|set (?:the |our )?destination) to (.+)$/;

/**
 * Resolves an explicit travel request to the destinations it names. Only explicit travel requests
 * qualify. Questions about a site's properties are read-only. Distinctive words decide: "ridges"
 * names one site, "bullseye" names two (ambiguous), "terraced bullseye-like crater" is the exact
 * title of the confirmed one.
 */
export function resolveDestination(
  question: string,
  destinations: DestinationFacts[],
): DestinationMatch | null {
  const text = normalize(question)
    .replace(/\b(?:um|uh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:hey )?lara /, "");
  if (/\b(?:not|dont|never|instead|or|if)\b/.test(text)) return null;
  const request = text.match(TRAVEL_REQUEST);
  if (!request) return null;
  const destinationText = request[1]
    .replace(/^the /, "")
    .replace(/ please$/, "")
    .replace(/ (?:now|then)$/, "")
    .replace(/ in arcadia planitia$/, "");

  const numbered = destinationText.match(/^(?:destination|site|number) (\d+)$/);
  if (numbered) return one(destinations.filter((site) => site.number === Number(numbered[1])));

  const hirise = destinationText.match(
    /^(?:(?:hirise|site|observation|dtm) )*(?:esp |dteec )?(\d{6})(?: \d{4})?(?: \d{6} \d{4})?(?: a01)?$/,
  );
  if (hirise) {
    const title = HIRISE_SITE_TITLES[hirise[1]];
    return title
      ? one(destinations.filter((site) => normalize(site.title) === normalize(title)))
      : null;
  }

  const extreme = destinationText.match(
    /^(nearest|closest|farthest|furthest) (crater|ridges?|site|destination|one)?$/,
  );
  if (extreme) {
    const noun = extreme[2] ?? "site";
    const candidates = destinations.filter((site) =>
      noun === "crater"
        ? isCrater(site)
        : noun.startsWith("ridge")
          ? stems(siteName(site)).includes("ridge")
          : true,
    );
    if (candidates.length === 0) return null;
    const near = extreme[1] === "nearest" || extreme[1] === "closest";
    const best = candidates.reduce((a, b) =>
      near
        ? b.straight_line_km < a.straight_line_km
          ? b
          : a
        : b.straight_line_km > a.straight_line_km
          ? b
          : a,
    );
    const ties = candidates.filter((site) => site.straight_line_km === best.straight_line_km);
    return one(ties);
  }

  const directional = destinationText.match(
    /^(crater|ridges|site|destination) (?:to the )?(north|northeast|east|southeast|south|southwest|west|northwest)(?: of (?:us|the base|homebase))?$/,
  );
  if (directional) {
    const matches = destinations.filter(
      (site) =>
        site.bearing_from_base_deg !== undefined &&
        compassDirection(site.bearing_from_base_deg) === directional[2] &&
        (directional[1] === "site" ||
          directional[1] === "destination" ||
          normalize(site.title).includes(directional[1])),
    );
    // A direction that two sites share is not resolved here; the model asks.
    return matches.length === 1 ? { kind: "match", site: matches[0] } : null;
  }

  // Every requested word must appear in the title, so unknown words ("and then", "after") match nothing.
  const words = stems(destinationText).filter((word) => !FILLER.has(word));
  if (words.length === 0) return null;
  const wantsPossible = words.includes("possible") || words.includes("unconfirmed");
  const wantsConfirmed = words.includes("confirmed");
  const nameWords = words.filter((w) => !["possible", "unconfirmed", "confirmed"].includes(w));
  let candidates = destinations.filter((site) => {
    const name = stems(siteName(site));
    return nameWords.every((word) => name.includes(word));
  });
  if (wantsPossible) candidates = candidates.filter((site) => !site.confirmed);
  if (wantsConfirmed) candidates = candidates.filter((site) => site.confirmed);
  if (candidates.length <= 1) return one(candidates);

  // Several sites share the words. The full title said word for word decides, then the name alone.
  const said = nameWords.join(" ");
  const fullTitle = candidates.filter(
    (site) =>
      stems(normalize(site.title).replace(/ in arcadia planitia$/, "")).join(" ") ===
      (wantsPossible ? `possible ${said}` : said),
  );
  if (fullTitle.length === 1) return one(fullTitle);
  const exactName = candidates.filter((site) => stems(siteName(site)).join(" ") === said);
  if (exactName.length === 1) return one(exactName);
  return one(candidates);
}

/** The single destination an explicit travel request names, or null. */
export function requestedDestination(
  question: string,
  destinations: DestinationFacts[],
): DestinationFacts | null {
  const match = resolveDestination(question, destinations);
  return match?.kind === "match" ? match.site : null;
}

const COUNT_WORDS: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
};

const shortTitle = (site: DestinationFacts) => site.title.replace(/ in Arcadia Planitia$/i, "");

/** Uses the same validated selection action as the model; never starts an expedition. */
export function answerDestinationRequest(question: string, context: LaraContext) {
  if (context.route_plan.status !== "present") return null;
  // During an expedition "us" may mean the crew, not the base used by these bearings.
  if (context.route_plan.value.step === "run" && /\bof us\b/i.test(question)) return null;
  const match = resolveDestination(question, context.route_plan.value.destinations);
  if (!match) return null;
  if (match.kind === "ambiguous") {
    const options = match.sites.map(
      (site) =>
        `destination ${site.number}, ${shortTitle(site)}, ${site.straight_line_km} kilometers`,
    );
    const list =
      options.length === 2
        ? `${options[0]}, and ${options[1]}`
        : `${options.slice(0, -1).join(", ")}, and ${options[options.length - 1]}`;
    return {
      text: `${COUNT_WORDS[options.length] ?? options.length} destinations match: ${list}. Which destination do you want?`,
      actions: [],
      tools: [],
      model: null,
    };
  }
  const destination = match.site;
  const recorder = uiActionRecorder(context);
  const receipt = recorder.record("select_destination", { number: destination.number });
  if (!receipt.done) return null;
  return {
    text: `I will plan a route to ${destination.title}.`,
    actions: recorder.actions,
    tools: [{ name: "select_destination", args: { number: destination.number } }],
    model: null,
  };
}
