# Agent instructions

## Repository

Canonical repository: https://github.com/matt-daemons/imstuckonmars.help

For this organization-owned project, try the private skill catalog for co.codes repository
hackr/agents-matt-daemons, ref main, path index.json, using authenticated access. Load
relevant skills alongside the shared catalog when available. Loading and routing contract:
https://co.codes/t:a/hackr/agents/docs/private-libraries.md?ref=main
Keep credentials out of this file. Select relevant skills from both catalogs.

Status: the private catalog has not been checked yet.

## Version control

Use jj (colocated with Git). Keep commits small, with messages formatted as
`feature-name(action): Brief description`.

## Stack

- vinext (Next.js App Router API on Vite) deployed to Cloudflare Workers with Wrangler.
  Do not reintroduce the `cf` CLI or `cloudflare.config.ts`: its build hangs in the Nix sandbox.
  `cf` may be used later for authentication only.
- Hono owns `/api/*`: add routes in `server/api/`, not as App Router route handlers.
- shadcn/ui (base-nova, Base UI primitives) in `components/ui/`.
- pnpm 12 and Node.js 24 from the Nix dev shell.

## Formatting and checks

- Formatter: oxfmt for TypeScript, CSS, JSON, and Markdown; nixfmt for Nix. Linter: oxlint.
  Both were approved for this repository; use `nix run .#fmt`.
- Before committing, run `nix run .#check`. Run `nix flake check` when changing Nix files,
  dependencies, or anything the sandboxed build uses.
- After changing `pnpm-lock.yaml`, update `pnpmDeps.hash` in `nix/package.nix`: set it to `""`,
  run `nix build`, and copy the reported hash.
- Keep `wrangler types --include-runtime=false`. Runtime type generation starts workerd, which
  hangs in the Nix sandbox. Runtime types come from `@cloudflare/workers-types`.
- Keep `compatibility_date` in `wrangler.jsonc` at or below the date the nixpkgs workerd supports,
  or `nix run .` cannot serve the build.

## Local servers

Start dev or preview servers in their own process group (`setsid`) and stop the whole group.
Stopping only the parent leaves workerd running on the port and serving stale builds.
