import { TERRAIN_MIN_ZOOM } from "./terrain";

export const MARS_SKY_COLOR = "rgb(176,132,104)";
export const MARS_HORIZON_COLOR = "rgb(214,172,132)";

export function skyBlend(zoom: number): number {
  return Math.min(1, Math.max(0, (zoom - (TERRAIN_MIN_ZOOM - 2)) / 2));
}

/** Display treatment only: space has fully become sky before terrain can reveal the horizon. */
export function skyBackground(zoom: number): string {
  const blend = skyBlend(zoom);
  const space = [1, 4, 5];
  const sky = [176, 132, 104];
  return `rgb(${space.map((value, index) => Math.round(value + (sky[index] - value) * blend)).join(",")})`;
}
