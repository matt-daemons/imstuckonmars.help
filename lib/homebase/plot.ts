import type { ObservationPoint } from "./types";

/** Split before missing/flagged samples and genuine gaps. Never draw across an absent period. */
export function observationSegments(points: ObservationPoint[], cadenceS: number) {
  const segments: ObservationPoint[][] = [];
  let current: ObservationPoint[] = [];
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value) || point.count <= 0) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && point.utc_ms - previous.utc_ms > cadenceS * 1000 * 1.5) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function nearestObservation(points: ObservationPoint[], utcMs: number, toleranceMs: number) {
  let nearest: ObservationPoint | null = null;
  for (const point of points)
    if (
      Math.abs(point.utc_ms - utcMs) <= toleranceMs &&
      (!nearest || Math.abs(point.utc_ms - utcMs) < Math.abs(nearest.utc_ms - utcMs))
    )
      nearest = point;
  return nearest;
}
