// Typed browser client for the mission API. Types come from the server modules; `import type`
// keeps server code out of the client bundle.
import type { createSession, outlook, preview, report, snapshot } from "@/server/mission/service";
import type { ExpeditionPlan } from "./expedition";
import type { ReplanOption, ScenarioEvent } from "./types";

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
export type Session = Awaited<ReturnType<typeof createSession>> & { trace_rows: number };
export type MissionOutlook = Awaited<ReturnType<typeof outlook>>;
export type PlanPreview = Awaited<ReturnType<typeof preview>>;
export type MissionReport = Awaited<ReturnType<typeof report>>;

export interface MissionAccess {
  id: string;
  token: string;
}

/** Event payload without an ID; `at_s: "now"` is resolved by the server clock. */
type EventInput<T> = T extends ScenarioEvent
  ? Omit<T, "id" | "at_s"> & { at_s?: number | "now" }
  : never;
export type EventRequest = EventInput<ScenarioEvent>;

export type Command =
  | { type: "play" | "pause" | "reset" | "end" }
  | { type: "speed"; speed: number }
  | { type: "seek"; at_s: number }
  | { type: "plan"; plan: ExpeditionPlan }
  | { type: "replan"; option: ReplanOption }
  | { type: "event"; event: EventRequest & { id: string } };

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal: AbortSignal.timeout(20_000),
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "The mission server did not respond. Check the connection", 0);
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }
  return body as T;
}

/** A UUID outside secure contexts too (plain-HTTP LAN development lacks randomUUID). */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const missionApi = {
  open: () => request<Session>("/api/expeditions", { method: "POST" }),
  snapshot: (m: MissionAccess) => request<Snapshot>(`/api/missions/${m.id}`, {}, m.token),
  outlook: (m: MissionAccess) =>
    request<MissionOutlook>(`/api/missions/${m.id}/outlook`, {}, m.token),
  preview: (m: MissionAccess, plan: ExpeditionPlan, signal?: AbortSignal) =>
    request<PlanPreview>(
      `/api/missions/${m.id}/preview`,
      { method: "POST", body: JSON.stringify({ plan }), ...(signal ? { signal } : {}) },
      m.token,
    ),
  report: (m: MissionAccess) => request<MissionReport>(`/api/missions/${m.id}/report`, {}, m.token),
  command: (m: MissionAccess, command: Command, expectedRevision: number, commandId = uuid()) =>
    request<Snapshot & { applied_revision: number; idempotent_replay: boolean }>(
      `/api/missions/${m.id}/commands`,
      {
        method: "POST",
        body: JSON.stringify({
          ...command,
          command_id: commandId,
          expected_revision: expectedRevision,
        }),
      },
      m.token,
    ),
};
