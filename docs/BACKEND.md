# Telemetry and mission backend

Implementation snapshot: 2026-11-14. This supersedes the earlier Python/FastAPI proposal in [TELEMETRY_ARCHITECTURE.md](TELEMETRY_ARCHITECTURE.md). The application remains TypeScript/Hono on Cloudflare Workers, using Drizzle ORM's native D1 driver. Python is offline acquisition and ingestion only. D1 is the only persistent backend store; no R2, WebSockets, permanent timer or Python server is required. Existing map and dashboard components are untouched.

Homebase integration: [`HOMEBASE_DASHBOARD.md`](HOMEBASE_DASHBOARD.md) documents the map-opened read-only dashboard and `GET /api/telemetry/homebase`. `/mission` opens that view directly; simulations remain on the map, not behind a dashboard entry screen. The earlier implementation snapshot above describes the backend's original landing state. R2 is now separately approved for map assets, not telemetry state. The existing mission APIs remain available for map integration.

Map expedition integration (2026-11-15): [`EXPEDITION.md`](EXPEDITION.md) documents the implemented route handoff, browser-safe admission, shared session, deterministic replan options, fault controls and report. These supersede the original pending-integration notes below for the map; the historical external return-assessment API remains available.

## Data and storage

`data/telemetry/sources.json` is the generated provenance authority. `scripts/telemetry/acquire.py` verified 132 retained files using official NASA/PDS labels, upstream checksums or byte comparison against the official MOXIE archive. The approved cleanup removed 318 unused files, totaling 404,345,694 bytes. Do not edit source CSV/XML files. Acquisition is not part of serving or building the Worker.

The full **offline** normalized release contains:

| Data                                                         |                  Products |                   Observation rows |
| ------------------------------------------------------------ | ------------------------: | ---------------------------------: |
| MOXIE calibrated runs with derived companions where acquired | 23 calibrated, 22 derived | 235,992 joined engineering samples |
| MEDA sol 816                                                 |   6 calibrated, 4 derived |             459,920 sensor samples |

The audit reproduces **122.27199526472222 g** of current-derived oxygen, **11,348.795281 Wh** summed archived run energy and **72,799 active seconds**. These are historical experiment quantities, not crew inventory, independently measured flow or verified purity. The SQLite release is 152,674,304 bytes and the data SQL is approximately 131 MB. Regenerate exact sizes and hashes rather than relying on these snapshot figures.

Production uses the separate `nasa-demo-50k-v1` release, capped at 50,000 total application rows and 90,000 estimated import writes including indexes. It contains **43,613 rows**, including 12,233 complete sol-816 MOXIE samples, 28,059 matching ATS/PS/RHS/TIRS/ancillary samples, metadata and recomputed rollups. The remote import used **84,141 actual writes** and the database is **9.12 MB**. RDS/engineering and other experiments' raw traces are not deployed. Product/run counts describe deployed rows; warnings preserve original source counts. The 23 historical comparison summaries still describe complete archived experiments, not integrals of this deployed subset. Quality ranges retain original source-row references, including archive sections that are not deployed. Do not upload the full offline release to production.

### Curiosity RAD companion release

Radiation is a separate immutable release, `nasa-rad-sol816-v1`, selected by the `RADIATION_RELEASE` var. It holds two Curiosity RAD Level 2 daily CDFs from NASA SPDF (CDAWeb `MSL_RAD_OBS-L2`), with their own provenance manifest in `data/telemetry/msl_rad_l2/sources.json`: 169 observations, 204 application rows and about 380 import writes. Keeping it separate leaves `nasa-demo-50k-v1` and its manifest byte-for-byte unchanged and avoids reimporting about 84,000 rows. `migrations/0002_radiation.sql` adds `rad_observations`, keyed by UTC observation start (MSL SCLK is not comparable with Perseverance SCLK). Dose rates keep the archived unit, µGy/day. Observations flagged by the source (`Cmds` commanding, `DAN` neutron-instrument firing) and out-of-range values are null, with ranges in `quality_issues`. Values, statistics and caveats are in [TELEMETRY_ANALYSIS.md](TELEMETRY_ANALYSIS.md#rad).

RAD is at Gale crater, about 3,800 km from Jezero. It is a distant historical proxy aligned by UTC, not radiation at Jezero or the hypothetical base, and absorbed dose in detector material is not dose equivalent or crew exposure.

`migrations/0001_telemetry.sql` deliberately uses:

- `data_releases`, `source_products` and `field_definitions` for versioned provenance, checksums, official URLs, source/normalized units and processing rules.
- Seven typed MEDA tables, rather than a JSON blob per product or one row per scalar channel. Primary keys retain source-row identity. Product/time indexes support bounded chart windows.
- `moxie_runs` and `moxie_samples` for exact calibrated/derived joins within counter segments. `experiment_summaries` holds reproducible whole-run comparisons.
- `quality_issues` for sparse contiguous source-row ranges, with nullable invalid normalized values. Original values remain in the immutable source files.
- `metric_rollups` for acquired usable-sample chart summaries, not integration across sampling gaps.
- `scenario_presets`, `mission_sessions` and `mission_commands` for acknowledged assumptions, capability hashes, clock anchors and atomic revision/idempotency receipts. Small bounded scenario JSON is appropriate here; observational products are not stored as JSON blobs.

Only published releases are exposed by telemetry/run lookups. Import data first, verify it, then run the generated count-guarded publication SQL. A partial observation import remains staging. Published release IDs are immutable: use a new ID after source or ingestion changes so immutable trace caches cannot serve an older release under a reused ID.

### Drizzle ORM

`server/db/schema.ts` maps all 18 existing tables with their original snake-case names, units, nullable channels, keys, indexes and references. `server/db/index.ts` creates the native `drizzle-orm/d1` client from the request's D1 binding. Hono routes, repositories, diagnostics and mission persistence use typed Drizzle query builders; client-supplied chart fields select only schema-owned columns. Drizzle stays server-side and never enters the frontend bundle.

This adoption requires **no database reset, reimport or schema migration**. The existing `migrations/0001_telemetry.sql` and Wrangler migration history remain authoritative, including `WITHOUT ROWID` storage. Continue applying reviewed SQL migrations with Wrangler, updating the Drizzle mapping alongside any future DDL changes. Do not run a schema push against the populated database or introduce a second migration history. Compatibility tests compare the mapping against the actual SQLite migration. Python's offline bulk import remains SQL-based, not hundreds of thousands of individual ORM inserts.

Mission admission still checks the active-session limit inside its insert statement. Revision updates and command receipts still execute in one atomic D1 batch through Drizzle, with `RETURNING` identifying the successful update. Do not replace either operation with separate read-then-write calls. HTTP envelopes, capability authentication, numerical resource models and frontend contracts are unchanged.

### Scientific limitations preserved

- MEDA is acquired historical **sol-816 Perseverance weather**, not weather at the hypothetical base. Other MOXIE runs do not receive sol-816 weather. Alignment uses SCLK within 0.5 seconds; UTC is an approximate label-anchor derivative. No live-weather claim is supported.
- Missing and SIS fill values are masked before arithmetic. Derived PS still contains two invalid pressure artifacts; coincident relative-humidity artifacts are withheld. Derived does not mean artifact-free.
- Humidity's XML scale is unspecified. Do not label its values as percent. Derived volume mixing ratio has a documented ppm unit. Pressure uncertainty has an XML Kelvin-unit conflict and is withheld.
- TIRS field-of-view flags remain available. Obstructed upward-looking channels are withheld; blank wheel/HGA/SkyCam flags remain unknown, not good. Finite temperatures and zero quality issues do not establish scientific validity.
- Ancillary positions are local M2020_TOPO meters relative to landing, not latitude/longitude or crew positions. RDS optical bands are not dust concentration or astronaut radiation dose.
- Sol 901 retains its elapsed-counter reset, nonzero fault counter and absent derived output. Sol 96's copied absolute timing is quarantined. Missing oxygen output is `null`, not zero. Compressor power is already included in archived total power; do not add it twice.
- REMS, wind, dust measurements and quantitative thermal grids are not acquired. The MEDA wind sensor has no sol-816 product (it was damaged on sol 313). RAD is only in the separate Gale-crater companion release above. Do not synthesize substitutes.

## Reproduce locally

From the repository root, with Python 3 available:

```sh
python3 scripts/telemetry/prepare.py
python3 -m unittest discover -s scripts/telemetry -p 'test_*.py' -v
python3 scripts/telemetry/prepare.py --release nasa-demo-50k-v1 --output generated/production --max-rows 50000 --max-write-units 90000
nix develop --command pnpm exec wrangler d1 migrations apply imstuckonmars --local
nix develop --command pnpm exec wrangler d1 execute imstuckonmars --local --file=generated/production/release-data.sql
nix develop --command pnpm exec wrangler d1 execute imstuckonmars --local --command="PRAGMA foreign_key_check; SELECT * FROM data_releases;"
nix develop --command pnpm exec wrangler d1 execute imstuckonmars --local --file=generated/production/publish.sql
```

The RAD companion release needs the pinned offline packages in `scripts/telemetry/requirements.txt`:

```sh
python3 -m venv .cache/telemetry-venv
.cache/telemetry-venv/bin/pip install -r scripts/telemetry/requirements.txt
.cache/telemetry-venv/bin/python scripts/telemetry/acquire_rad.py   # only to re-verify sources
.cache/telemetry-venv/bin/python scripts/telemetry/prepare_rad.py
.cache/telemetry-venv/bin/python -m unittest discover -s scripts/telemetry -p 'test_*.py'
pnpm exec wrangler d1 migrations apply imstuckonmars --local
pnpm exec wrangler d1 execute imstuckonmars --local --file=generated/radiation/release-data.sql
pnpm exec wrangler d1 execute imstuckonmars --local --file=generated/radiation/publish.sql
```

Import into an empty migrated database once. These inserts intentionally fail on duplicate releases rather than silently replacing verified data. Do not retry a partial import blindly or delete an existing database without reviewing its contents. `generated/`, `.cache/`, `.wrangler/` and secrets are ignored. `prepare.py` only regenerates its output, never modifies NASA products. Its data-only statements stay below D1's 100 KB statement limit and contain no parameter-heavy bulk bindings.

Copy `.dev.vars.example` to `.dev.vars`, then set a randomly generated `MISSION_WRITE_KEY`. Leave AI credentials absent for deterministic-only mode. Build and serve the actual Worker:

```sh
nix run .#build
nix develop --command pnpm exec wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state --port 8787
```

Use a dedicated process group when running the server in automation. On macOS without a `setsid` executable, Python `subprocess.Popen(..., start_new_session=True)` provides this; stop the whole group with `os.killpg`. The packaged Nix build includes SQL migrations, but not the 150 MB observational database or source files. Use the populated state directory explicitly when previewing that package.

In another terminal, set `MISSION_WRITE_KEY` to the same local key and run:

```sh
ARES_TEST_RELEASE=nasa-demo-50k-v1 ARES_TEST_BOUNDED=1 python3 scripts/telemetry/e2e.py
nix run .#check
nix flake check path:.
```

The HTTP test creates and deletes only its own disposable mission. It exercises NASA totals/availability, MEDA replay, reset segments, authentication, pause/play/speed/seek, scenario failures, idempotency, stale revisions, concurrent commands, return uncertainty and deterministic diagnostics. It expects AI credentials to be absent. Python regressions additionally verify every retained hash, table counts, masks, metadata exceptions, totals, statement sizes and partial-publication protection. Synthetic unit fixtures establish model accounting, not NASA instrument validity or physiological safety.

## API and frontend handoff

Hono owns all routes. `app/api/[[...route]]/route.ts` forwards actual `cloudflare:workers` bindings to it. `server/api/app.ts` applies a 64 KiB request-body limit, no-store responses, input validation and sanitized errors.

### Telemetry

| Method/path                                                                      | Use                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/telemetry/releases`                                                    | Published releases                                                                                         |
| `GET /api/telemetry/products`                                                    | Product metadata, provenance and availability                                                              |
| `GET /api/telemetry/products/:id/quality?after_row=0`                            | Field definitions and up to 500 issue ranges; truncated responses are flagged                              |
| `GET /api/telemetry/environment?sensor=ats&fields=ats_local_temp1&limit=1000`    | Preferred sol-816 product; explicit product selection via `product_id` is also supported                   |
| `GET /api/telemetry/environment?product_id=...&fields=...&from_ms=...&to_ms=...` | SCLK-millisecond windows, maximum one hour and eight fields; `after_row` pagination; maximum 5,000 samples |
| `GET /api/telemetry/environment?product_id=...&fields=...&resolution=60s`        | Single-field rollups; inspect counts and gaps                                                              |
| `GET /api/telemetry/moxie/runs`                                                  | Experiment availability/timing warnings                                                                    |
| `GET /api/telemetry/moxie/runs/:id/samples?after_row=0&limit=1000`               | Source-row pagination, units, provenance, nullable derived channels                                        |
| `GET /api/telemetry/moxie/comparison`                                            | Whole-run summaries, active convention and energy-reconstruction residuals                                 |
| `GET /api/telemetry/radiation?from_ms=...&to_ms=...`                             | Curiosity RAD observations by UTC observation start (ms), with fields, quality ranges and proxy caveats    |

Read `unit`, warnings and quality definitions rather than guessing chart labels. Never turn nulls into zero, interpolate across source gaps, integrate decimated chart averages, or relocate historical observations to a scenario base. Geometry flags are not automatically meteorological validity flags.

### Mission state and commands

`GET /api/missions/presets` returns illustrative assumptions. `POST /api/missions` accepts `{ "config": <validated configuration> }` and requires `Authorization: Bearer <MISSION_WRITE_KEY>`. See `lib/mission/demo-preset.json` and `lib/mission/validation.ts` for the authoritative contract. The response includes `id`, a one-time 256-bit capability `token`, revision zero and a 24-hour expiration. Only the capability hash is stored.

Do not ship the creation/AI access key in a browser bundle. `POST /api/expeditions` is the browser-safe, rate-limited admission boundary for the fixed idle preset; it does not accept arbitrary configurations. Every mission capability grants read/write access to that session; there is no separate viewer role or user-account login.

Subsequent endpoints require `Authorization: Bearer <mission-token>`:

| Method/path                            | Use                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/missions/:id`                | One revisioned snapshot containing config, clock, events, modeled inventories and synchronized observations |
| `GET /api/missions/:id?at_s=1800`      | Pure historical inspection; does not change the persisted clock                                             |
| `POST /api/missions/:id/commands`      | Play, pause, speed, seek, reset, configure or insert an event                                               |
| `GET /api/missions/:id/events`         | Simulated event history                                                                                     |
| `POST /api/missions/:id/assess-return` | Validate a supplied directed return estimate and model resource margins                                     |
| `POST /api/missions/:id/diagnostics`   | Deterministic findings or optional AI explanation                                                           |
| `DELETE /api/missions/:id`             | Delete the authorized mission and its command receipts                                                      |

Example command:

```json
{
  "command_id": "client-generated-unique-id",
  "expected_revision": 0,
  "type": "seek",
  "at_s": 1800
}
```

All successful commands increment revision exactly once through a D1 batch with a revision-guarded update and command receipt. Retry the identical command ID/body after an uncertain response. Reusing an ID for different contents or sending a stale revision returns 409. A retry returns the current snapshot plus the original `applied_revision`, not a frozen replay of its original response. Concurrent conflicting commands have one winner; reload before making a new decision. A mission supports 500 commands, 100 events, 100 schedule segments and at most six hours. Creation is capped at 100 unexpired sessions. Expired sessions cannot be accessed; physical expiry cleanup is an operator responsibility.

`end` freezes the current evaluated state and persists clock mode `ended`. It does not complete the route. Only `reset` or `plan` may subsequently change an ended run; other commands return 409 `simulation_ended`. Reads and idempotent retries of the original command remain available. Reports include `ended_by_operator` to distinguish an early stop from a completed return. No schema migration is needed: the mode uses the existing persisted clock JSON.

`speed` accepts `speed` from 0.1 to 100. `seek` accepts `at_s` and pauses. `reset` clears events and returns to zero, retaining the config. `configure` accepts a complete `config` only after resetting. `plan` and `replan` are documented in [EXPEDITION.md](EXPEDITION.md). `event` accepts an `event` with `id`, `type`, `at_s` (or `"now"`) and type-specific `target`/`value`. Supported types are `generator_failure`, `generator_restore`, `generation_change`, `oxygen_leak`, `consumption_change`, `battery_failure`, `route_blocked`, `transfer_oxygen` and `transfer_energy`. Insert past events only after pausing/seeking. Event ordering at identical times follows insertion order.

The backend owns the request-driven wall-clock anchor and calculations. No persistent process ticks inventories. Poll snapshots, initially about once per second, and display their values rather than decrementing separate frontend inventories. Speed changes waiting time, not modeled resource cost. Revision identifies command/config history; logical time and `server_time_ms` order snapshots within a playing revision. Drop out-of-order responses. Clock snapshots anchor their displayed `position_s` at `anchor_ms`; historical inspection is paused and non-mutating. Recompute seeks from initial conditions and event history.

The engine integrates each one-second source row over `[n,n+1)`, with exact splits at events, schedule boundaries and battery depletion. Missing samples, gaps or counter resets stop replay. Tank capacity/venting, leaks, consumed/unmet oxygen, charge/discharge efficiency, power limits, curtailment, failure losses and first reserve crossings are explicit. Portable and base inventories are separate. Transfers require activity `base` and conserve mass/energy with stated transfer losses. A generator without enough power shuts down and stays latched until an explicit restore; continued archived readings are not evidence of simulated production. `state.observed_sample` and effective rates describe the last integrated source interval; `observed.moxie` is the cursor's display sample.

Snapshots include `observed.radiation`: the latest RAD observation that started at or before the replayed MOXIE sample's approximate UTC, within 30 minutes. Its `status` is `observation_available`, `observation_flagged` (values withheld), `sampling_gap`, `time_unresolved` (runs without resolved UTC, such as sol 96), `release_unavailable` or `not_configured`. It always carries the Gale-crater proxy statement, limitations and a citation path. Radiation never changes modeled inventories, and a radiation lookup failure never fails a snapshot. The series is immutable, so snapshots read it from the Workers cache rather than D1.

### External route-planner boundary

No route planner is replaced or invented. The route owner supplies:

```json
{
  "at_s": 1800,
  "route": {
    "id": "directed-return-from-current-position",
    "revision": "planner-r7",
    "mission_revision": 1,
    "base_id": "hypothetical-base",
    "evaluated_at_s": 1800,
    "status": "ok",
    "legs": [{ "activity": "return", "duration_s": 1200 }],
    "warnings": []
  }
}
```

Submit to `assess-return`. Status is `modeled_resource_feasible`, `modeled_constraint_violation` or `unknown`, never “safe.” Planner status can be `ok`, `no_path` or `unknown_data`. Base ID, mission revision and evaluation time must match. Directed leg durations must come from the actual return planner, not twice the outbound distance. Demand uses explicit profiles, crew count, current portable leak, discharge efficiency, power limits, remaining inventories and reserve assumptions. Prior unmet demand prevents a clean feasibility result. A scenario event during the proposed return makes the result unknown because this version does not project those future events through the external route. Terrain/path validity, life support and physiology remain outside this resource-only assessment. Actual geometry integration still needs the route owner's contract.

### Diagnostics and optional AI

Send `{ "mode": "deterministic", "at_s": 1800 }` to diagnostics for rule-based reason codes, evidence paths, inventory accounting, applied simulated events and `context.radiation`. A flagged or unavailable radiation observation adds a finding. No AI key is necessary.

Optional AI mode accepts `{ "mode": "ai", "question": "Explain the oxygen change", "at_s": 1800 }`. It additionally requires `X-Diagnostics-Authorization: Bearer <MISSION_WRITE_KEY>`, server secret `DIAGNOSTICS_API_KEY` and nonempty `DIAGNOSTICS_MODEL`. Set `DIAGNOSTICS_PROVIDER` to `openrouter` or `openai`; Wrangler defaults to OpenRouter, while deployments without the setting retain the OpenAI fallback. The key must match the selected provider. The adapter uses [OpenRouter Chat Completions](https://openrouter.ai/docs/api/reference/overview) or the [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Only those fixed HTTPS endpoints are allowed; redirects are rejected.

Choose an explicit model with tool-calling support. Wrangler defaults to `openai/gpt-4.1-mini` through OpenRouter. Local `.dev.vars` can override `DIAGNOSTICS_PROVIDER` and `DIAGNOSTICS_MODEL` alongside the key. Omit the key for deterministic-only mode. Deployment secrets must be set separately through Wrangler; `.dev.vars` is local-only. Do not upload deployment credentials such as `CLOUDFLARE_API_TOKEN` as Worker secrets.

Only five read tools exist: the pinned mission snapshot, up to 120 recent MOXIE samples, bounded source/quality metadata, the 23 experiment summaries and RAD observations within three hours of the mission cursor. No SQL, arbitrary URLs, write tools, session credentials, autonomous actions or safety decisions are exposed. The provider gets at most three requests/four read calls within a 45-second deadline. Output is labeled unverified AI commentary and returned alongside actual evidence and deterministic results. Render it as text, not trusted HTML. Missing credentials return 503 `ai_not_configured`; provider/tool failures return 503 `ai_unavailable`. Both provider adapters are tested with mocks. An authenticated OpenRouter smoke test with `openai/gpt-4.1-mini` completed a read-tool round trip using explicitly synthetic fixtures; production mission diagnostics and scientific explanation quality remain unverified. Review account-level spending/rate controls before enabling AI for broader use.

## Production deployment

`wrangler.jsonc` binds the existing project database `imstuckonmars` in the account serving `hackrlabs.workers.dev`; it is not a temporary account or a new database for another domain. The primary custom domain remains `https://imstuckonmars.help`, attached in Cloudflare rather than replaced by a Wrangler route. The bounded release was imported and count-guarded publication passed. No billing-plan upgrade was made.

Deployments never apply migrations. Roll out the radiation release in this order: apply `0002_radiation.sql` with `--remote`, import `generated/radiation/release-data.sql`, check foreign keys, run its guarded `publish.sql`, then deploy the Worker with `RADIATION_RELEASE` set. Code deployed before the data reports `release_unavailable` instead of failing.

The production creation key is a server-side Worker secret. Its owner-only local copy is in the ignored `generated/deployment/mission-write-key` file; never commit it, log it, embed it in a browser or use the local E2E example key in production. AI uses the OpenRouter provider and model in `wrangler.jsonc` with the `DIAGNOSTICS_API_KEY` Worker secret; deterministic diagnostics work without it.

For future operations:

1. Keep production releases within the approved **50,000-row cap**, counting metadata and rollups, and budget secondary-index writes too. Never reimport a release on every build or deploy. Free D1 allows 100,000 writes and 5 million reads per UTC day across the account; other databases and runtime traffic share those limits. Check account-wide analytics and [current pricing/limits](https://developers.cloudflare.com/d1/platform/pricing/) before any additional import. A row cap alone is not a daily traffic quota.
2. For an explicitly approved new release, generate it under a new immutable ID with both budgets, verify it locally, apply reviewed migrations with `--remote`, import only the bounded data SQL, inspect returned actual write counts and foreign keys, then run guarded publication SQL. Do not replace or reset an existing published release blindly.
3. Rebuild and deploy with `pnpm run deploy`. Verify the custom domain, real D1 binding and published release, plus mission commands and return assessments. Local HTTP latency is not a deployed CPU-limit measurement. Immutable traces use the Workers Cache API as an optional acceleration, not an authoritative state store.
4. The map now shares one mission ID/revision/clock through the expedition provider and uses rate-limited preset admission. User-account login, live-provider verification and production load testing remain separate work. Do not add another resource simulation in the frontend.
