import { describe, expect, it } from "vitest";
import {
  readLaraContext,
  type DestinationFacts,
  type RoutePlanContext,
} from "../../lib/copilot/lara-context";
import { readFileSync } from "node:fs";
import {
  answerDestinationRequest,
  HIRISE_SITE_TITLES,
  requestedDestination,
  resolveDestination,
} from "./destination-request";

const destinations: DestinationFacts[] = [
  {
    number: 1,
    title: "Possible Terraced Crater in Arcadia Planitia",
    confirmed: false,
    straight_line_km: 93,
  },
  {
    number: 2,
    title: "Possible Terraced Bullseye-like Crater in Arcadia Planitia",
    confirmed: false,
    straight_line_km: 194,
  },
  { number: 4, title: "Ridges in Arcadia Planitia", confirmed: false, straight_line_km: 469 },
];

describe("explicit destination requests", () => {
  it("selects only the crater in the south compass sector", () => {
    const sites = destinations.map((site, index) => ({
      ...site,
      bearing_from_base_deg: [187, 110, 275][index],
    }));
    expect(requestedDestination("Hey Lara, take me to the crater south of us", sites)?.number).toBe(
      1,
    );
    expect(requestedDestination("Take me to the crater south of us", destinations)).toBeNull();
    expect(
      requestedDestination("Take me to the crater south of us", [
        ...sites,
        { ...sites[0], number: 3 },
      ]),
    ).toBeNull();
    expect(requestedDestination("Take me to the crater west of us", sites)).toBeNull();
  });
  it.each([
    "Um, can we go to Ridges, uh, in Arcadia Planitia?",
    "Can you route me to ridges?",
    "Let's go to ridges",
    "Please take us to Ridges in Arcadia Planitia.",
  ])("matches a named site: %s", (question) => {
    expect(requestedDestination(question, destinations)?.number).toBe(4);
  });

  it.each([
    "What are some possible destinations?",
    "How long would it take to go to ridges?",
    "Can we go to a crater?",
    "Do not go to ridges",
    "Can we not go to ridges?",
    "Can we go to ridges or the terraced crater?",
    "Go to ridges and then the terraced crater",
    "Go to ridges after changing the power source",
    "If we go to ridges, how much battery remains?",
    "Can we go to Olympus Mons?",
  ])("does not change the plan: %s", (question) => {
    expect(requestedDestination(question, destinations)).toBeNull();
  });

  it("does not guess when multiple sites share a name", () => {
    expect(
      requestedDestination("Go to ridges", [...destinations, { ...destinations[2], number: 5 }]),
    ).toBeNull();
  });

  it("returns only the validated planning action for the reported request, before a mission is chosen", () => {
    const plan: RoutePlanContext = {
      mission: null,
      step: "mission",
      route_choice: null,
      power: "fission",
      shortest_on_map: false,
      destinations,
      destination_number: null,
      status: "no_mission",
      routes: { safest: null, shortest: null },
      staging_point: null,
      not_checked: "",
      assumptions: [],
    };
    const answer = answerDestinationRequest(
      "Um, can we go to Ridges, uh, in Arcadia Planitia?",
      readLaraContext({ route_plan: plan }),
    );
    expect(answer?.actions).toEqual([{ type: "select_destination", number: 4 }]);
    expect(answer?.text).toBe("I will plan a route to Ridges in Arcadia Planitia.");
    expect(answerDestinationRequest("Go to ridges", readLaraContext(undefined))).toBeNull();
    expect(
      answerDestinationRequest("Go to ridges", readLaraContext({ route_plan: { destinations } })),
    ).toBeNull();
  });
});

/** The four sites as the Where step numbers them, with the titles of sites.geojson. */
const arcadia: DestinationFacts[] = [
  {
    number: 1,
    title: "Possible Terraced Crater in Arcadia Planitia",
    confirmed: false,
    straight_line_km: 93,
  },
  {
    number: 2,
    title: "Possible Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: false,
    straight_line_km: 194,
  },
  {
    number: 3,
    title: "Terraced Bullseye-Like Crater in Arcadia Planitia",
    confirmed: true,
    straight_line_km: 424,
  },
  { number: 4, title: "Ridges in Arcadia Planitia", confirmed: false, straight_line_km: 468 },
];

describe("distinctive words choose the destination", () => {
  it.each([
    ["plan a trip to the ridges", 4],
    ["Plan a route to the ridge", 4],
    ["Can you plan a trip to the ridges site?", 4],
    ["Go to the nearest crater", 1],
    ["Take me to the closest crater", 1],
    ["Go to the nearest site", 1],
    ["Go to the farthest crater", 3],
    ["Go to the terraced crater", 1],
    ["Go to the Terraced Bullseye-Like Crater", 3],
    ["Go to the possible terraced bullseye-like crater", 2],
    ["Go to the possible bullseye crater", 2],
    ["Go to the confirmed bullseye crater", 3],
    ["Go to ESP_054060_2265", 4],
    ["Plan a trip to ESP_037352", 3],
    ["Go to HiRISE site ESP_033225_2250", 1],
    ["Go to DTEEC_034082_2260_033014_2260_A01", 2],
    ["Go to destination 4", 4],
  ])("%s → destination %i", (question, number) => {
    expect(requestedDestination(question, arcadia)?.number).toBe(number);
  });

  it("asks when the words fit two sites", () => {
    expect(resolveDestination("Take me to the bullseye crater", arcadia)).toEqual({
      kind: "ambiguous",
      sites: [arcadia[1], arcadia[2]],
    });
    expect(requestedDestination("Plan a trip to the bullseye", arcadia)).toBeNull();
  });

  it.each([
    "Go to ESP_999999",
    "Go to destination 7",
    "Plan a trip to the ridges or the crater",
    "Plan a trip to the ridges and the crater",
  ])("does not choose for %s", (question) => {
    expect(requestedDestination(question, arcadia)).toBeNull();
  });

  const plan = (step: RoutePlanContext["step"]): RoutePlanContext => ({
    mission: "drive-walk",
    step,
    route_choice: null,
    power: "fission",
    shortest_on_map: false,
    destinations: arcadia,
    destination_number: null,
    status: "no_destination",
    routes: { safest: null, shortest: null },
    staging_point: null,
    not_checked: "",
    assumptions: [],
  });

  it("selects the ridges for the reported request", () => {
    const answer = answerDestinationRequest(
      "plan a trip to the ridges",
      readLaraContext({ route_plan: plan("where") }),
    );
    expect(answer?.actions).toEqual([{ type: "select_destination", number: 4 }]);
    expect(answer?.text).toBe("I will plan a route to Ridges in Arcadia Planitia.");
  });

  it("asks a question and queues no action when two sites match", () => {
    const answer = answerDestinationRequest(
      "Go to the bullseye crater",
      readLaraContext({ route_plan: plan("where") }),
    );
    expect(answer?.actions).toEqual([]);
    expect(answer?.text).toBe(
      "Two destinations match: destination 2, Possible Terraced Bullseye-Like Crater, 194 kilometers, and destination 3, Terraced Bullseye-Like Crater, 424 kilometers. Which destination do you want?",
    );
  });

  it("knows the HiRISE observation of every site in sites.geojson", () => {
    const sites = JSON.parse(
      readFileSync(new URL("../../public/data/processed/sites.geojson", import.meta.url), "utf8"),
    ) as { features: Array<{ properties: { hirise_id: string; title: string } }> };
    const fromFile = Object.fromEntries(
      sites.features.map((f) => [f.properties.hirise_id.slice(4, 10), f.properties.title]),
    );
    expect(HIRISE_SITE_TITLES).toEqual(fromFile);
  });
});
