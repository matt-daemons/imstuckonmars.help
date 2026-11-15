import { describe, expect, it } from "vitest";
import type { Plan } from "@/components/map/route-layers";
import type { RoutePlanInputs } from "@/components/route/route-plan";
import { routeToPlan } from "./route-to-plan";

describe("incomplete walking route", () => {
  it("does not claim a selected destination was lost when its start is blocked", () => {
    const inputs = {
      mission: "walking",
      samplingMin: 60,
      end: [-176.04, 45.97],
    } as RoutePlanInputs;
    const result = routeToPlan(inputs, [-176.05, 45.97], { summary: null } as Plan, null);
    expect(result.plan).toBeNull();
    expect(result.reason).toContain("selected destination is retained");
    expect(result.reason).not.toContain("end point first");
  });
});
