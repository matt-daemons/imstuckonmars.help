const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);

function lattice(x: number, y: number, z: number, seed: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2147483647.5 - 1;
}

/** Smooth deterministic value noise, not independently randomized sensor samples. */
function noise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const sx = smooth(x - ix),
    sy = smooth(y - iy),
    sz = smooth(z - iz);
  const lower = mix(
    mix(lattice(ix, iy, iz, seed), lattice(ix + 1, iy, iz, seed), sx),
    mix(lattice(ix, iy + 1, iz, seed), lattice(ix + 1, iy + 1, iz, seed), sx),
    sy,
  );
  const upper = mix(
    mix(lattice(ix, iy, iz + 1, seed), lattice(ix + 1, iy, iz + 1, seed), sx),
    mix(lattice(ix, iy + 1, iz + 1, seed), lattice(ix + 1, iy + 1, iz + 1, seed), sx),
    sy,
  );
  return mix(lower, upper, sz);
}

/** Sample on a sphere so the field joins at ±180° and converges at both poles. */
export function fakeFieldVariation(longitude: number, latitude: number, sols: number) {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  const x = Math.cos(lat) * Math.cos(lon),
    y = Math.cos(lat) * Math.sin(lon),
    z = Math.sin(lat);
  const regional = noise(x * 3 + sols * 0.12, y * 3 - sols * 0.08, z * 3, 1709);
  const local = noise(x * 9 - sols * 0.21, y * 9, z * 9 + sols * 0.1, 4513);
  const terrain = noise(x * 6, y * 6, z * 6, 7919);
  return { weather: regional * 0.72 + local * 0.28, regional, local, terrain };
}
