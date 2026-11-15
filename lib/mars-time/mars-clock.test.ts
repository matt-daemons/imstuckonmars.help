import { describe, expect, it } from "vitest";

import { readMarsClock, type SurfaceLocation } from "./mars-clock";

// The team's base in Arcadia Planitia, from config.yaml.
const arcadiaBase: SurfaceLocation = { longitude_east_degrees: 184, latitude_north_degrees: 46 };

// Any landing date works for tests that do not check the sol number.
const someLanding = new Date("2026-11-01T00:00:00Z");

describe("readMarsClock against NASA's Mars24 worked examples", () => {
  // https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
  // The page prints the zenith angle; elevation is 90° minus that.
  it.each([
    {
      name: "the prime meridian on 6 January 2000",
      utc: "2000-01-06T00:00:00Z",
      location: { longitude_east_degrees: 0, latitude_north_degrees: 0 },
      localMeanSolarTime: "23:59:39",
      solarLongitude: 277.18758,
      sunElevation: 90 - 154.26182,
      sunAzimuth: 191.03905,
    },
    {
      name: "the Spirit rover's landing site on 3 January 2004",
      utc: "2004-01-03T13:46:31Z",
      // The page gives 184.702° west, which is 175.298° east.
      location: { longitude_east_degrees: 175.298, latitude_north_degrees: -14.64 },
      localMeanSolarTime: "00:51:07",
      solarLongitude: 327.32416,
      sunElevation: 90 - 151.93895,
      sunAzimuth: 179.99383,
    },
  ])("matches $name", (example) => {
    const reading = readMarsClock(new Date(example.utc), example.location, someLanding);

    expect(reading.lmst).toBe(example.localMeanSolarTime);
    expect(reading.solar_longitude).toBeCloseTo(example.solarLongitude, 3);
    expect(reading.sun_elevation).toBeCloseTo(example.sunElevation, 2);
    expect(reading.sun_azimuth).toBeCloseTo(example.sunAzimuth, 1);
  });
});

describe("readMarsClock against JPL Horizons at the Arcadia base", () => {
  // Sun positions from the JPL Horizons API for 176° west, 46° north on 15 November 2026
  // (airless, azimuth clockwise from north).
  it.each([
    { utc: "2026-11-15T06:00:00Z", sunAzimuth: 86.786, sunElevation: 9.779 },
    { utc: "2026-11-15T12:00:00Z", sunAzimuth: 183.566, sunElevation: 53.239 },
    { utc: "2026-11-15T16:00:00Z", sunAzimuth: 254.627, sunElevation: 26.953 },
    { utc: "2026-11-15T22:00:00Z", sunAzimuth: 324.009, sunElevation: -27.736 },
  ])("puts the Sun within half a degree at $utc", ({ utc, sunAzimuth, sunElevation }) => {
    const reading = readMarsClock(new Date(utc), arcadiaBase, someLanding);

    expect(Math.abs(reading.sun_elevation - sunElevation)).toBeLessThan(0.5);
    expect(Math.abs(reading.sun_azimuth - sunAzimuth)).toBeLessThan(0.5);
  });

  // Horizons has the Sun crossing the horizon at about 18:41 UTC that day,
  // and about 18:02 UTC the day before (one Mars day earlier).
  it.each([
    { name: "in the afternoon", utc: "2026-11-15T16:00:00Z", minutesUntilSunset: 161 },
    { name: "after sunset", utc: "2026-11-15T20:00:00Z", minutesUntilSunset: -79 },
    { name: "before sunrise", utc: "2026-11-15T03:00:00Z", minutesUntilSunset: -538 },
  ])("gives the time to sunset $name", ({ utc, minutesUntilSunset }) => {
    const reading = readMarsClock(new Date(utc), arcadiaBase, someLanding);

    expect(reading.minutes_until_sunset).not.toBeNull();
    expect(Math.abs((reading.minutes_until_sunset as number) - minutesUntilSunset)).toBeLessThan(8);
  });
});

describe("readMarsClock sol counting", () => {
  // NASA counts the landing day as sol 0. These sols come from NASA's raw-image feeds.
  it.each([
    {
      name: "Curiosity",
      location: { longitude_east_degrees: 137.4417, latitude_north_degrees: -4.5895 },
      landing: "2012-08-06T05:17:57Z",
      utc: "2026-11-13T15:17:38Z",
      sol: 5073,
    },
    {
      name: "Perseverance",
      location: { longitude_east_degrees: 77.4509, latitude_north_degrees: 18.4446 },
      landing: "2021-02-18T20:55:00Z",
      utc: "2026-11-14T14:00:00Z",
      sol: 2039,
    },
  ])("matches $name's mission sol", ({ location, landing, utc, sol }) => {
    expect(readMarsClock(new Date(utc), location, new Date(landing)).sol).toBe(sol);
  });

  it("is sol 0 at the moment of landing", () => {
    const landing = new Date("2026-11-15T12:00:00Z");

    expect(readMarsClock(landing, arcadiaBase, landing).sol).toBe(0);
  });

  it("moves to the next sol at local midnight, not at midnight UTC", () => {
    const landing = new Date("2026-11-15T12:00:00Z");
    // Local midnight at the base falls at about 23:44 UTC that day.
    const justBeforeLocalMidnight = readMarsClock(
      new Date("2026-11-15T23:35:00Z"),
      arcadiaBase,
      landing,
    );
    const justAfterLocalMidnight = readMarsClock(
      new Date("2026-11-15T23:55:00Z"),
      arcadiaBase,
      landing,
    );

    expect(justBeforeLocalMidnight.lmst.startsWith("23:")).toBe(true);
    expect(justBeforeLocalMidnight.sol).toBe(0);
    expect(justAfterLocalMidnight.lmst.startsWith("00:")).toBe(true);
    expect(justAfterLocalMidnight.sol).toBe(1);
  });

  it("gives the same reading for a longitude written as west-negative or 0 to 360", () => {
    const utc = new Date("2026-11-15T16:00:00Z");
    const westNegative = { longitude_east_degrees: -176, latitude_north_degrees: 46 };

    expect(readMarsClock(utc, westNegative, someLanding)).toEqual(
      readMarsClock(utc, arcadiaBase, someLanding),
    );
  });
});
