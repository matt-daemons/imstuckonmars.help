/** Illustrative footprint only. Not observations, optical depth, or a weather forecast. */
export const DUST_FOOTPRINT = { west: -196, east: -156, south: 26, north: 66 };

export const DUST_IMAGE_PATCHES = [
  { id: "west", west: DUST_FOOTPRINT.west + 360, east: 180, longitudeOffset: -360 },
  { id: "east", west: -180, east: DUST_FOOTPRINT.east, longitudeOffset: 0 },
];

export const DUST_COLORS = [
  [0, 47, 108],
  [0, 145, 175],
  [94, 183, 204],
  [242, 220, 86],
  [238, 132, 51],
  [189, 51, 45],
  [102, 31, 64],
] as const;

/** A wind-oriented, irregular plume with several lobes, not an Earth hurricane eye. */
export function dustField(longitude: number, latitude: number, windFrom: number): number {
  const x = (longitude + 176) * Math.cos((46 * Math.PI) / 180);
  const y = latitude - 46;
  const angle = ((windFrom + 180) * Math.PI) / 180;
  const along = x * Math.sin(angle) + y * Math.cos(angle);
  const across = x * Math.cos(angle) - y * Math.sin(angle);
  const ridge = across - 2 * Math.sin(along / 4);
  const core = Math.exp(-(((along + 2) / 8) ** 2) - (ridge / 3.3) ** 2);
  const front = 0.65 * Math.exp(-(((along - 5) / 5) ** 2) - ((across + 3) / 5) ** 2);
  const texture =
    0.84 + 0.09 * Math.sin(x * 1.7 + Math.sin(y * 1.3)) + 0.07 * Math.cos(y * 2.1 - x);
  const edgeDistance = Math.min(
    longitude - DUST_FOOTPRINT.west,
    DUST_FOOTPRINT.east - longitude,
    latitude - DUST_FOOTPRINT.south,
    DUST_FOOTPRINT.north - latitude,
  );
  const edge = Math.max(0, Math.min(1, edgeDistance / 3));
  return Math.max(0, Math.min(1, Math.max(core, front) * texture * edge * edge * (3 - 2 * edge)));
}

export function dustColor(value: number): [number, number, number, number] {
  const scaled = Math.max(0, Math.min(1, value)) * (DUST_COLORS.length - 1);
  const index = Math.min(DUST_COLORS.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  const start = DUST_COLORS[index],
    end = DUST_COLORS[index + 1];
  return [
    Math.round(start[0] + (end[0] - start[0]) * fraction),
    Math.round(start[1] + (end[1] - start[1]) * fraction),
    Math.round(start[2] + (end[2] - start[2]) * fraction),
    Math.round(Math.min(1, value / 0.12) * 210),
  ];
}
