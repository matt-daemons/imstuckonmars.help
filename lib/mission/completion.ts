import type { Snapshot } from "./client";

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
