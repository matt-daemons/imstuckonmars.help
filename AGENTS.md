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

GitHub Actions deploys every push to `main` that passes its checks. The workflow reads the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Commits

Keep commits small, with messages formatted as `feature-name(action): Brief description`.

## Stack

- vinext (Next.js App Router API on Vite) deployed to Cloudflare Workers with Wrangler.
  Do not reintroduce the `cf` CLI or `cloudflare.config.ts`. `cf` may be used later for
  authentication only.
- Hono owns `/api/*`: add routes in `server/api/`, not as App Router route handlers.
- coss ui (https://coss.com/ui, built on Base UI) in `components/ui/`, with its hooks in `hooks/`
  and helpers in `lib/`. Install or update components from the `@coss` registry with
  `pnpm dlx shadcn@latest add @coss/<name>`. Do not add shadcn/ui registry components.
  Keep coss files unmodified so they can be updated in place; customize through theme tokens in
  `app/globals.css` or wrapper components. Reference: https://coss.com/ui/llms.txt
- `/design-system` (`app/design-system/`) shows every component and theme token. When you add a
  component, variant, or token, add it there too.
- Visual design: the Hermes theme, after Territory Studio's screen graphics for The Martian
  (https://territorystudio.com/project/the-martian, the Hermes screens). Dark only (`dark` is
  always set on `<html>`): black surfaces, cyan hairline borders, square corners (`--radius: 0`),
  flat surfaces, tinted panel header bars, condensed titles and control labels in mixed case, and
  monospace numeric readouts. Cyan is the primary/info accent, green is success, amber is warning,
  red is error. Do not add a light theme or rounded, shadowed surfaces.
- Theme lives in `app/globals.css`: tokens in `:root`, and Hermes treatments applied to coss
  `data-slot` selectors. Rules that must beat coss utility classes go outside `@layer`.
- Fonts: Barlow (`--font-sans`), Barlow Condensed (`--font-heading`), and JetBrains Mono
  (`--font-mono`), set in `app/layout.tsx`.
- pnpm 12 and Node.js 24.

## UI standards

Always load and follow `.agents/skills/operational-ui-standards/SKILL.md` when building, changing,
or reviewing any UI in this repository, including components, theme tokens, and
`/design-system`.

The skill governs data, alerts, status, and commands. Where it conflicts with the Hermes theme
above, it wins, with these accepted deviations:

- K-1 and K-2: cyan is this project's advisory hue in place of blue. It also stays the chrome
  accent (hairline borders, panel header bars, primary controls), so Info alerts always carry
  their icon (K-4) to stand apart from chrome.
- K-2: red also marks destructive actions (`destructive` button variants), and yellow also forms
  the hazard tape below.
- K-3: green means success only.

Alert levels use coss variant names. In the skill's terms, from highest priority:

| Level     | Skill level | Tokens        | Treatment beyond color                                |
| --------- | ----------- | ------------- | ----------------------------------------------------- |
| Emergency | Emergency   | `destructive` | Siren icon. Flashing reverse video until acknowledged |
| Error     | Warning     | `destructive` | Error icon                                            |
| Warning   | Caution     | `warning`     | Warning icon. Used as a note, not as a danger         |
| Info      | Advisory    | `info`        | Info icon                                             |

Warning is a note, so AL-5 (link to a procedure) applies to Emergency and Error only.

Emergency alerts flash the whole alert until acknowledged, then take the static error alert look,
keeping the siren icon and title. Mark acknowledgment with `data-acknowledged`. F-2 rates follow
the element: anything containing text uses the low rate (0.8 Hz, 70% in reverse video), even at
the highest priority. The high rate is for a standalone non-text indicator only. Never flash just
the icon of an alert.

Hazard is not an alert level. Black and yellow hazard tape (`data-hazard` on
`AlertDialogPopup`) marks the confirmation dialog of a dangerous or irreversible action (C-1). It
replaces C-3's striped border on the control itself: the trigger uses a `destructive` button
variant instead. The tape goes on borders only, never behind text (K-5).

Every other skill rule applies as written, including T-4 (mixed case) and K-5 (6:1 text
contrast).

Acronym glossary (T-4): API, EVA, MAV (Mars Ascent Vehicle), MTC (Mars Coordinated Time), OTP,
and UI. Add an acronym here before using it in the UI.

## Formatting and checks

- Formatter: oxfmt for TypeScript, CSS, JSON, and Markdown. Linter: oxlint. Both were approved
  for this repository; use `pnpm fmt`.
- Before committing, run `pnpm fmt:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build`.
- Keep `wrangler types --include-runtime=false`.
- Do not add `@cloudflare/workers-types` to `tsconfig.json` `types`: its globals override DOM types
  that client components use. Import Worker types per file instead, for example
  `import type { Fetcher } from "@cloudflare/workers-types"`.

## Local servers

Start dev or preview servers in their own process group (`setsid`) and stop the whole group.
Stopping only the parent leaves workerd running on the port and serving stale builds.
