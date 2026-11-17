import { ALERT_PRIORITY, annunciating, type MissionAlert } from "@/lib/mission/alerts";

/**
 * Alerts LARA announces on its own already, as new snapshot reasons (use-lara.ts). The alert of the
 * same finding is not announced a second time.
 */
const REASON_OF: Record<string, string> = {
  source_gap: "source_gap_or_unavailable_derived_output",
};

/**
 * The first alert LARA should announce: annunciating, Warning or above, not yet announced in this
 * run, not already covered by a snapshot reason, and raised at or before the current mission time
 * (an alert from before a rewind is stale until the alert list is rebuilt).
 */
export function alertToAnnounce(
  alerts: MissionAlert[],
  announced: ReadonlySet<string>,
  reasons: readonly string[],
  atS: number,
): MissionAlert | null {
  return (
    alerts.find(
      (a) =>
        annunciating(a) &&
        ALERT_PRIORITY[a.level] <= ALERT_PRIORITY.warning &&
        !announced.has(a.code) &&
        !reasons.includes(REASON_OF[a.code] ?? a.code) &&
        a.first_s <= atS + 1e-6,
    ) ?? null
  );
}

/** The detail LARA's alert prompt accepts (the server caps it at 500 characters). */
export function alertDetail(alert: Pick<MissionAlert, "name" | "detail">): string {
  return `${alert.name}. ${alert.detail}`.slice(0, 500);
}
