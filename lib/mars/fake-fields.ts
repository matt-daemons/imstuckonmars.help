import { fakeReading, type FakeScalar } from "./fake-sensors";

export type FakeShadedField = Exclude<FakeScalar, "humidity">;
export const FAKE_FIELD_PALETTES: Record<FakeShadedField, readonly string[]> = {
  ground: ["#405da8", "#81b3d2", "#d5e6eb", "#eee6d6", "#edbd78", "#dd824b", "#a93532"],
  air: ["#435899", "#8ab6d2", "#dce7ee", "#f3e8d3", "#eac58a", "#df945b", "#b54a36"],
  pressure: ["#514987", "#7772a6", "#aaa4c2", "#e5e1e8", "#a6cbca", "#64a2ae", "#316b88"],
  radiation: ["#eee0c4", "#e7be85", "#d79669", "#ba6b66", "#96556b", "#70476b", "#493955"],
};
export const FAKE_FIELD_PATCHES = [-180, -90, 0, 90].map((west) => ({
  west,
  east: west + 90,
  north: 85,
  south: -85,
}));

/** Evaluates the same invented equations as the stations, not an observed/interpolated product. */
export function fakeFieldValue(
  longitude: number,
  latitude: number,
  frame: number,
  field: FakeShadedField,
): number {
  return fakeReading({ id: "synthetic-field", position: [longitude, latitude] }, frame)[field];
}

export function fieldBand(value: number, low: number, high: number): number {
  return Math.max(0, Math.min(6, Math.floor(((value - low) / (high - low)) * 7)));
}
