import { describe, expect, it } from "vitest";
import {
  readLaraContext,
  type DestinationFacts,
  type RoutePlanContext,
} from "../../lib/copilot/lara-context";
import { answerDestinationRequest, requestedDestination } from "./destination-request";

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
    expect(answer?.text).toBe("Planning a route to Ridges in Arcadia Planitia.");
    expect(answerDestinationRequest("Go to ridges", readLaraContext(undefined))).toBeNull();
    expect(
      answerDestinationRequest("Go to ridges", readLaraContext({ route_plan: { destinations } })),
    ).toBeNull();
  });
});
