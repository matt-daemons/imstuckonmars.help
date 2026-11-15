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

/** A Cache API stand-in, since the Workers cache does not exist in tests. It honours max-age. */
function fakeCaches() {
  const entries = new Map<string, { response: Response; expires: number }>();
  const cache = {
    match: async (key: string) => {
      const entry = entries.get(key);
      return entry && Date.now() < entry.expires ? entry.response.clone() : undefined;
    },
    put: async (key: string, response: Response) => {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1]);
      entries.set(key, { response, expires: Date.now() + maxAge * 1000 });
    },
  };
  return { open: async () => cache };
}

const busySep = { ...realAnswers, SEP: () => new Response("busy", { status: 500 }) };

/** Moves the faked clock on by `seconds`. */
function advance(seconds: number) {
  vi.setSystemTime(Date.now() + seconds * 1000);
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("caches", fakeCaches());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
      answers: busySep,
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

  it("keeps a failure for a minute, answering 503 at once without asking DONKI again", async () => {
    const failing = donkiAnswering(busySep);
    vi.stubGlobal("fetch", failing);
    expect((await api.request("/api/space-weather")).status).toBe(503);

    const healthy = donkiAnswering(realAnswers);
    vi.stubGlobal("fetch", healthy);
    const again = await api.request("/api/space-weather");
    expect(again.status).toBe(503);
    expect(await again.json()).toMatchObject({ error: { code: "donki_unavailable" } });
    expect(healthy).not.toHaveBeenCalled();

    advance(61);
    expect((await api.request("/api/space-weather")).status).toBe(200);
    expect(healthy).toHaveBeenCalledTimes(3);
  });

  it("answers DONKI's last good report, marked stale, while DONKI fails", async () => {
    vi.stubGlobal("fetch", donkiAnswering(realAnswers));
    const good = await (await api.request("/api/space-weather")).json();

    // The 15-minute copy has expired; DONKI now fails.
    advance(16 * 60);
    vi.stubGlobal("fetch", donkiAnswering(busySep));
    const first = await api.request("/api/space-weather");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ...good, stale: true });

    // The failure is kept, so the next request answers the same stale report without DONKI.
    const fetch = donkiAnswering(realAnswers);
    vi.stubGlobal("fetch", fetch);
    const second = await api.request("/api/space-weather");
    expect(await second.json()).toEqual({
      ...good,
      fetched_at: "2024-05-11T03:00:00.000Z",
      stale: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops answering the last good report after a day", async () => {
    vi.stubGlobal("fetch", donkiAnswering(realAnswers));
    await api.request("/api/space-weather");

    advance(24 * 60 * 60 + 1);
    vi.stubGlobal("fetch", donkiAnswering(busySep));
    expect((await api.request("/api/space-weather")).status).toBe(503);
  });

  it("gives up on an endpoint that does not answer within 3 seconds", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(signal.reason);
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    vi.stubGlobal("fetch", fetch);
    // An already-expired timeout, so the test does not wait the 3 seconds.
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => AbortSignal.abort(new DOMException("timed out", "TimeoutError")));

    expect((await api.request("/api/space-weather")).status).toBe(503);
    expect(timeout).toHaveBeenCalledWith(3_000);
  });
});
