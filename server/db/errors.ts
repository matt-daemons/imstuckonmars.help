const applicationTables = new Set([
  "mission_sessions",
  "mission_commands",
  "data_releases",
  "source_products",
  "moxie_runs",
  "moxie_samples",
]);

/** Drizzle wraps D1 errors with query text; inspect causes without exposing SQL or bindings. */
export function missingDatabaseSchema(error: unknown): boolean {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    const table = /\bno such table: (?:main\.)?["`]?([a-z_]+)["`]?\b/i.exec(error.message)?.[1];
    if (table && applicationTables.has(table.toLowerCase())) return true;
    error = error.cause;
  }
  return false;
}
