import { describe, expect, it } from "vitest";
import { outcomeStyle, returnedOutcomeText } from "./present";

describe("outcome labels", () => {
  it("does not turn an unknown or loading return assessment into a constraint violation", () => {
    for (const status of [undefined, "unknown"] as const) {
      expect(returnedOutcomeText(status)).toContain("unavailable");
      expect(returnedOutcomeText(status)).not.toContain("violated");
    }
    expect(returnedOutcomeText("modeled_constraint_violation")).toContain("violated");
  });
  it("does not call unmet discharge power a breached reserve", () => {
    expect(
      outcomeStyle({ status: "modeled_constraint_violation", reasons: ["eva_power_demand_unmet"] })
        .label,
    ).toBe("Power demand unmet");
  });
  it("names an actual reserve shortfall and an EVA time limit distinctly", () => {
    expect(
      outcomeStyle({ status: "modeled_constraint_violation", reasons: ["energy_return_reserve"] })
        .label,
    ).toBe("Reserve breached");
    expect(
      outcomeStyle({ status: "modeled_constraint_violation", reasons: ["time_return_reserve"] })
        .label,
    ).toBe("EVA time exceeded");
    expect(outcomeStyle({ status: "modeled_resource_feasible", reasons: [] }).label).toBe(
      "Reserves kept",
    );
  });
});
