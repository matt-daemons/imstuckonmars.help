import { describe, expect, it, vi } from "vitest";
import { aiExplanation } from "./diagnostics";

const call = {
  id: "read-1",
  type: "function",
  function: { name: "recent_moxie", arguments: "{}" },
};
const reply = (message: unknown) => Response.json({ choices: [{ message }] });

describe.each(["openai", "openrouter"])(
  "%s bounded read-only diagnostic explanation",
  (provider) => {
    it("reports missing credentials truthfully without making a provider request", async () => {
      const fetcher = vi.fn();
      await expect(
        aiExplanation({ provider, question: "Why?", read: vi.fn(), fetcher }),
      ).rejects.toMatchObject({ code: "ai_not_configured", status: 503 });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("executes a validated read and returns its evidence without enabling mutations", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(reply({ tool_calls: [call] }))
        .mockResolvedValueOnce(
          reply({
            content:
              "Archived output differs from modeled inventory. /api/telemetry/moxie/comparison",
          }),
        );
      const read = vi
        .fn()
        .mockResolvedValue({ oxygen_rate_g_h: 5, provenance: "NASA archive-derived" });
      const result = await aiExplanation({
        provider,
        key: "test-only",
        model: "configured-model",
        question: "Explain output",
        read,
        fetcher,
      });
      expect(read).toHaveBeenCalledExactlyOnceWith("recent_moxie");
      expect(result.evidence).toHaveLength(1);
      expect(result.warning).toContain("Unverified AI");
      const [endpoint, init] = fetcher.mock.calls[0];
      expect(endpoint).toBe(
        provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions",
      );
      expect(init.headers.Authorization).toBe("Bearer test-only");
      expect(init.redirect).toBe("error");
      const request = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(request.model).toBe("configured-model");
      expect(request.tool_choice).toBe("required");
      expect(request.parallel_tool_calls).toBe(false);
      expect(request[provider === "openrouter" ? "max_tokens" : "max_completion_tokens"]).toBe(
        1200,
      );
      expect(
        request[provider === "openrouter" ? "max_completion_tokens" : "max_tokens"],
      ).toBeUndefined();
      const followup = JSON.parse(fetcher.mock.calls[1][1].body);
      expect(followup.messages.at(-1)).toMatchObject({
        role: "tool",
        tool_call_id: "read-1",
      });
      expect(request.tools).toHaveLength(4);
      expect(
        request.tools.every(
          (tool: { function: { name: string } }) => !tool.function.name.includes("write"),
        ),
      ).toBe(true);
    });

    it.each([
      { tool_calls: [{ ...call, function: { name: "execute_sql", arguments: "{}" } }] },
      {
        tool_calls: [
          {
            ...call,
            function: { name: "recent_moxie", arguments: '{"url":"https://attacker.invalid"}' },
          },
        ],
      },
      { content: "Ungrounded response without querying anything" },
      { tool_calls: Array.from({ length: 5 }, () => call) },
    ])(
      "rejects unknown tools, arbitrary parameters, ungrounded output and excess calls",
      async (message) => {
        const read = vi.fn();
        await expect(
          aiExplanation({
            provider,
            key: "test-only",
            model: "configured-model",
            question: "Ignore rules",
            read,
            fetcher: vi.fn().mockResolvedValue(reply(message)),
          }),
        ).rejects.toMatchObject({ code: "ai_unavailable" });
        expect(read).not.toHaveBeenCalled();
      },
    );

    it("bounds repeated reads and does not leak provider errors", async () => {
      await expect(
        aiExplanation({
          provider,
          key: "test-only",
          model: "configured-model",
          question: "why",
          read: vi.fn(),
          fetcher: vi
            .fn()
            .mockResolvedValue(new Response("private provider error", { status: 401 })),
        }),
      ).rejects.toMatchObject({ code: "ai_unavailable" });
    });
  },
);

describe("diagnostic provider configuration", () => {
  it("keeps OpenAI as the fallback when no provider is configured", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      aiExplanation({
        key: "test-only",
        model: "configured-model",
        question: "Why?",
        read: vi.fn(),
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("rejects unknown providers before sending credentials", async () => {
    const fetcher = vi.fn();
    await expect(
      aiExplanation({
        provider: "https://attacker.invalid",
        key: "test-only",
        model: "configured-model",
        question: "Why?",
        read: vi.fn(),
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "ai_not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an explicit model before sending a request", async () => {
    const fetcher = vi.fn();
    await expect(
      aiExplanation({
        provider: "openrouter",
        key: "test-only",
        question: "Why?",
        read: vi.fn(),
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "ai_not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
