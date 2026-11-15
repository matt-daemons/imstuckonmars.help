import type { LngLat } from "./types";

export const FAKE_SENSOR_VERSION = "future-sensors-v1";
export const FAKE_SOL_SECONDS = 88775.244;
export const FAKE_SOL_COUNT = 7;
export const FAKE_SAMPLE_SECONDS = 10;
export const FAKE_DURATION_SECONDS = FAKE_SOL_COUNT * FAKE_SOL_SECONDS;
export const FAKE_LAST_FRAME = Math.ceil(FAKE_DURATION_SECONDS / FAKE_SAMPLE_SECONDS);

/** The last boundary sample is shorter than ten seconds so the series spans exactly seven SOLs. */
export function fakeElapsedSeconds(frame: number): number {
  return Math.min(FAKE_DURATION_SECONDS, Math.max(0, Math.round(frame)) * FAKE_SAMPLE_SECONDS);
}

export const FAKE_LAYERS = [
  { id: "sensors", label: "Sensor locations", unit: "", low: 0, high: 1 },
  { id: "wind", label: "Wind and sandstorm direction", unit: "m/s", low: 0, high: 35 },
  { id: "ground", label: "Ground temperature", unit: "°C", low: -110, high: 5 },
  { id: "air", label: "Above-ground temperature", unit: "°C", low: -100, high: 0 },
  { id: "hardness", label: "Soil hardness", unit: "MPa", low: 0, high: 12 },
  { id: "pressure", label: "Atmospheric pressure", unit: "Pa", low: 400, high: 1100 },
  { id: "radiation", label: "Radiation absorbed dose rate", unit: "µGy/day", low: 100, high: 600 },
  { id: "humidity", label: "Relative humidity", unit: "%", low: 0, high: 100 },
] as const;

export type FakeLayer = (typeof FAKE_LAYERS)[number]["id"];
export type FakeScalar = Exclude<FakeLayer, "sensors" | "wind">;
export type FakeVisibility = Record<FakeLayer, boolean>;
export const INITIAL_FAKE_VISIBILITY: FakeVisibility = {
  sensors: true,
  wind: false,
  ground: false,
  air: false,
  hardness: false,
  pressure: false,
  radiation: false,
  humidity: false,
};

export interface FakeSensor {
  id: string;
  position: LngLat;
}

/** A fictional 15° network, plus polar stations. No NASA observations are inputs. */
export const FAKE_SENSORS: FakeSensor[] = [
  ...Array.from({ length: 12 * 24 }, (_, index): FakeSensor => ({
    id: `FS-${String(index + 1).padStart(3, "0")}`,
    position: [-172.5 + (index % 24) * 15, -82.5 + Math.floor(index / 24) * 15],
  })),
  { id: "FS-289", position: [0, -90] },
  { id: "FS-290", position: [0, 90] },
];

export interface FakeReading {
  sensor: FakeSensor;
  elapsedSols: number;
  windSpeed: number;
  /** Heading toward which the air and synthetic dust front travel, clockwise from north. */
  windBearing: number;
  /** Unitless illustrative storm intensity, not optical depth or a particle measurement. */
  storm: number;
  ground: number;
  air: number;
  /** Synthetic penetration resistance. Does not establish traversability. */
  hardness: number;
  pressure: number;
  /** Synthetic detector absorbed dose, not human exposure or dose equivalent. */
  radiation: number;
  humidity: number;
}

const radians = Math.PI / 180;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Pure, repeatable demo equations. Values are invented, not predictions or calibrated models. */
export function fakeReading(sensor: FakeSensor, frame: number): FakeReading {
  const elapsedSols = fakeElapsedSeconds(frame) / FAKE_SOL_SECONDS;
  const [longitude, latitude] = sensor.position;
  const lat = latitude * radians;
  const lon = longitude * radians;
  const daily = Math.cos(2 * Math.PI * (elapsedSols + longitude / 360 - 0.58));
  const daylight = Math.max(0, daily);
  const front = Math.cos(lon - elapsedSols * 0.85) * Math.cos(lat * 2 + elapsedSols * 0.4);
  const storm = clamp((front - 0.15) / 0.85, 0, 1);
  const ground = clamp(
    -58 - 35 * Math.abs(Math.sin(lat)) + 43 * daily + 4 * Math.sin(lon * 3),
    -110,
    5,
  );
  const air = clamp(-62 - 24 * Math.abs(Math.sin(lat)) + 23 * daily + 6 * storm, -100, 0);
  return {
    sensor,
    elapsedSols,
    windSpeed: clamp(4 + 7 * Math.abs(Math.sin(lat * 3 + lon)) + 20 * storm + 2 * daylight, 0, 35),
    windBearing:
      (((90 + 70 * Math.sin(lat * 2) + 40 * Math.sin(lon + elapsedSols * 0.8)) % 360) + 360) % 360,
    storm,
    ground,
    air,
    hardness: clamp(
      5 + 3 * Math.sin(lon * 2) * Math.cos(lat * 3) + 1.5 * Math.cos(lat * 7) - storm * 0.3,
      0,
      12,
    ),
    pressure: clamp(
      720 +
        170 * Math.cos(lat) * Math.sin(lon + 0.7) +
        65 * Math.cos(lat * 3) +
        25 * daily -
        30 * storm,
      400,
      1100,
    ),
    radiation: clamp(
      230 +
        110 * Math.abs(Math.sin(lat)) +
        120 * Math.max(0, Math.sin(elapsedSols * 1.15 + lon)) -
        storm * 35,
      100,
      600,
    ),
    humidity: clamp(
      22 + 38 * Math.max(0, -daily) + 15 * Math.abs(Math.sin(lat)) + 12 * storm,
      0,
      100,
    ),
  };
}

export function fakeFrame(frame: number): FakeReading[] {
  return FAKE_SENSORS.map((sensor) => fakeReading(sensor, frame));
}

export function fakeTimeLabel(frame: number): string {
  const seconds = fakeElapsedSeconds(frame);
  if (seconds === FAKE_DURATION_SECONDS) return "End of SOL 07";
  const elapsedSols = seconds / FAKE_SOL_SECONDS;
  const sol = String(Math.floor(elapsedSols) + 1).padStart(2, "0");
  const clock = Math.floor((elapsedSols % 1) * 86400);
  const hour = String(Math.floor(clock / 3600)).padStart(2, "0");
  const minute = String(Math.floor(clock / 60) % 60).padStart(2, "0");
  const second = String(clock % 60).padStart(2, "0");
  return `SOL ${sol} · ${hour}:${minute}:${second}`;
}
