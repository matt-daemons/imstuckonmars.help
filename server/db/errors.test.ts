import { describe, expect, it } from "vitest";
import { missingDatabaseSchema } from "./errors";

describe("D1 schema errors", () => {
  it("recognizes the underlying missing table behind a Drizzle query error", () => {
    const error = new Error("Failed query: delete from mission_sessions; params: private", {
      cause: new Error("D1_ERROR: no such table: mission_sessions: SQLITE_ERROR"),
    });
    expect(missingDatabaseSchema(error)).toBe(true);
  });
  it("does not label query failures or foreign-key violations as missing migrations", () => {
    expect(missingDatabaseSchema(new Error("Failed query: delete from mission_sessions"))).toBe(
      false,
    );
    expect(missingDatabaseSchema(new Error("D1_ERROR: FOREIGN KEY constraint failed"))).toBe(false);
    expect(missingDatabaseSchema(new Error("no such table: unrelated"))).toBe(false);
    expect(missingDatabaseSchema(null)).toBe(false);
  });
  it("terminates on a cyclic error cause", () => {
    const error = new Error("query failed");
    error.cause = error;
    expect(missingDatabaseSchema(error)).toBe(false);
  });
});
