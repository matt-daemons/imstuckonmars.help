import { describe, expect, it } from "vitest";

import { DONKI_SCHEMAS, particleEnergyMev, spaceWeatherFromDonki, type DonkiData } from "./donki";
// Trimmed real DONKI answers: flares of 5–14 Nov 2026, the May 2024 particle events and the May
// 2024 WSA-Enlil runs that put a storm at Mars, and a Nov 2026 run that misses Mars.
import flareFixture from "./fixtures/donki-flr-2026-11.json";
import particleFixture from "./fixtures/donki-sep-2024-05.json";
import may2024Simulations from "./fixtures/donki-wsa-enlil-2024-05.json";
import nov2026Simulations from "./fixtures/donki-wsa-enlil-2026-11.json";

const flares = DONKI_SCHEMAS.FLR.parse(flareFixture);
const particleEvents = DONKI_SCHEMAS.SEP.parse(particleFixture);
const simulations = DONKI_SCHEMAS.WSAEnlilSimulations.parse(may2024Simulations);

const nothing: DonkiData = { flares: [], particleEvents: [], simulations: [] };

describe("spaceWeatherFromDonki", () => {
  it("is quiet when DONKI lists nothing", () => {
    expect(spaceWeatherFromDonki(nothing, new Date("2026-11-15T12:00Z"))).toEqual({
      strongest_flare_24h: null,
      particle_event_above_10_mev: false,
      particle_event_above_100_mev: false,
      hours_until_storm_reaches_mars: null,
    });
  });

  it.each([
    { now: "2026-11-15T12:00Z", expected: "C2.8" },
    { now: "2026-11-06T10:00Z", expected: "M3.5" },
    { now: "2026-11-13T12:00Z", expected: null },
  ])("names $expected as the strongest flare of the 24 h before $now", ({ now, expected }) => {
    const weather = spaceWeatherFromDonki({ ...nothing, flares }, new Date(now));
    expect(weather.strongest_flare_24h).toBe(expected);
  });

  it("picks the strongest of several flares in the last 24 h", () => {
    const stronger = { ...flares[2], classType: "X1.0", peakTime: "2026-11-15T09:00Z" };
    const weather = spaceWeatherFromDonki(
      { ...nothing, flares: [...flares, stronger] },
      new Date("2026-11-15T12:00Z"),
    );
    expect(weather.strongest_flare_24h).toBe("X1.0");
  });

  it.each([
    { now: "2024-05-10T14:00Z", above10: true, above100: false },
    { now: "2024-05-11T03:00Z", above10: true, above100: true },
    { now: "2024-05-14T00:00Z", above10: true, above100: false },
    { now: "2024-05-20T00:00Z", above10: false, above100: false },
  ])(
    "reads the particle events under way at $now from their energy channels",
    ({ now, above10, above100 }) => {
      const weather = spaceWeatherFromDonki({ ...nothing, particleEvents }, new Date(now));
      expect(weather.particle_event_above_10_mev).toBe(above10);
      expect(weather.particle_event_above_100_mev).toBe(above100);
    },
  );

  it("counts a particle event with no stated energy as above 10 MeV, never above 100", () => {
    const unnamed = { ...particleEvents[0], instruments: [{ displayName: "SOHO: COSTEP" }] };
    const weather = spaceWeatherFromDonki(
      { ...nothing, particleEvents: [unnamed] },
      new Date("2024-05-10T14:00Z"),
    );
    expect(weather.particle_event_above_10_mev).toBe(true);
    expect(weather.particle_event_above_100_mev).toBe(false);
  });

  it("ignores a particle event seen only below 10 MeV", () => {
    const low = { ...particleEvents[0], instruments: [{ displayName: "ACE: EPAM 0.5-4.8 MeV" }] };
    const weather = spaceWeatherFromDonki(
      { ...nothing, particleEvents: [low] },
      new Date("2024-05-10T14:00Z"),
    );
    expect(weather.particle_event_above_10_mev).toBe(false);
  });

  it("gives the hours to the modelled storm arrival at Mars nearest now", () => {
    // Runs predict Mars arrivals at 19 May 09:15 and 20 May 09:35 UTC.
    const weather = spaceWeatherFromDonki(
      { ...nothing, simulations },
      new Date("2024-05-20T05:00Z"),
    );
    expect(weather.hours_until_storm_reaches_mars).toBeCloseTo(4.583, 2);
  });

  it("gives a negative number once the storm has reached Mars", () => {
    const weather = spaceWeatherFromDonki(
      { ...nothing, simulations },
      new Date("2024-05-20T12:00Z"),
    );
    expect(weather.hours_until_storm_reaches_mars).toBeCloseTo(-2.417, 2);
  });

  it("knows of no storm for Mars when the runs reach only other spacecraft", () => {
    const weather = spaceWeatherFromDonki(
      { ...nothing, simulations: DONKI_SCHEMAS.WSAEnlilSimulations.parse(nov2026Simulations) },
      new Date("2026-11-15T12:00Z"),
    );
    expect(weather.hours_until_storm_reaches_mars).toBeNull();
  });
});

describe("particleEnergyMev", () => {
  it.each([
    { name: "GOES-P: SEISS >10 MeV", energy: 10 },
    { name: "GOES-P: SEISS >100 MeV", energy: 100 },
    { name: "SOHO: COSTEP 15.8-39.8 MeV", energy: 15.8 },
    { name: "STEREO A: IMPACT 13-100 MeV", energy: 13 },
    { name: "SOHO: COSTEP", energy: null },
  ])("reads $energy MeV as the lowest energy of $name", ({ name, energy }) => {
    expect(particleEnergyMev(name)).toBe(energy);
  });
});
