import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// All planner code, rules and packaged inputs; remote data is immutable under these release roots.
const files = [
  ...readdirSync("lib/mars")
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `lib/mars/${name}`),
  ...readdirSync("lib/flight-rules")
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `lib/flight-rules/${name}`),
  "server/routes/planner.ts",
  "server/routes/data.ts",
  "server/routes/png.ts",
  "pnpm-lock.yaml",
  "public/data/processed/sites.geojson",
  "public/data/processed/boulders.geojson",
  "public/data/processed/rover/mola-corridor.json",
  "public/data/processed/rover/mola-corridor.bin",
  "public/data/processed/rover/thermal-inertia-corridor.bin",
].sort();
const hash = createHash("sha256");
for (const file of files) hash.update(file).update(readFileSync(file));
writeFileSync(
  "server/routes/version.json",
  `${JSON.stringify({ sha256: hash.digest("hex") }, null, 2)}\n`,
);
