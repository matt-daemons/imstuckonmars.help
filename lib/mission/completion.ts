import type { Snapshot } from "./client";
import { shelterArrivalS } from "./clock";

/** A paused return is not completion: the configured recovery still needs operator playback. */
export function shelterRecoveryPending(snapshot: Snapshot | null): boolean {
  if (!snapshot || snapshot.clock.mode !== "paused" || snapshot.state.status !== "ok") return false;
  const arrival = shelterArrivalS(snapshot.config);
  return (
    arrival !== null &&
    snapshot.state.elapsed_s >= arrival &&
    snapshot.state.elapsed_s < snapshot.config.duration_s - 1e-6
  );
}

/** A return still has its configured shelter recovery period; pause/source gaps are not completion. */
export function simulationFinished(snapshot: Snapshot | null): boolean {
  return Boolean(
    snapshot?.config.route &&
    (snapshot.clock.mode === "ended" ||
      snapshot.state.elapsed_s >= snapshot.config.duration_s - 1e-6),
  );
}

export function reportKey(snapshot: Pick<Snapshot, "mission_id" | "revision">): string {
  return `${snapshot.mission_id}:${snapshot.revision}`;
}

/**
 * The completed run whose report was already shown on its own. Kept per tab in sessionStorage
 * so a reload does not show it again; the app-owned browser reset clears it.
 */
export const REPORT_SHOWN_STORAGE_KEY = "imstuckonmars.expedition.reportShown";

export interface ShownCompletion {
  mission_id: string;
  route_id: string;
  /** The revision at which the run was first seen complete. */
  revision: number;
}

type CompletionSnapshot = Pick<Snapshot, "mission_id" | "revision"> & {
  config: { route?: { id: string } | null };
};

export function shownCompletion(snapshot: CompletionSnapshot): ShownCompletion {
  return {
    mission_id: snapshot.mission_id,
    route_id: snapshot.config.route?.id ?? "",
    revision: snapshot.revision,
  };
}

/**
 * Whether this finished snapshot belongs to a run whose report was already shown. Commands after
 * completion (and reloads) raise the revision but keep the run; a reset or new plan clears the
 * record (see the expedition provider), so a rerun of the same route opens its report again.
 */
export function completionAlreadyShown(
  shown: ShownCompletion | null,
  snapshot: CompletionSnapshot,
): boolean {
  return Boolean(
    shown &&
    shown.mission_id === snapshot.mission_id &&
    shown.route_id === (snapshot.config.route?.id ?? "") &&
    shown.revision <= snapshot.revision,
  );
}

export function parseShownCompletion(value: string | null): ShownCompletion | null {
  try {
    const parsed = JSON.parse(value ?? "null") as Partial<ShownCompletion> | null;
    return parsed &&
      typeof parsed.mission_id === "string" &&
      typeof parsed.route_id === "string" &&
      typeof parsed.revision === "number"
      ? (parsed as ShownCompletion)
      : null;
  } catch {
    return null;
  }
}
