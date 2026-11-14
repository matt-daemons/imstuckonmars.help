export type ApiBindings = Omit<
  Partial<Cloudflare.Env>,
  "TELEMETRY_RELEASE" | "DIAGNOSTICS_MODEL"
> & {
  TELEMETRY_RELEASE?: string;
  DIAGNOSTICS_MODEL?: string;
  MISSION_WRITE_KEY?: string;
  DIAGNOSTICS_API_KEY?: string;
};

export function database(bindings: ApiBindings) {
  if (!bindings.DB) throw new Error("D1_BINDING_UNAVAILABLE");
  return bindings.DB;
}
