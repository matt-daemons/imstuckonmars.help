import type { D1Database } from "@cloudflare/workers-types";
import { createDatabase } from "../db";

export type ApiBindings = Omit<
  Partial<Cloudflare.Env>,
  "DB" | "TELEMETRY_RELEASE" | "RADIATION_RELEASE" | "DIAGNOSTICS_MODEL" | "DIAGNOSTICS_PROVIDER"
> & {
  DB?: D1Database;
  TELEMETRY_RELEASE?: string;
  /** Separate immutable companion release with Curiosity RAD observations. */
  RADIATION_RELEASE?: string;
  DIAGNOSTICS_MODEL?: string;
  DIAGNOSTICS_PROVIDER?: string;
  MISSION_WRITE_KEY?: string;
  DIAGNOSTICS_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
};

export function database(bindings: ApiBindings) {
  if (!bindings.DB) throw new Error("D1_BINDING_UNAVAILABLE");
  return createDatabase(bindings.DB);
}
