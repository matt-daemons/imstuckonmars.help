import { describe, expect, it } from "vitest";
import { answerMapRequest, verifyMapActionText } from "./map-request";
import { readLaraContext, type RoutePlanContext } from "../../lib/copilot/lara-context";

const plan: RoutePlanContext = {
  mission: null,
  step: "mission",
  route_choice: null,
  power: "fission",
  shortest_on_map: false,
  destinations: [{ number: 1, title: "Ridges", confirmed: false, straight_line_km: 469 }],
  destination_number: null,
  status: "no_mission",
  routes: { safest: null, shortest: null },
  staging_point: null,
  not_checked: "",
  assumptions: [],
};

describe("map display requests", () => {
  it.each([
    "Show me the destinations",
    "Can you show the destinations on the map?",
    "Show all destinations again",
    "Please display sites",
  ])("always queues a camera command for %s", (question) => {
    expect(answerMapRequest(question, readLaraContext({ route_plan: plan }))?.actions).toEqual([
      { type: "show_destinations" },
    ]);
  });
  it.each([
    "Do not show destinations",
    "How far are the destinations?",
    "Show destinations if the route is feasible",
  ])("does not interpret %s as a command", (question) => {
    expect(answerMapRequest(question, readLaraContext({ route_plan: plan }))).toBeNull();
  });
  it("reports unavailable destinations without claiming movement", () => {
    expect(answerMapRequest("Show destinations", readLaraContext(undefined))?.actions).toEqual([]);
  });
  it("rejects the reported invented completion claim without a camera action", () => {
    const text = "I moved the map to show the destinations. Please check the display again.";
    expect(verifyMapActionText(text, [])).toContain("did not send a map movement command");
    expect(verifyMapActionText(text, [{ type: "choose_route", route: "safest" }])).not.toBe(text);
    expect(verifyMapActionText(text, [{ type: "show_destinations" }])).toBe(
      "I will update the map view.",
    );
    expect(
      verifyMapActionText("I will show the destinations.", [{ type: "show_destinations" }]),
    ).toBe("I will show the destinations.");
  });
});
