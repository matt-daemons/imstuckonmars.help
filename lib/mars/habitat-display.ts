import { Box3, Matrix4, Vector3 } from "three";
import { MARS_TO_MAP } from "./terrain";

export const HABITAT_MIN_SIZE_PX = 90;

/** MapLibre's globe uses a unit sphere with this mean Earth radius for elevation. */
const GLOBE_RADIUS = 6_371_008.8;

export function habitatGlobeMatrix(
  longitude: number,
  latitude: number,
  elevation: number,
): Matrix4 {
  const lng = (longitude * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;
  const up = new Vector3(
    Math.sin(lng) * Math.cos(lat),
    Math.sin(lat),
    Math.cos(lng) * Math.cos(lat),
  );
  const east = new Vector3(Math.cos(lng), 0, -Math.sin(lng));
  const south = new Vector3(
    Math.sin(lng) * Math.sin(lat),
    -Math.cos(lat),
    Math.cos(lng) * Math.sin(lat),
  );
  const scale = MARS_TO_MAP / GLOBE_RADIUS;
  return new Matrix4()
    .makeBasis(
      east.multiplyScalar(scale),
      up.clone().multiplyScalar(scale),
      south.multiplyScalar(scale),
    )
    .setPosition(up.multiplyScalar(1 + elevation / GLOBE_RADIUS));
}

/** Match MapLibre's clip-space globe/flat interpolation using a local tangent frame. */
export function habitatProjection(flat: Matrix4, globe: Matrix4, transition: number): Matrix4 {
  const result = flat.clone();
  for (let i = 0; i < 16; i++) {
    result.elements[i] += (globe.elements[i] - result.elements[i]) * transition;
  }
  return result;
}

/** Display-only enlargement in CSS pixels; never changes the ground anchor or route geometry. */
export function habitatDisplayScale(
  projection: Matrix4,
  bounds: Box3,
  width: number,
  height: number,
): number {
  const corner = new Vector3();
  const matrix = new Matrix4();
  let scale = 1;
  for (let iteration = 0; iteration < 4; iteration++) {
    matrix.copy(projection).scale(new Vector3(scale, scale, scale));
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z).applyMatrix4(matrix);
          left = Math.min(left, corner.x);
          right = Math.max(right, corner.x);
          top = Math.min(top, corner.y);
          bottom = Math.max(bottom, corner.y);
        }
      }
    }
    const pixels = Math.max(((right - left) * width) / 2, ((bottom - top) * height) / 2);
    if (!Number.isFinite(pixels) || pixels <= 0) return 1;
    if (iteration === 0 && pixels >= HABITAT_MIN_SIZE_PX) return 1;
    scale = Math.max(1, (scale * HABITAT_MIN_SIZE_PX) / pixels);
  }
  return scale;
}
