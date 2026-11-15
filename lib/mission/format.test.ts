import { describe, expect, it } from "vitest";

import { formatAge, formatDuration, formatNumber, formatUtc } from "./format";

describe("operator number formatting", () => {
  it("follows D-5: separators from five digits, leading zero, true minus", () => {
    expect(formatNumber(4500)).toBe("4500");
    expect(formatNumber(12500)).toBe("12,500");
    expect(formatNumber(0.42, 2)).toBe("0.42");
    expect(formatNumber(-3.14159, 1)).toBe("−3.1");
    expect(formatNumber(2.5, 1, true)).toBe("+2.5");
    expect(formatNumber(-0.001, 2)).toBe("0.00");
  });

  it("formats durations as hh:mm:ss, with a sign for countdowns", () => {
    expect(formatDuration(5025)).toBe("01:23:45");
    expect(formatDuration(-300)).toBe("−00:05:00");
    expect(formatDuration(300, true)).toBe("+00:05:00");
    expect(formatDuration(3 * 86400 + 4 * 3600 + 5 * 60 + 6)).toBe("3/04:05:06");
  });

  it("labels times and ages", () => {
    expect(formatUtc(1686064756000)).toBe("2023-06-06 15:19:16");
    expect(formatAge(12_400)).toBe("12 s");
    expect(formatAge(240_000)).toBe("4 m");
  });
});
