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
  MOXIE, RAD and REMS were removed by the approved cleanup. Never restore catalog rows as
  weather samples or attach sol-816 weather to other experiments or a hypothetical base.
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

## Version control

Use Git in this checkout; jj metadata is absent. Keep commits small, with messages formatted as
`feature-name(action): Brief description`.
Never discard others' changes, edit generated files/CHANGELOG.md manually, or auto-add an
agent co-author. Use plain hyphens, not em dashes, in authored text.

## Stack

- vinext (Next.js App Router API on Vite) deployed to Cloudflare Workers with Wrangler.
  Do not reintroduce the `cf` CLI or `cloudflare.config.ts`: its build hangs in the Nix sandbox.
  `cf` may be used later for authentication only.
- Hono owns `/api/*`: add routes in `server/api/`, not as App Router route handlers.
- shadcn/ui (base-nova, Base UI primitives) in `components/ui/`.
- pnpm 12 and Node.js 24 from the Nix dev shell.
- Reuse TypeScript, React, Tailwind, Vitest and existing state/component patterns. No geospatial
  database, AI framework or mapping replacement is approved. Public `/api/*` remains Hono-owned.
  Telemetry uses the existing TypeScript Worker and D1 only. Do not revive the superseded
  FastAPI/WebSocket proposal, add R2, or introduce a second mission-state owner. Remote D1
  credentials/entitlement and a non-sentinel database ID are required before remote operations.

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
- Before geospatial integration, test Mars coordinate round trips, flat/planar slopes, missing
  masks, no-path/corner-cutting, asymmetric returns, resource units/dwell/reserves, and stale
  revisions. Begin bug fixes with end-user E2E reproduction. Validate real data/map alignment
  and the packaged mission flow; synthetic fixtures prove algorithms, not scientific claims.
- New scientific static assets must be included in the explicit `flake.nix` source fileset where
  required. Prove the packaged build serves them, not just the development checkout.

## Local servers

Start dev or preview servers in their own process group (`setsid`) and stop the whole group.
Stopping only the parent leaves workerd running on the port and serving stale builds.
