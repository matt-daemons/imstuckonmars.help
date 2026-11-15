import { describe, expect, it } from "vitest";

import type { MissionAlert } from "@/lib/mission/alerts";

import { alertDetail, alertToAnnounce } from "./alert-announcements";

function alert(code: string, change: Partial<MissionAlert> = {}): MissionAlert {
  return {
    code,
    id: code.toUpperCase(),
    level: "warning",
    name: "Suit oxygen leak",
    system: "Suits",
    detail: "Simulated leak of 40 g/h on top of crew demand.",
    first_s: 100,
    active: true,
    acknowledged: false,
    suppressed: false,
    inhibited: false,
    ...change,
  };
}

describe("alerts LARA announces", () => {
  it("announces a new warning once", () => {
    const leak = alert("eva_oxygen_leak");
    expect(alertToAnnounce([leak], new Set(), [], 120)).toBe(leak);
    expect(alertToAnnounce([leak], new Set(["eva_oxygen_leak"]), [], 120)).toBeNull();
  });
  it("skips info, acknowledged, inactive and inhibited alerts", () => {
    const skipped = [
      alert("archive_ended", { level: "info" }),
      alert("a", { acknowledged: true }),
      alert("b", { active: false }),
      alert("c", { inhibited: true }),
      alert("d", { suppressed: true }),
    ];
    expect(alertToAnnounce(skipped, new Set(), [], 120)).toBeNull();
  });
  it("leaves findings LARA announces as reasons to that path", () => {
    expect(
      alertToAnnounce(
        [alert("eva_oxygen_below_reserve", { level: "error" })],
        new Set(),
        ["eva_oxygen_below_reserve"],
        120,
      ),
    ).toBeNull();
    expect(
      alertToAnnounce(
        [alert("source_gap")],
        new Set(),
        ["source_gap_or_unavailable_derived_output"],
        120,
      ),
    ).toBeNull();
  });
  it("ignores alerts raised after the current time (left over from before a rewind)", () => {
    expect(alertToAnnounce([alert("eva_oxygen_leak", { first_s: 500 })], new Set(), [], 0)).toBe(
      null,
    );
  });
  it("prefers the most severe new alert, in list order", () => {
    const emergency = alert("no_option_keeps_reserves", { level: "emergency" });
    expect(alertToAnnounce([emergency, alert("eva_oxygen_leak")], new Set(), [], 120)).toBe(
      emergency,
    );
  });
  it("keeps the detail within the server limit", () => {
    expect(alertDetail(alert("x"))).toBe(
      "Suit oxygen leak. Simulated leak of 40 g/h on top of crew demand.",
    );
    expect(alertDetail({ name: "n", detail: "x".repeat(600) })).toHaveLength(500);
  });
});
