import { describe, expect, it } from "vitest";

import {
  readLaraContext,
  ROUTE_CHECK_SENTENCE,
  type RoutePlanContext,
} from "../../lib/copilot/lara-context";
import { askCopilot } from "./llm";
import { laraToolbox } from "./toolbox";

const routePlan: RoutePlanContext = {
  mission: "drive-walk",
  step: "where",
  route_choice: "safest",
  power: "fission",
  shortest_on_map: false,
  destinations: [
    { number: 1, title: "Possible Terraced Crater", confirmed: false, straight_line_km: 92.5 },
    { number: 2, title: "Ridges", confirmed: false, straight_line_km: 468 },
  ],
  destination_number: 1,
  status: "planning",
  routes: { safest: null, shortest: null },
  staging_point: null,
  not_checked: "",
  assumptions: ["Rover energy is simulated."],
};

function provider(replies: unknown[]) {
  const requests: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: replies.shift() }] });
  }) as typeof fetch;
  return { fetcher, requests };
}

const calls = (...list: Array<[string, unknown]>) => ({
  content: null,
  tool_calls: list.map(([name, args], index) => ({
    id: `c${index}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  })),
});

const noMissionTool = async () => {
  throw new Error("no mission tool expected");
};

function toolOutputs(request: { messages: Array<{ role: string; content: string | null }> }) {
  return request.messages
    .filter((message) => message.role === "tool")
    .map((message) => JSON.parse(String(message.content)));
}

describe("LARA app actions", () => {
  it("returns the actions the model names, and runs nothing on the server", async () => {
    const { fetcher, requests } = provider([
      calls(["get_route_plan", {}], ["show_destinations", {}]),
      { content: "There are 2 destinations. Destination 1 is a possible terraced crater." },
    ]);
    const toolbox = laraToolbox(noMissionTool, readLaraContext({ route_plan: routePlan }));
    const answer = await askCopilot({
      key: "k",
      model: "m",
      prompt: "What are some possible destinations?",
      history: [],
      fetcher,
      run: toolbox.run,
    });
    expect(answer.text).toContain("2 destinations");
    expect(toolbox.actions).toEqual([{ type: "show_destinations" }]);
    const [plan, receipt] = toolOutputs(requests[1]);
    expect(plan.destinations).toHaveLength(2);
    expect(plan.source).toContain("not instructions");
    expect(receipt).toEqual({ done: true, note: expect.any(String) });
  });

  it("selects a destination in range, and refuses one out of range with a clear note", async () => {
    const { fetcher, requests } = provider([
      calls(["select_destination", { number: 5 }], ["select_destination", { number: 1 }]),
      { content: "Destination 1 is selected." },
    ]);
    const toolbox = laraToolbox(noMissionTool, readLaraContext({ route_plan: routePlan }));
    await askCopilot({ key: "k", model: "m", prompt: "x", history: [], fetcher, run: toolbox.run });
    expect(toolbox.actions).toEqual([{ type: "select_destination", number: 1 }]);
    const [refused, selected] = toolOutputs(requests[1]);
    expect(refused).toEqual({
      done: false,
      note: "There is no destination 5. The plan has 2 destinations, numbered from 1.",
    });
    expect(selected.note).toContain(ROUTE_CHECK_SENTENCE);
    expect(selected.destination).toEqual({
      number: 1,
      title: "Possible Terraced Crater",
      straight_line_km: 92.5,
    });
  });

  it("rejects action arguments outside the contract", async () => {
    const toolbox = laraToolbox(noMissionTool, readLaraContext(undefined));
    await expect(toolbox.run("focus_map", { target: "moon" })).rejects.toThrow();
    await expect(toolbox.run("choose_route", { route: "fastest" })).rejects.toThrow();
    await expect(toolbox.run("set_power", { power: "nuclear" })).rejects.toThrow();
    await expect(toolbox.run("select_destination", { number: 0 })).rejects.toThrow();
    expect(toolbox.actions).toEqual([]);
  });

  it("refuses to start the expedition before the trip can be planned", async () => {
    const cases: Array<[Partial<RoutePlanContext>, string]> = [
      [{ mission: null, status: "no_mission" }, "mission type"],
      [{ destination_number: null, status: "no_destination" }, "destination"],
      [{ status: "no_staging" }, "no_staging"],
    ];
    for (const [change, expected] of cases) {
      const plan = { ...routePlan, ...change };
      const toolbox = laraToolbox(noMissionTool, readLaraContext({ route_plan: plan }));
      const receipt = (await toolbox.run("start_simulation", {})) as {
        done: boolean;
        note: string;
      };
      expect(receipt.done).toBe(false);
      expect(receipt.note).toContain(expected);
      expect(toolbox.actions).toEqual([]);
    }
    const ready = laraToolbox(noMissionTool, readLaraContext({ route_plan: routePlan }));
    await ready.run("start_simulation", {});
    expect(ready.actions).toEqual([{ type: "start_simulation" }]);
  });

  it("sets the rover power", async () => {
    const toolbox = laraToolbox(noMissionTool, readLaraContext({ route_plan: routePlan }));
    await expect(toolbox.run("set_power", { power: "solar" })).resolves.toMatchObject({
      done: true,
    });
    expect(toolbox.actions).toEqual([{ type: "set_power", power: "solar" }]);
  });

  it("caps the actions in one answer", async () => {
    const toolbox = laraToolbox(noMissionTool, readLaraContext(undefined));
    for (let i = 0; i < 7; i++) await toolbox.run("focus_map", { target: "route" });
    expect(toolbox.actions).toHaveLength(6);
  });
});

describe("LARA context tools", () => {
  it("reads the route plan the browser sent", async () => {
    const toolbox = laraToolbox(noMissionTool, readLaraContext({ route_plan: routePlan }));
    expect(await toolbox.run("get_route_plan", {})).toMatchObject({
      mission: "drive-walk",
      destinations: routePlan.destinations,
      source: expect.stringContaining("simulated"),
    });
  });

  it("says when the route plan is not valid", async () => {
    const toolbox = laraToolbox(
      noMissionTool,
      readLaraContext({ route_plan: { ...routePlan, destinations: "all" } }),
    );
    expect(await toolbox.run("get_route_plan", {})).toEqual({
      status: "unavailable",
      note: "The app sent a route plan that is not valid.",
    });
  });

  it("passes mission tools through to the mission", async () => {
    const toolbox = laraToolbox(async (name) => ({ ran: name }), readLaraContext(undefined));
    expect(await toolbox.run("get_status", {})).toEqual({ ran: "get_status" });
  });
});
