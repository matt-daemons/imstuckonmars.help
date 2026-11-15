/** Display copy only. The immutable release retains the original warning strings. */
export function experimentWarning(warning: string) {
  const subset = /^deployment_subset: stored_rows=(\d+); original_source_rows=(\d+)$/.exec(warning);
  if (subset) return `Deployed trace: ${subset[1]} of ${subset[2]} archived rows.`;
  if (warning === "comparison_summaries_are_whole_archive_not_subset_integrals")
    return "Summary covers the full archived run, not the deployed trace.";
  if (warning === "elapsed_counter_reset;derived_product_absent")
    return "Elapsed counter resets; derived output is absent.";
  if (warning === "copied_UTC_sol_SCLK_metadata_quarantined")
    return "Copied absolute timing metadata is quarantined.";
  return warning.replaceAll("_", " ");
}
