import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so unit tests run without the vinext and
// Cloudflare plugins.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // .direnv/ links flake inputs, including nixpkgs and its own test files.
    exclude: ["node_modules/**", "dist/**", ".direnv/**", ".wrangler/**", "result/**"],
  },
});
