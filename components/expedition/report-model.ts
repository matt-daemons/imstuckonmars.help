import type { MissionReport } from "@/lib/mission/client";

/** Report values come from the replayed series, never from the forecast. */
export function summarize(report: MissionReport) {
  const { config, series, final } = report;
  const route = config.route;
  const departed = Boolean(route?.legs.length && report.at_s >= route.legs[0].start_s);
  const science = config.schedule
    .filter((e) => e.activity === "science")
    .reduce((sum, e) => sum + Math.max(0, Math.min(e.end_s, report.at_s) - e.start_s), 0);
  return {
    departed,
    returned: departed && final.position?.phase === "shelter",
    breached:
      final.oxygen.eva.first_reserve_crossing_s !== null ||
      final.battery.eva.first_reserve_crossing_s !== null,
    o2Margin:
      Math.min(final.oxygen.eva.remaining_g, ...series.map((r) => r.suit_oxygen_g)) -
      config.oxygen.eva.reserve_g,
    whMargin:
      Math.min(final.battery.eva.remaining_wh, ...series.map((r) => r.suit_energy_wh)) -
      config.battery.eva.reserve_wh,
    science,
    plannedScience:
      route?.planned_sampling_s ??
      route?.legs
        .filter((l) => l.activity === "science")
        .reduce((s, l) => s + l.end_s - l.start_s, 0) ??
      0,
    farthest: Math.max(0, ...series.map((r) => r.distance_m ?? 0)),
    travelled: final.position?.travelled_m ?? 0,
    eva: final.eva_elapsed_s,
  };
}
