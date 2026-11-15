import { describe, expect, it } from "vitest";
import { experimentWarning } from "./experiments";

describe("experiment source notes", () => {
  it("preserves deployment counts and full-run boundaries in readable copy", () => {
    expect(experimentWarning("deployment_subset: stored_rows=0; original_source_rows=7923")).toBe(
      "Deployed trace: 0 of 7923 archived rows.",
    );
    expect(
      experimentWarning("comparison_summaries_are_whole_archive_not_subset_integrals"),
    ).toContain("full archived run, not the deployed trace");
  });
  it("retains sol 901's absent output and elapsed reset", () => {
    expect(experimentWarning("elapsed_counter_reset;derived_product_absent")).toBe(
      "Elapsed counter resets; derived output is absent.",
    );
  });
  it("preserves unrecognized source warnings rather than dropping them", () => {
    expect(experimentWarning("new_archive_warning")).toBe("new archive warning");
  });
});
