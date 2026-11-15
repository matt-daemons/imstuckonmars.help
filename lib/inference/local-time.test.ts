import { describe, expect, it } from "vitest";

import type { SurfaceLocation } from "@/lib/mars-time/mars-clock";

import { JEZERO_MEDA_SITE, localTimeAt, proxyUtcAtSameLocalTime } from "./local-time";

// The habitat site in public/data/processed/stops.geojson.
const arcadiaBase: SurfaceLocation = {
  longitude_east_degrees: -176.05,
  latitude_north_degrees: 45.97,
};

/** Seconds since local midnight for a "HH:MM:SS" clock. */
function clockSeconds(clock: string): number {
  const [hours, minutes, seconds] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

describe("localTimeAt against MEDA's own timestamps", () => {
  // First and last rows of WE__0816___________CAL_ATS_________________P01. The label gives the UTC
  // of each, and each CSV row gives MEDA's LMST and LTST.
  it.each([
    { utc: "2023-06-06T14:47:38.846Z", lmst: "00:00:04", ltst: "00:08:48" },
    { utc: "2023-06-07T14:31:28.519Z", lmst: "23:05:48", ltst: "23:14:43" },
  ])("matches MEDA's clock at $utc", ({ utc, lmst, ltst }) => {
    const reading = localTimeAt(new Date(utc), JEZERO_MEDA_SITE);

    expect(reading.sol).toBe(816);
    expect(Math.abs(clockSeconds(reading.lmst) - clockSeconds(lmst))).toBeLessThanOrEqual(10);
    expect(Math.abs(clockSeconds(reading.ltst) - clockSeconds(ltst))).toBeLessThanOrEqual(2);
  });
});

describe("proxyUtcAtSameLocalTime", () => {
  // Start of the sol-816 MOXIE run.
  const moxieStart = new Date("2023-06-06T15:19:16Z");

  it("finds the Jezero moment that has the base's local time", () => {
    const jezeroUtc = proxyUtcAtSameLocalTime(moxieStart, arcadiaBase, JEZERO_MEDA_SITE);
    const base = localTimeAt(moxieStart, arcadiaBase);
    const jezero = localTimeAt(jezeroUtc, JEZERO_MEDA_SITE);

    expect(base.lmst).toBe("07:36:55");
    expect(jezero.lmst).toBe(base.lmst);
    // True solar time drifts a few seconds apart, because the equation of time changes in 7 hours.
    expect(Math.abs(clockSeconds(jezero.ltst) - clockSeconds(base.ltst))).toBeLessThanOrEqual(10);
    expect(jezero.sol).toBe(816);
  });

  it("is 7.1 Mars hours later at Jezero, because the base is 106.5° east", () => {
    const jezeroUtc = proxyUtcAtSameLocalTime(moxieStart, arcadiaBase, JEZERO_MEDA_SITE);
    const earthHours = (jezeroUtc.getTime() - moxieStart.getTime()) / 3_600_000;

    expect(earthHours).toBeCloseTo(7.295, 3);
  });

  it("goes back in time when the base is west of the proxy", () => {
    const westBase: SurfaceLocation = { longitude_east_degrees: 20, latitude_north_degrees: 0 };
    const proxyUtc = proxyUtcAtSameLocalTime(moxieStart, westBase, JEZERO_MEDA_SITE);

    expect(proxyUtc.getTime()).toBeLessThan(moxieStart.getTime());
    expect(localTimeAt(proxyUtc, JEZERO_MEDA_SITE).lmst).toBe(
      localTimeAt(moxieStart, westBase).lmst,
    );
  });

  it("never shifts by more than half a sol", () => {
    for (let longitude = -180; longitude <= 180; longitude += 15) {
      const base = { longitude_east_degrees: longitude, latitude_north_degrees: 0 };
      const shiftMs = proxyUtcAtSameLocalTime(moxieStart, base, JEZERO_MEDA_SITE).getTime();
      const halfSolMs = 12 * 1.0274912517 * 3_600_000;

      expect(Math.abs(shiftMs - moxieStart.getTime())).toBeLessThanOrEqual(halfSolMs);
    }
  });

  it("gives the same moment for a longitude written as west-negative or 0 to 360", () => {
    const eastPositive = { ...arcadiaBase, longitude_east_degrees: 183.95 };

    expect(proxyUtcAtSameLocalTime(moxieStart, eastPositive, JEZERO_MEDA_SITE).getTime()).toBe(
      proxyUtcAtSameLocalTime(moxieStart, arcadiaBase, JEZERO_MEDA_SITE).getTime(),
    );
  });
});
