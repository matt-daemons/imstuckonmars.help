import { describe, expect, it } from "vitest";
import { fakeSensorReducer } from "./use-fake-sensor-mode";
import { FAKE_LAST_FRAME } from "@/lib/mars/fake-sensors";

describe("fake data mode isolation", () => {
  it("keeps the advertised 60× speed despite ten-second quantization", () => {
    let state = fakeSensorReducer({ enabled: false }, { type: "enable", enabled: true });
    state = fakeSensorReducer(state, { type: "speed", speed: 60 });
    state = fakeSensorReducer(state, { type: "play", playing: true });
    for (let tick = 0; tick < 5; tick++) state = fakeSensorReducer(state, { type: "tick" });
    expect(state).toMatchObject({ frame: 6, elapsedSeconds: 60 });
  });
  it("ignores layer and playback commands while off", () => {
    const off = { enabled: false } as const;
    expect(fakeSensorReducer(off, { type: "layer", layer: "wind", visible: true })).toBe(off);
    expect(fakeSensorReducer(off, { type: "play", playing: true })).toBe(off);
  });
  it("resets readings, playback and layers when disabled and enabled again", () => {
    let state = fakeSensorReducer({ enabled: false }, { type: "enable", enabled: true });
    state = fakeSensorReducer(state, { type: "frame", frame: 100 });
    state = fakeSensorReducer(state, { type: "layer", layer: "wind", visible: true });
    state = fakeSensorReducer(state, { type: "enable", enabled: false });
    expect(state).toEqual({ enabled: false });
    expect(fakeSensorReducer(state, { type: "enable", enabled: true })).toMatchObject({
      enabled: true,
      frame: 0,
      playing: false,
      visible: { wind: false, sensors: true },
    });
  });
  it("stops at seven complete SOLs without wrapping or advancing while paused", () => {
    let state = fakeSensorReducer({ enabled: false }, { type: "enable", enabled: true });
    state = fakeSensorReducer(state, { type: "frame", frame: FAKE_LAST_FRAME - 1 });
    expect(fakeSensorReducer(state, { type: "tick" })).toEqual(state);
    state = fakeSensorReducer(state, { type: "play", playing: true });
    expect(fakeSensorReducer(state, { type: "tick" })).toMatchObject({
      frame: FAKE_LAST_FRAME,
      playing: false,
    });
  });
});
