import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "./schema";

const sqlite = new DatabaseSync(":memory:");
// Apply every Wrangler migration in order, as D1 does.
const migrations = new URL("../../migrations/", import.meta.url);
for (const name of readdirSync(migrations)
  .filter((file) => file.endsWith(".sql"))
  .sort())
  sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
afterAll(() => sqlite.close());
const tables = Object.values(schema).filter((value) => is(value, SQLiteTable));

describe("Drizzle mapping of the existing D1 schema", () => {
  it("maps every migration table without requiring destructive schema changes", () => {
    const actual = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    expect(tables.map((table) => getTableConfig(table).name).sort()).toEqual(
      actual.map((row) => row.name),
    );
    expect(tables).toHaveLength(20);
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    it(`preserves ${config.name} column order, types, nullability, keys and indexes`, () => {
      const columns = sqlite.prepare(`PRAGMA table_info("${config.name}")`).all();
      expect(config.columns.map((column) => column.name)).toEqual(columns.map((row) => row.name));
      for (const [index, column] of config.columns.entries()) {
        expect(column.getSQLType()).toBe(String(columns[index].type).toLowerCase());
        // SQLite reports rowid-table TEXT PRIMARY KEY columns as nullable in PRAGMA.
        expect(column.notNull).toBe(Boolean(columns[index].notnull || columns[index].pk));
      }
      const primary = config.columns
        .filter((column) => column.primary)
        .map((column) => column.name);
      for (const key of config.primaryKeys)
        primary.push(...key.columns.map((column) => column.name));
      expect(primary).toEqual(columns.filter((row) => row.pk).map((row) => row.name));
      for (const index of config.indexes) {
        const entries = sqlite.prepare(`PRAGMA index_info("${index.config.name}")`).all();
        expect(entries.map((row) => row.name)).toEqual(
          index.config.columns.map((column) => ("name" in column ? column.name : null)),
        );
      }
    });
  }
});
