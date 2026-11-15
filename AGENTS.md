# ARES agent instructions

## Project and priorities

ARES (Autonomous Rover & Exploration System) is a NASA-data-backed Martian exploration
environment inspired by The Martian. The team targets NASA Space Apps Challenge 2026,
"Interplanetary Survival Guide: Martian Map," using the supplied challenge brief. Confirm the
official challenge-specific page and rubric before claiming compliance; research could not
independently verify them.

The maps and futuristic dashboard have existing development owners. Preserve and integrate
their work; do not rebuild them. Prioritize one bounded Jezero sortie: validated terrain and
evidence inspection, constrained route comparison, explicit modeled return reserves, reviewed
science targets, and deterministic explanations. AI is optional and follows working tools.
Telemetry/resource scenarios use a configurable preset base; do not hard-code the architecture
to Jezero or relocate historical rover measurements to the chosen base.

Read the detailed evidence and proposed scope before implementation:

- `docs/DATA_ANALYSIS.md`: inspected products, metadata conflicts, data gaps and sources.
- `docs/FEATURE_RESEARCH.md`: feature rationale, feasibility and prioritization.
- `docs/IMPLEMENTATION_PLAN.md`: 48-hour ownership, contracts, milestones and tests.
- `docs/TELEMETRY_ANALYSIS.md`: actual local telemetry, statistics, masks and metadata conflicts.
- `docs/SIMULATION_RESEARCH.md`: proposed equations, units, assumptions and unsupported claims.
- `docs/TELEMETRY_FEATURES.md`: five bounded features and dashboard metric specifications.
- `docs/BACKEND.md`: implemented Hono/D1 backend, local verification and frontend/route contracts.
- `docs/TELEMETRY_ARCHITECTURE.md`: superseded Python/FastAPI research, not deployment guidance.

## Confirmed state and scientific boundaries

- The checkout includes the landing-page scaffold and a backend-first Hono/D1 telemetry and
  mission service. Parallel map/dashboard work remains outside this checkout; preserve its
  owners' work. `docs/BACKEND.md` is the current backend handoff and deployment authority.
- The earlier geospatial research inspected CTX DEM/image labels and SIM 3464 metadata, not
  raster samples or geologic geometries. Do not invent elevation/slope statistics. Telemetry
  sources are immutable in `data/telemetry/`; Python acquisition/ingestion is offline-only.
- MOXIE has 23 calibrated and 22 derived runs with one-second engineering samples. Oxygen rate
  is current-derived, not independent flow or crew inventory. Preserve documented schema/time
  conflicts and sol 901's elapsed-counter reset; do not infer verified purity from CS4 or invent
  derived output for sol 901. Elapsed time is unique only within a verified counter segment.
- The retained subset includes calibrated/derived sol-816 MEDA measurements verified against
  official NASA/PDS products. `sources.json` records retained-file provenance. Catalogs, raw
  MOXIE, the 2012 RAD product and REMS were removed by the approved cleanup. Never restore
  catalog rows as weather samples or attach sol-816 weather to other experiments or a base.
- Curiosity RAD Level 2 observations overlapping sol 816 by UTC live in a separate immutable
  release (`RADIATION_RELEASE`, manifest `data/telemetry/msl_rad_l2/sources.json`). They are
  Gale crater absorbed dose rates, a distant proxy: never Jezero/base radiation or crew exposure.
  Wind and dust are not acquired; the MEDA wind sensor has no product after sol 313's damage.
- MEDA derived products still contain artifacts and metadata conflicts. Follow ingestion masks,
  field definitions and geometry warnings; do not assume finite or derived means valid.
- Candidate CTX DEM: 20 m, Jezero, float32; matched image approximately 5 m. PDS4 labels use
  a 3,396,190 m sphere, planetocentric/east-positive coordinates, and equirectangular standard
  parallel 18.4663 degrees. Check actual headers: the web catalog has conflicting metadata.
- SIM 3464 geology uses Mars Transverse Mercator and warns of about 100-200 m registration
  offsets. Contacts are contextual, not exact hazard boundaries. THEMIS numeric data remains
  unacquired; rendered thermal or shaded-relief tiles are not quantitative grids.
- Keep source products immutable; require approval before large downloads. Record source IDs,
  versions, checksum, units, CRS/body, transforms, masks, resolution, processing and attribution.
  Mask missing values before arithmetic; never substitute synthetic data for NASA measurements.
- Separate archived measurements/calibrations, archive-derived quantities, ARES mathematical
  derivatives and assumptions. Crew/tank oxygen, battery state, habitat, crew positions and EVA
  scenarios are simulated, distinct from archived MOXIE engineering telemetry. No operational
  safety, human radiation exposure, live-weather or validated physiological claims are supported.
- Use explicit Mars coordinates/metric calculations, not Earth-default distances or CRS. One
  mission-state owner and revision must synchronize maps, routes, dashboard and simulation.
  The backend owns telemetry/resource sessions. Verify deployed CPU/read limits before scaling;
  the local deterministic engine is bounded and has no permanent process clock.
- AI may propose validated actions and explain deterministic results with citations. It must
  not invent tool outputs, alter reserves silently, override constraints or make safety decisions.

## Repository

Canonical repository: https://github.com/matt-daemons/imstuckonmars.help

For this organization-owned project, try the private skill catalog for co.codes repository
hackr/agents-matt-daemons, ref main, path index.json, using authenticated access. Load
relevant skills alongside the shared catalog when available. Loading and routing contract:
https://co.codes/t:a/hackr/agents/docs/private-libraries.md?ref=main
Keep credentials out of this file. Select relevant skills from both catalogs.

Research access status (2026-11-14): shared catalog loaded; relevant practices, formatting,
technical-writing, architecture and tracing instructions consulted at ref main. Private source
`hackr/agents-matt-daemons`, ref main, path `index.json`, remains unchecked: no authenticated
access mechanism was available. Recheck when authorized access is available; never store tokens.

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
Use plain git on `main`. If a push is rejected, run `git pull --rebase` and push again.

## Stack

- vinext (Next.js App Router API on Vite) deployed to Cloudflare Workers with Wrangler.
  Do not reintroduce the `cf` CLI or `cloudflare.config.ts`. `cf` may be used later for
  authentication only.
- Hono owns `/api/*`: add routes in `server/api/`, not as App Router route handlers.
- Map assets are versioned at `https://tiles.imstuckonmars.help/mars-v2/` in R2.
  Use `docs/MAP_STORAGE.md` for acquisition, publication and verification. Keep large map
  assets out of `public/`; never deploy `pipelines/r2-upload-worker.ts`.
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
- Fonts: Atkinson Hyperlegible Next (`--font-sans`), IBM Plex Sans Condensed (`--font-heading`),
  and JetBrains Mono (`--font-mono`), set in `app/layout.tsx`. Each was chosen to pass T-1
  (lookalike characters). Check any replacement on `/design-system#lookalike-characters` first.
  IDs, values, and numbers always use `--font-mono`.
- pnpm 12 and Node.js 24.
- Telemetry uses the existing TypeScript Worker and D1 only. Do not revive the superseded
  FastAPI/WebSocket proposal or introduce a second mission-state owner. R2 is approved for
  immutable map imagery, terrain and provenance at `tiles.imstuckonmars.help`, not telemetry
  or mission state. Remote D1
  credentials/entitlement and a non-sentinel database ID are required before remote operations.
- Use Drizzle's native D1 driver for application queries. `server/db/schema.ts` maps the existing
  schema; Wrangler SQL migrations remain the DDL authority. Preserve atomic session admission
  and revision/receipt batches. Do not reset populated databases or add a second migration history.
- Production uses the `imstuckonmars` D1 database and the bounded release in `wrangler.jsonc`.
  Keep imports below 50,000 total application rows and budget index writes against the account's
  daily D1 quota. Never upload the full offline release or reimport data on every deployment.
  Add new observational data as a small companion release rather than rebuilding the main one.
  Deploys never apply migrations: apply remote migrations and publish data before deploying code.

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

Acronym glossary (T-4): AI (artificial intelligence), API, CTX (Context Camera), EVA,
HRSC (High Resolution Stereo Camera), MAV (Mars Ascent Vehicle),
MOLA (Mars Orbiter Laser Altimeter), MTC (Mars Coordinated Time), OTP,
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
- Before geospatial integration, test Mars coordinate round trips, slopes, missing masks,
  no-path/corner-cutting, asymmetric returns, resource units/dwell/reserves and stale revisions.
  Validate real data/map alignment and the packaged mission flow; synthetic fixtures establish
  algorithms, not scientific claims. New static assets must be included in packaged builds.

## Local servers

Start dev or preview servers in their own process group (`setsid`) and stop the whole group.
Stopping only the parent leaves workerd running on the port and serving stale builds.
