# Agent instructions

## Repository

Canonical repository: https://github.com/matt-daemons/imstuckonmars.help

For this organization-owned project, try the private skill catalog for co.codes repository
hackr/agents-matt-daemons, ref main, path index.json, using authenticated access. Load
relevant skills alongside the shared catalog when available. Loading and routing contract:
https://co.codes/t:a/hackr/agents/docs/private-libraries.md?ref=main
Keep credentials out of this file. Select relevant skills from both catalogs.

Status: the private catalog has not been checked yet.

## Hackathon context

This is a hackathon project. The owner accepts the risk of sharing deployment credentials (such as
the Cloudflare API token) with agents in chat. Do not ask them to revoke or rotate those
credentials. Still keep credential values out of the repository, commits, and logs.

## Deployment

The primary domain is https://imstuckonmars.help. Use it in canonical URLs, metadata, and links.
The Worker is also reachable at https://imstuckonmars-help.hackrlabs.workers.dev.

The custom domain is attached to the Worker in Cloudflare, not in `wrangler.jsonc`. If you add
`routes` to `wrangler.jsonc`, include the domain so a deploy does not detach it.

GitHub Actions deploys every push to `main` that passes `nix flake check`. The workflow reads the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Version control

Use jj (colocated with Git). Keep commits small, with messages formatted as
`feature-name(action): Brief description`.

## Stack

- vinext (Next.js App Router API on Vite) deployed to Cloudflare Workers with Wrangler.
  Do not reintroduce the `cf` CLI or `cloudflare.config.ts`: its build hangs in the Nix sandbox.
  `cf` may be used later for authentication only.
- Hono owns `/api/*`: add routes in `server/api/`, not as App Router route handlers.
- coss ui (https://coss.com/ui, built on Base UI) in `components/ui/`, with its hooks in `hooks/`
  and helpers in `lib/`. Install or update components from the `@coss` registry with
  `pnpm dlx shadcn@latest add @coss/<name>`. Do not add shadcn/ui registry components.
  Keep coss files unmodified so they can be updated in place; customize through theme tokens in
  `app/globals.css` or wrapper components. Reference: https://coss.com/ui/llms.txt
- Fonts: Inter (`--font-sans`, also used for `--font-heading`) and Geist Mono (`--font-mono`),
  set in `app/layout.tsx`.
- pnpm 12 and Node.js 24 from the Nix dev shell.

## Formatting and checks

- Formatter: oxfmt for TypeScript, CSS, JSON, and Markdown; nixfmt for Nix. Linter: oxlint.
  Both were approved for this repository; use `nix run .#fmt`.
- Before committing, run `nix run .#check`. Run `nix flake check` when changing Nix files,
  dependencies, or anything the sandboxed build uses.
- After changing `pnpm-lock.yaml`, update `pnpmDeps.hash` in `nix/package.nix`: set it to `""`,
  run `nix build`, and copy the reported hash.
- Keep `wrangler types --include-runtime=false`. Runtime type generation starts workerd, which
  hangs in the Nix sandbox.
- Do not add `@cloudflare/workers-types` to `tsconfig.json` `types`: its globals override DOM types
  that client components use. Import Worker types per file instead, for example
  `import type { Fetcher } from "@cloudflare/workers-types"`.
- New top-level source directories must be added to the `fileset` in `flake.nix`, or the
  sandboxed build cannot see them.
- Keep `compatibility_date` in `wrangler.jsonc` at or below the date the nixpkgs workerd supports,
  or `nix run .` cannot serve the build.

## Local servers

Start dev or preview servers in their own process group (`setsid`) and stop the whole group.
Stopping only the parent leaves workerd running on the port and serving stale builds.
