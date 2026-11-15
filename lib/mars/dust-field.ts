export const DUST_COLORS = [
  [0, 47, 108],
  [0, 145, 175],
  [94, 183, 204],
  [242, 220, 86],
  [238, 132, 51],
  [189, 51, 45],
  [102, 31, 64],
] as const;

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
