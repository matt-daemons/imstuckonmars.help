/** Readable text for backend reason codes. Unknown codes are shown verbatim, never hidden. */
export const REASON_TEXT: Record<string, string> = {
  oxygen_return_reserve:
    "Suit oxygen would fall under its reserve before the crew reaches shelter.",
  energy_return_reserve:
    "Suit battery would fall under its reserve before the crew reaches shelter.",
  time_return_reserve: "The walk would exceed the suit's main-supply time.",
  eva_oxygen_demand_unmet: "The suit oxygen would run out.",
  eva_power_demand_unmet: "The suit batteries would run out.",
  simulated_route_blocked: "A simulated blockage on the return path makes the outcome unknown.",
  source_unavailable: "The archived trace has a gap, so the outcome is unknown.",
  arrival_unknown: "The plan never returns to shelter.",
  eva_oxygen_below_reserve: "Suit oxygen is under its reserve.",
  eva_battery_below_reserve: "Suit battery is under its reserve.",
  base_oxygen_below_reserve: "Shelter oxygen is under its reserve.",
  base_battery_below_reserve: "Shelter battery is under its reserve.",
  archive_ended_no_production_credited:
    "The archived MOXIE run has ended; no further habitat production is credited.",
  source_gap_or_unavailable_derived_output: "The archived MOXIE trace has no derived sample here.",
  generator_power_shutdown_latched_until_restore:
    "The habitat generator stopped for lack of power and stays off until restored.",
};

export const reasonText = (code: string) => REASON_TEXT[code] ?? code.replaceAll("_", " ");
