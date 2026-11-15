import { describe, expect, it, vi } from "vitest";
import type { DriveWalk } from "@/components/map/route-hooks";
import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import { tripVerdict } from "./verdict-strip";
import { realConditions } from "./conditions";

vi.mock("@/components/expedition/expedition-provider", () => ({ useExpedition: () => null }));

describe("trip verdict strip", () => {
  it("shows the range NO-GO even when no terrain legs were calculated", () => {
    const conditions = realConditions({
      clock: { ltst: "12:00:00", minutes_until_sunset: 360 },
      doseRate: 9,
      simulatedDust: null,
      spaceWeather: "failed",
    });
    const plan = {
      drive: null,
      walk: null,
      verdict: { verdict: "NO_GO", limiting_factor: "range", reasons: ["Beyond rover range"] },
      collection: {
        route: {
          margin: { resource: "rover_range", value: 424, limit: 200, unit: "km" },
          time_to_shelter_min: 0,
        },
      },
    } as DriveWalkPlan;
    const verdict = tripVerdict({ plan } as DriveWalk, conditions);
    expect(verdict?.status.label).toBe("NO-GO");
    expect(verdict?.fields).toContainEqual({ label: "Margin", value: "−224 km" });
    expect(verdict?.fields.some((field) => field.label === "Shelter")).toBe(false);
  });
});
