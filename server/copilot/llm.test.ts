import { describe, expect, it } from "vitest";
import { askCopilot } from "./llm";

function provider(replies: unknown[]) {
  const requests: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: replies.shift() }] });
  }) as typeof fetch;
  return { fetcher, requests };
}

const call = (name: string, args: unknown, id = "c1") => ({
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

describe("LARA tool loop", () => {
  it("runs requested tools and returns the spoken answer", async () => {
    const { fetcher, requests } = provider([
      call("project_resources", { minutes_ahead: 30 }),
      { content: "Suit oxygen will be about 900 grams in 30 minutes, high confidence." },
    ]);
    const ran: unknown[] = [];
    const result = await askCopilot({
      key: "k",
      model: "m",
      prompt: "Oxygen in half an hour?",
      history: [],
      fetcher,
      run: async (name, args) => {
        ran.push([name, args]);
        return { ok: true };
      },
    });
    expect(ran).toEqual([["project_resources", { minutes_ahead: 30 }]]);
    expect(result.text).toContain("900 grams");
    expect(requests[1].messages.at(-1)).toMatchObject({ role: "tool" });
  });

  it("refuses unknown tools without running them", async () => {
    const { fetcher, requests } = provider([
      call("delete_mission", {}),
      { content: "I can't do that." },
    ]);
    let ran = false;
    await askCopilot({
      key: "k",
      model: "m",
      prompt: "x",
      history: [],
      fetcher,
      run: async () => {
        ran = true;
        return null;
      },
    });
    expect(ran).toBe(false);
    expect(String(requests[1].messages.at(-1)?.content)).toContain("tool failed");
  });

  it("sends a note after the system prompt, and none when there is no note", async () => {
    const roles = async (note: string | null) => {
      const { fetcher, requests } = provider([{ content: "Next, pick a mission type." }]);
      await askCopilot({
        key: "k",
        model: "m",
        prompt: "What should I try?",
        history: [{ role: "user", content: "hi" }],
        note,
        fetcher,
        run: async () => null,
      });
      return requests[0].messages;
    };
    const withNote = await roles("Training checklist. Next item: Pick a mission type.");
    expect(withNote.map((m) => m.role)).toEqual(["system", "system", "user", "user"]);
    expect(withNote[1].content).toContain("Next item");
    expect((await roles(null)).map((m) => m.role)).toEqual(["system", "user", "user"]);
  });

  it("reports a missing provider key as not configured", async () => {
    await expect(
      askCopilot({ prompt: "x", history: [], run: async () => null }),
    ).rejects.toMatchObject({ code: "ai_not_configured", status: 503 });
  });
});
