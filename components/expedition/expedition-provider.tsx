"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { activeAlerts, reconcileAlerts, type MissionAlert } from "@/lib/mission/alerts";
import {
  ApiError,
  missionApi,
  uuid,
  type Command,
  type EventRequest,
  type MissionAccess,
  type MissionOutlook,
  type MissionReport,
  type Snapshot,
} from "@/lib/mission/client";
import type { ExpeditionPlan } from "@/lib/mission/expedition";
import type { ReplanOption } from "@/lib/mission/types";
import { usePathname } from "next/navigation";
import { reportKey, simulationFinished } from "@/lib/mission/completion";
import { saveReport } from "@/lib/mission/report-history";

import { MISSION_STORAGE_KEY as STORAGE_KEY } from "@/lib/browser-data";
const PLAYING_POLL_MS = 1000;
const IDLE_POLL_MS = 10_000;
const OUTLOOK_PLAYING_MS = 4000;
/** Two missed polls while playing make the link stale (D-1). */
const STALE_AFTER_MS = 2600;

export type LinkState = "connecting" | "live" | "stale" | "offline";

export interface CommandStatus {
  label: string;
  state: "running" | "accepted" | "failed" | "unknown";
  message?: string;
  at: number;
}

export type Speed = 1 | 10 | 60;
export const SPEEDS: Speed[] = [1, 10, 60];

function readStored(): MissionAccess | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as MissionAccess | null;
    return value && typeof value.id === "string" && typeof value.token === "string" ? value : null;
  } catch {
    return null;
  }
}

function useExpeditionState() {
  const pathname = usePathname();
  const [access, setAccess] = useState<MissionAccess | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<CommandStatus | null>(null);
  const [outlook, setOutlook] = useState<MissionOutlook | null>(null);
  const [alerts, setAlerts] = useState<MissionAlert[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeReportOpen = useCallback((open: boolean) => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
    setCompletionOpen(false);
    setReportOpen(open);
  }, []);
  const [completedReport, setCompletedReport] = useState<MissionReport | null>(null);
  const [reportSave, setReportSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reportSaveError, setReportSaveError] = useState<string | null>(null);
  const reportJob = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const savedKey = useRef<string | null>(null);
  const finished = simulationFinished(snapshot);
  const snapshotRef = useRef<Snapshot | null>(null);
  const accessRef = useRef<MissionAccess | null>(null);
  const busy = useRef(false);
  const polling = useRef(false);

  const accept = useCallback((next: Snapshot) => {
    const current = snapshotRef.current;
    // Drop responses that arrive out of order.
    if (
      current &&
      current.mission_id === next.mission_id &&
      (next.revision < current.revision ||
        (next.revision === current.revision && next.server_time_ms < current.server_time_ms))
    )
      return;
    snapshotRef.current = next;
    setSnapshot(next);
    setReceivedAt(Date.now());
    setLastOkAt(Date.now());
    setLinkError(null);
  }, []);

  const archiveReport = useCallback(async () => {
    const current = snapshotRef.current;
    const mission = accessRef.current;
    if (!current || !mission || !simulationFinished(current)) return;
    const key = reportKey(current);
    if (savedKey.current === key) return;
    if (reportJob.current?.key === key) return reportJob.current.promise;
    setReportSave("saving");
    setReportSaveError(null);
    const promise = (async () => {
      try {
        const report = await missionApi.report(mission);
        if (reportKey(report) !== key)
          throw new Error("The run changed before its report could be saved");
        setCompletedReport(report);
        await saveReport(report);
        savedKey.current = key;
        setReportSave("saved");
      } catch (error) {
        setReportSave("error");
        const message = error instanceof Error ? error.message : "Report storage unavailable";
        setReportSaveError(message);
        throw new Error(
          `Report not saved: ${message}. Open Mission dashboard → Simulation reports and retry saving before replacing this run.`,
        );
      } finally {
        reportJob.current = null;
      }
    })();
    reportJob.current = { key, promise };
    return promise;
  }, []);

  const completionKey = finished && snapshot ? reportKey(snapshot) : null;
  useEffect(() => {
    if (!completionKey) {
      setCompletionOpen(false);
      return;
    }
    setCompletionOpen(true);
    setReportOpen(false);
    void archiveReport().catch(() => {});
    completionTimer.current = setTimeout(() => {
      setCompletionOpen(false);
      setReportOpen(true);
    }, 1600);
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, [completionKey, archiveReport]);

  // Open the page's one session: resume this tab's, or open a new one at the habitat.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOpenError(null);
      const stored = readStored();
      if (!stored && pathname !== "/") return;
      if (stored) {
        try {
          const first = await missionApi.snapshot(stored);
          if (cancelled) return;
          accessRef.current = stored;
          setAccess(stored);
          accept(first);
          return;
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          sessionStorage.removeItem(STORAGE_KEY);
          if (pathname !== "/") return;
        }
      }
      const session = await missionApi.open();
      if (cancelled) return;
      const mission = { id: session.id, token: session.token };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mission));
      } catch {
        /* Memory-only session. */
      }
      accessRef.current = mission;
      setAccess(mission);
      accept(await missionApi.snapshot(mission));
    })().catch((error: unknown) => {
      if (!cancelled)
        setOpenError(error instanceof Error ? error.message : "Mission server unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [accept, attempt, pathname]);

  const refresh = useCallback(async () => {
    const mission = accessRef.current;
    if (!mission || polling.current) return;
    polling.current = true;
    try {
      const next = await missionApi.snapshot(mission);
      if (accessRef.current?.id === mission.id) accept(next);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "Snapshot failed");
    } finally {
      polling.current = false;
    }
  }, [accept]);

  const playing = snapshot?.clock.mode === "playing";
  useEffect(() => {
    if (!access) return;
    const timer = setInterval(() => void refresh(), playing ? PLAYING_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [access, playing, refresh]);

  // A coarse clock for link health; the map animates the crew on its own frames.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // The outlook follows revisions, and refreshes while the clock plays.
  const hasRoute = Boolean(snapshot?.config.route) && snapshot?.clock.mode !== "ended";
  const revision = snapshot?.revision;
  const loadOutlook = useCallback(async () => {
    const mission = accessRef.current;
    if (!mission) return;
    try {
      const next = await missionApi.outlook(mission);
      if (snapshotRef.current?.revision !== next.revision || accessRef.current?.id !== mission.id)
        return;
      setOutlook((old) =>
        old && old.revision === next.revision && old.at_s > next.at_s ? old : next,
      );
    } catch {
      setOutlook(null);
    }
  }, []);
  useEffect(() => {
    if (!hasRoute) {
      setOutlook(null);
      return;
    }
    void loadOutlook();
    if (!playing) return;
    const timer = setInterval(() => void loadOutlook(), OUTLOOK_PLAYING_MS);
    return () => clearInterval(timer);
  }, [hasRoute, revision, playing, loadOutlook]);

  // Alerts: deterministic, reconciled with the operator's local acknowledgments.
  const previousAt = useRef<{ id: string; route: string | undefined; at: number } | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const at = snapshot.state.elapsed_s;
    const prior = previousAt.current;
    const rewind =
      !prior ||
      prior.id !== snapshot.mission_id ||
      prior.route !== snapshot.config.route?.id ||
      at < prior.at - 1e-6;
    const sameOutlook = outlook && outlook.revision === snapshot.revision ? outlook : null;
    setAlerts((old) => reconcileAlerts(rewind ? [] : old, activeAlerts(snapshot, sameOutlook), at));
    previousAt.current = { id: snapshot.mission_id, route: snapshot.config.route?.id, at };
  }, [snapshot, outlook]);

  const updateAlert = useCallback(
    (
      code: string,
      change: Partial<Pick<MissionAlert, "acknowledged" | "suppressed" | "inhibited">>,
    ) => setAlerts((old) => old.map((a) => (a.code === code ? { ...a, ...change } : a))),
    [],
  );
  const acknowledgeAll = useCallback(
    () => setAlerts((old) => old.map((a) => (a.active ? { ...a, acknowledged: true } : a))),
    [],
  );

  /** Retry lost responses with the same receipt, never apply a decision to an unseen revision. */
  const command = useCallback(
    async (value: Command, label: string) => {
      const mission = accessRef.current;
      const current = snapshotRef.current;
      if (!mission || !current || busy.current) return null;
      busy.current = true;
      setLastCommand({ label, state: "running", at: Date.now() });
      const attemptOnce = async (revision: number) => {
        const receipt = uuid();
        try {
          return await missionApi.command(mission, value, revision, receipt);
        } catch (error) {
          // A dropped response is not a rejected command: retry the same receipt.
          if (!(error instanceof ApiError) || error.code !== "network") throw error;
          return missionApi.command(mission, value, revision, receipt);
        }
      };
      try {
        // Never overwrite a completed run until its immutable report is saved.
        if (value.type === "plan" || value.type === "reset") await archiveReport();
        let result;
        try {
          result = await attemptOnce(current.revision);
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "stale_revision") throw error;
          const latest = await missionApi.snapshot(mission);
          accept(latest);
          throw new ApiError(
            "stale_revision",
            "The mission changed. Review the updated state and confirm the command again",
            409,
          );
        }
        accept(result);
        if (value.type === "plan" || value.type === "reset") setReportOpen(false);
        setLastCommand({ label, state: "accepted", at: Date.now() });
        return result;
      } catch (error) {
        setLastCommand({
          label,
          state: error instanceof ApiError && error.code === "network" ? "unknown" : "failed",
          message: error instanceof Error ? error.message : "Command failed",
          at: Date.now(),
        });
        return null;
      } finally {
        busy.current = false;
      }
    },
    [accept, archiveReport],
  );

  const launch = useCallback(
    async (plan: ExpeditionPlan, speed: Speed) => {
      if (!(await command({ type: "plan", plan }, "Load expedition"))) return false;
      if (!(await command({ type: "speed", speed }, `Speed ${speed}×`))) return false;
      return Boolean(await command({ type: "play" }, "Begin expedition"));
    },
    [command],
  );
  const replan = useCallback(
    (option: ReplanOption, title: string) => command({ type: "replan", option }, title),
    [command],
  );
  const inject = useCallback(
    (event: EventRequest, label: string) =>
      command({ type: "event", event: { ...event, id: uuid(), at_s: "now" } }, label),
    [command],
  );

  /** Mission seconds at wall time `ms`, extrapolated from the last snapshot while playing. */
  const clockAt = useCallback(
    (ms: number) => {
      const s = snapshotRef.current;
      if (!s) return 0;
      if (s.clock.mode !== "playing") return s.clock.position_s;
      // Stop visual extrapolation after two missed polls; do not invent progress during an outage.
      const elapsed =
        (Math.min(Math.max(0, ms - receivedAt), STALE_AFTER_MS) * s.clock.speed) / 1000;
      return Math.min(s.config.duration_s, s.clock.position_s + Math.max(0, elapsed));
    },
    [receivedAt],
  );

  const link: LinkState = !access
    ? openError
      ? "offline"
      : "connecting"
    : linkError && (!lastOkAt || now - lastOkAt > STALE_AFTER_MS * 4)
      ? "offline"
      : playing && lastOkAt && now - lastOkAt > STALE_AFTER_MS
        ? "stale"
        : "live";

  return {
    access,
    snapshot,
    /** May trail the snapshot by one revision while a new outlook loads; see outlookCurrent. */
    outlook:
      hasRoute && link === "live" && outlook?.revision === snapshot?.revision ? outlook : null,
    outlookCurrent: Boolean(
      link === "live" && outlook && snapshot && outlook.revision === snapshot.revision,
    ),
    alerts,
    updateAlert,
    acknowledgeAll,
    link,
    lastOkAt,
    openError,
    linkError,
    retryOpen: () => setAttempt((n) => n + 1),
    lastCommand,
    command,
    launch,
    replan,
    inject,
    clockAt,
    refreshOutlook: loadOutlook,
    follow,
    setFollow,
    reportOpen,
    setReportOpen: changeReportOpen,
    completionOpen,
    finished,
    completedReport,
    reportSave,
    reportSaveError,
    retryReportSave: () => void archiveReport().catch(() => {}),
  };
}

export type Expedition = ReturnType<typeof useExpeditionState>;
const ExpeditionContext = createContext<Expedition | null>(null);

/** The page's single mission-state owner: one session, shared by the map, HUD, LARA and steps. */
export function ExpeditionProvider({ children }: { children: ReactNode }) {
  const value = useExpeditionState();
  return <ExpeditionContext value={value}>{children}</ExpeditionContext>;
}

export function useExpedition(): Expedition {
  const value = useContext(ExpeditionContext);
  if (!value) throw new Error("useExpedition needs an ExpeditionProvider above it.");
  return value;
}

/** Shared session credentials for consumers that poll on their own, such as LARA. */
export function useExpeditionAccess() {
  const access = useExpedition().access;
  return useMemo(() => access, [access]);
}
