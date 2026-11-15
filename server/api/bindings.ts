import type { D1Database } from "@cloudflare/workers-types";

export type ApiBindings = Omit<
  Partial<Cloudflare.Env>,
  "DB" | "TELEMETRY_RELEASE" | "DIAGNOSTICS_MODEL" | "DIAGNOSTICS_PROVIDER"
> & {
  DB?: D1Database;
  TELEMETRY_RELEASE?: string;
  DIAGNOSTICS_MODEL?: string;
  DIAGNOSTICS_PROVIDER?: string;
  MISSION_WRITE_KEY?: string;
  DIAGNOSTICS_API_KEY?: string;
};

export function database(bindings: ApiBindings) {
  if (!bindings.DB) throw new Error("D1_BINDING_UNAVAILABLE");
  return bindings.DB;
}
