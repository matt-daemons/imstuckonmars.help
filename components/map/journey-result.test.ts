import { describe, expect, it } from "vitest";
import type { RouteSummary } from "@/lib/mars/types";
import { journeyReadouts } from "./journey-result";

describe("walk budget labels", () => {
  it("separates walking and sampling from the reserve without changing the total", () => {
    const items = journeyReadouts({} as RouteSummary, null, {
      distance_km: 0.33,
      suit_time_min: 100,
      suit_minutes_left: 380,
    });
    expect(items.find((item) => item.id === "suit-time")).toMatchObject({
      label: "Suit budget incl. reserve",
      value: "100 min",
      note: "70 min walking + sampling; 30 min reserve. No terrain margin.",
    });
  });
});
