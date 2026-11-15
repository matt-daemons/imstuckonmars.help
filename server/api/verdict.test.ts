import { describe, expect, it } from "vitest";

import { api } from "./app";

// A short, flat walk in clear weather with plenty of daylight.
const safePlan = {
  route: { est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 },
  live: { solar_alert_level: "none", dust_opacity: 0.4 },
  minutes_until_sunset: 480,
};

function postVerdict(body: unknown) {
  return api.request("/api/verdict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/verdict", () => {
  it("returns GO for a plan that meets every flight rule", async () => {
    const response = await postVerdict(safePlan);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verdict: "GO", limiting_factor: null, reasons: [] });
  });

  it("returns NO_GO with the limiting factor when a rule is broken", async () => {
    const response = await postVerdict({
      ...safePlan,
      live: { ...safePlan.live, dust_opacity: 3 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verdict: "NO_GO", limiting_factor: "dust" });
  });

  it("accepts a full live snapshot and route result, ignoring the extra fields", async () => {
    const response = await postVerdict({
      ...safePlan,
      route: { ...safePlan.route, distance_km: 2.4, verdict: "GO" },
      live: { ...safePlan.live, sol: 12, temp: -60, wind: 4, proxy_source: "Gale" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verdict: "GO" });
  });

  it.each([
    { name: "a missing route", body: { live: safePlan.live, minutes_until_sunset: 480 } },
    {
      name: "a slope that is not a number",
      body: { ...safePlan, route: { ...safePlan.route, max_slope: "steep" } },
    },
    {
      name: "a slope beyond vertical",
      body: { ...safePlan, route: { ...safePlan.route, max_slope: 120 } },
    },
    {
      name: "a negative walk time",
      body: { ...safePlan, route: { ...safePlan.route, est_time_min: -5 } },
    },
    {
      name: "an unknown solar alert level",
      body: { ...safePlan, live: { ...safePlan.live, solar_alert_level: "severe" } },
    },
    { name: "a body that is not JSON", body: "not json" },
  ])("rejects $name with a 400 and an error message", async ({ body }) => {
    const response = await postVerdict(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: expect.any(String) } });
  });
});
