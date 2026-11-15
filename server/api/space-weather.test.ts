import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import particleEvents from "@/lib/flight-rules/fixtures/donki-sep-2024-05.json";
import simulations from "@/lib/flight-rules/fixtures/donki-wsa-enlil-2024-05.json";

import { api } from "./app";

// An hour after GOES saw particles above 100 MeV on 11 May 2024.
const NOW = new Date("2024-05-11T03:00Z");
const DONKI = "https://ccmc.gsfc.nasa.gov/DONKI-API/get";

/** A fetch that answers each DONKI endpoint with its entry in `answers`. */
function donkiAnswering(answers: Record<string, () => Response>) {
  return vi.fn(async (url: string) => {
    const endpoint = new URL(url).pathname.split("/").pop() ?? "";
    return answers[endpoint]();
  });
}

const realAnswers = {
  FLR: () => Response.json([]),
  SEP: () => Response.json(particleEvents),
  WSAEnlilSimulations: () => Response.json(simulations),
};

/** A Cache API stand-in, since the Workers cache does not exist in tests. */
function fakeCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, response: Response) => void entries.set(key, response),
  };
  return { open: async () => cache };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("caches", fakeCaches());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET /api/space-weather", () => {
  it("answers the solar alert from DONKI, saying where it was measured", async () => {
    vi.stubGlobal("fetch", donkiAnswering(realAnswers));

    const response = await api.request("/api/space-weather");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      level: "warning",
      weather: {
        strongest_flare_24h: null,
        particle_event_above_10_mev: true,
        particle_event_above_100_mev: true,
        // The nearest modelled Mars arrival in the fixture, 19 May 2024 09:15 UTC.
        hours_until_storm_reaches_mars: 198.25,
      },
      fetched_at: "2024-05-11T03:00:00.000Z",
      source: "NASA DONKI",
      measured_at: "Earth (GOES) / model arrival at Mars",
    });
  });

  it("asks each DONKI endpoint for the days its rule needs", async () => {
    const fetch = donkiAnswering(realAnswers);
    vi.stubGlobal("fetch", fetch);

    await api.request("/api/space-weather");

    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      `${DONKI}/FLR?startDate=2024-05-10&endDate=2024-05-11`,
      `${DONKI}/SEP?startDate=2024-05-09&endDate=2024-05-11`,
      `${DONKI}/WSAEnlilSimulations?startDate=2024-05-04&endDate=2024-05-11`,
    ]);
  });

  it("answers a repeat request from the cache without asking DONKI again", async () => {
    const fetch = donkiAnswering(realAnswers);
    vi.stubGlobal("fetch", fetch);

    const first = await api.request("/api/space-weather");
    const second = await api.request("/api/space-weather");

    expect(await second.json()).toEqual(await first.json());
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: "an endpoint fails",
      answers: { ...realAnswers, SEP: () => new Response("busy", { status: 500 }) },
    },
    {
      name: "an endpoint answers in an unexpected shape",
      answers: { ...realAnswers, FLR: () => Response.json({ flares: [] }) },
    },
    {
      name: "an endpoint does not answer",
      answers: {
        ...realAnswers,
        WSAEnlilSimulations: () => {
          throw new TypeError("fetch failed");
        },
      },
    },
  ])("answers 503 when $name", async ({ answers }) => {
    vi.stubGlobal("fetch", donkiAnswering(answers));

    const response = await api.request("/api/space-weather");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "donki_unavailable", message: expect.stringContaining("NASA DONKI") },
    });
  });

  it("does not keep a failure, so the next request asks DONKI again", async () => {
    vi.stubGlobal(
      "fetch",
      donkiAnswering({ ...realAnswers, SEP: () => new Response("busy", { status: 500 }) }),
    );
    expect((await api.request("/api/space-weather")).status).toBe(503);

    vi.stubGlobal("fetch", donkiAnswering(realAnswers));
    expect((await api.request("/api/space-weather")).status).toBe(200);
  });
});
