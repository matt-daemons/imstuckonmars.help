export interface SkyPoint {
  longitude: number;
  latitude: number;
  brightness: number;
}

/** Fixed illustrative sky, not a star catalog or solar ephemeris. */
export function skyPoints(count: number, seed = 48271): SkyPoint[] {
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    longitude: random() * 360 - 180,
    latitude: (Math.asin(random() * 2 - 1) * 180) / Math.PI,
    brightness: random(),
  }));
}

export function skyPosition(
  point: Pick<SkyPoint, "longitude" | "latitude">,
  camera: { longitude: number; latitude: number; bearing: number; width: number; height: number },
) {
  const radians = Math.PI / 180;
  const lng = (point.longitude - camera.longitude) * radians;
  const lat = point.latitude * radians;
  const center = camera.latitude * radians;
  const x = Math.cos(lat) * Math.sin(lng);
  const y = Math.sin(lat) * Math.cos(center) - Math.cos(lat) * Math.cos(lng) * Math.sin(center);
  const z = Math.sin(lat) * Math.sin(center) + Math.cos(lat) * Math.cos(lng) * Math.cos(center);
  if (z <= 0.15) return null;
  const angle = camera.bearing * radians;
  const scale = Math.max(camera.width, camera.height) * 0.65;
  return {
    x: camera.width / 2 + ((x * Math.cos(angle) - y * Math.sin(angle)) / z) * scale,
    y: camera.height / 2 - ((x * Math.sin(angle) + y * Math.cos(angle)) / z) * scale,
  };
}
