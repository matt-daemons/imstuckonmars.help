# Telemetry architecture

> Superseded implementation note (2026-11-14): [BACKEND.md](BACKEND.md) describes the implemented TypeScript/Hono/D1 backend, ingestion, commands, diagnostics and local verification. Python is offline-only. The FastAPI/WebSocket design below is retained as historical research, not current architecture or deployment instructions.

## Status and integration boundary

Research snapshot: 2026-11-14. **Proposal only.** No Python service, telemetry endpoint, WebSocket or simulation model has been implemented. FastAPI and Uvicorn are not installed. Existing code remains a vinext/React frontend and Hono health/404 API deployed to Cloudflare Workers. `server/api/app.ts`, `app/api/[[...route]]/route.ts`, `package.json`, `wrangler.jsonc` and `flake.nix` are the current implementation/deployment authorities.

The earlier [implementation plan](IMPLEMENTATION_PLAN.md) favors Hono REST and bounded browser computation. The present telemetry request specifically calls for researching Python/FastAPI and WebSockets. Treat this as a **proposed additional runtime**, requiring hosting and ownership agreement, not a silent replacement of the existing stack or approval to implement a service.

Recommended direct design if the team elects Python:

```text
Immutable PDS downloads
  -> bounded offline Python ingestion/validation
  -> small normalized run files + provenance manifest
  -> one Python process: replay clock + pure resource models + mission state
  -> FastAPI REST commands/history and WebSocket snapshots
  -> existing dashboard/map adapters

Existing Cloudflare app + Hono /api/*
  -> same-origin telemetry proxy to the separately hosted Python service
```

Use Python's `csv`, `xml.etree.ElementTree`, `datetime`, `hashlib`, `json` and typed records. NumPy is helpful for offline statistics, not required for a replay loop. FastAPI plus an ASGI server is sufficient for transport. Do not start with pandas, a database cluster, message broker, job queue, AI framework or a generic orchestration layer.

For the initial bounded demo, use one process, one configured mission session and one state owner. All viewers of that session see the same timeline. Per-user isolated missions or multiple replicas are future scope, not something implied by opening another WebSocket.

## Ingestion and normalized data

### Small, explicit adapters

- **MOXIE:** labels plus CSV; prioritize derived engineering quantities and calibrated state/temperature companions. Match exact elapsed seconds only within verified matching segments. Preserve source row order and split counter-reset segments: sol 901 resets from 7,517 to 0 and has no derived companion. Never deduplicate its repeated elapsed values across segments. Maintain original field names/units and product LIDVID/source-row identity; do not key on `run_id` or elapsed time alone. Allow only documented schema exceptions (derived numbering; known row-count disagreements), retaining warnings rather than mutating labels. Unknown schema changes fail ingestion. Exclude unresolved UTC from absolute-time joins.
- **MEDA:** import catalog metadata as a searchable inventory only. Do not produce metric rows. After approved measurement acquisition, use a separate label-driven adapter with documented fill constants, sensor reliability and coverage.
- **RAD:** parse hierarchical observation sections by named scalar; preserve B/E identity, original UTC strings, µGy/h units and placeholder quality/location status. Do not flatten counters/histograms into the same series. Keep this as an independent historical context track, not synchronized MOXIE environment.
- **REMS:** register bundle-level availability only. Do not create synthetic samples.

Bound ingestion to selected products, not the complete compressed archive at every server startup. Keep normalized output outside immutable source directories. A few run-scoped JSON/NDJSON files and a JSON manifest suffice initially. If indexing/history later requires durable local queries, standard-library SQLite is an option, not a prerequisite; no database is needed just to replay a few bounded runs.

### Normalized records

| Record                | Essential fields                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dataset/product       | Instrument, mission/site context, LIDVID or PDS3 product ID, source URL/path, SHA-256, processing level, adapter/schema version, original and canonical units, time basis, coverage and known warnings        |
| Run                   | Stable local run key, product references, original `run_id`/directory as attributes, elapsed start/end, claimed UTC anchors, timing confidence, availability/cadence and missing derived companion            |
| Metric sample         | Run key, segment ID, source row index, elapsed seconds, nullable source UTC, metric ID, nullable normalized value/unit, provenance class, validity/reason, raw-value reference and quality flags              |
| Mission configuration | Preset `base_id`/Mars coordinates, selected source track, model version, explicit resource parameters and reserve policy, route revision and source-to-scenario mapping                                       |
| Mission snapshot      | Session ID, monotonic revision/sequence, simulation seconds, replay state/speed, source sample time/age, scenario/model revision, metric groups, resource inventories, route margins and reasoned constraints |

Quality reasons include missing, inapplicable, unreliable, unresolved unit, contradictory time, source unavailable and stale. Do not collapse all to a boolean `good`. Preserve an observed zero as zero. Keep invalid raw CS4 values in an inspection record; do not serialize them as verified normal oxygen metrics. JSON never carries NaN/Infinity; encode absent/invalid normalized values as `null` plus a reason.

Manifests must preserve attribution and transformations. For future spatial assets also preserve body/CRS/coordinate conventions; RAD placeholder coordinates remain absent, not `(0, 0)`. Distinguish catalogue coverage, acquired measurement coverage and scenario coverage. Verify hashes before reusing normalized caches; adapter/model changes invalidate the relevant cache or snapshot version.

## Replay and simulation ownership

### One authority, one clock

The Python proposal makes that process the owner of replay and resource state for the configured session. The dashboard must not also decrement oxygen, and the map must not independently decide resource feasibility. If a teammate already owns authoritative mission state elsewhere, agree on a handoff or keep Python as a pure calculation provider; do not introduce a second authoritative store.

Use monotonic wall time to advance a single logical simulation clock:

```text
delta_simulation_seconds = playback_speed * delta_monotonic_seconds
```

Historical source elapsed seconds, source UTC, logical scenario time and server wall-clock time are different fields. The map's simulation uses the preset base; selecting a MOXIE trace never silently changes the base to Perseverance. RAD cannot be aligned with MOXIE by matching sol numbers or ordinal sample positions.

- Start paused at a selected run/time. Playback speed changes real waiting time, not resource cost per simulated second. Pause freezes both replay-coupled models and source progress.
- Evaluate source samples and model boundaries in deterministic simulated-time order. At high replay speed, process every supported source interval even when broadcasting only one snapshot per second. Do not integrate a decimated UI series.
- For reported MOXIE totals, retain the inclusive one-second sample convention. Define the replay cursor as the number of completed supported one-second sample intervals: cursor zero has consumed none; cursor `k` includes the first `k` samples. This avoids charging the first sample twice or dropping it at reset.
- Default to stopping/pausing at a run end or missing interval. Never hold the last oxygen rate through months between experiments. Skipping a gap is a discontinuous source navigation action, not elapsed physical operation. Continuing consumption with assumed zero/other supply is a separate, explicit scenario mode.
- Seek/reset must reconstruct state from the selected scenario's initial conditions and deterministic event history. Do not rewind timestamps while retaining future oxygen/energy. For this small demo, recomputing a bounded run is adequate; add checkpoints only if measured seek latency justifies them.
- Parameter/base changes create a new scenario revision and invalidate affected route margins. Serialize commands and ticks through one session lock/command path. Record deterministic ordering and applied simulation time. Do not run one timer per client.
- Persist an initial configuration and append-only command/event log if restart continuity is required. Otherwise document that restart clears the session. Do not imply in-memory state is durable. Seeking before a prior change must replay applicable events or explicitly branch/reset the scenario, not reapply today's parameters to yesterday's state invisibly.

### Pure deterministic model boundary

Models consume typed state, supported input intervals, parameters and `dt`, then return next state plus accounting/events. They perform no HTTP calls or AI inference. Oxygen, battery, pressure and route equations are specified in [simulation research](SIMULATION_RESEARCH.md). Enforce capacity/flow/power constraints and expose spill, curtailment and unmet demand. Inputs missing for a required calculation yield unknown with a reason, not a plausible default.

The route owner supplies directed route geometry/cost inputs, terrain validity and route revision. The mission owner computes or requests consistent return/resource estimates and publishes one revision across map/dashboard. No ownership change or route engine replacement is part of this research.

## REST and WebSocket contracts

All routes below are **proposed**. Existing public `/api/*` routes remain Hono-owned; Hono may forward telemetry requests to an approved external FastAPI origin. Do not add competing App Router API handlers. Configure the upstream explicitly and fail clearly when it is unavailable.

| Public route                                  | Purpose                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/telemetry/datasets`                 | Availability, acquired coverage, provenance and quality summaries, including catalog-only MEDA and metadata-only REMS |
| `GET /api/telemetry/runs?instrument=moxie`    | Run metadata, timing warnings and calibrated/derived availability                                                     |
| `GET /api/telemetry/runs/{run_key}/samples`   | Bounded time/metric window, explicit source clock, limit and continuation token                                       |
| `GET /api/telemetry/mission`                  | Authoritative full current snapshot/configuration and revision                                                        |
| `POST /api/telemetry/mission/commands`        | Validated play, pause, speed, seek, reset, scenario configuration or selected-base command                            |
| `GET /api/telemetry/mission/events`           | Bounded command/constraint history with simulation times and revisions                                                |
| `GET /api/telemetry/provenance/{product_key}` | Source identity, hash, units, transformations and unresolved warnings                                                 |
| `WS /api/telemetry/stream`                    | Full revisioned snapshots plus significant state/quality events                                                       |

FastAPI can expose matching internal paths; the proxy owns public routing/authentication, not a duplicate simulation. The source product identifiers should be encoded as safe stable keys, not arbitrary filesystem paths. Bounded queries need metric allowlists, numeric window/limit validation and capped result sizes. Chart downsampling should preserve extrema and missing spans; full-resolution integrals remain server calculations.

Command fields: `command_id`, `expected_revision`, operation and validated parameters. Use strict operation enums, finite values and explicit parameter units. Deduplicate retries by command ID within the documented session history; never apply the same decrement or configuration event twice. Reject stale state with HTTP 409 and return the current revision; reject invalid/incomplete parameters with structured errors. A successful command returns the new authoritative snapshot/revision. Playback bounds are configured technical limits, not physiological safety policy.

Prefer REST for commands and WebSocket for server-to-client updates. This keeps validation/retry semantics in one place. Opening a socket must not start a second mission. The stream sends an initial full snapshot, then approximately 1 Hz full snapshots during playback plus immediate command/constraint/quality changes. The source remains 1 Hz within MOXIE runs; faster transport does not create new measurements.

Every message includes `schema_version`, session ID, sequence/revision, logical time, relevant source timestamp and scenario/model revision. Reconnecting clients fetch a fresh snapshot and discard older sequence/revision messages; do not assume missed snapshots are recovered. A changed session ID after restart clears old client history. Heartbeats and connection state distinguish disconnected transport from an explicitly paused mission.

Use bounded per-client queues and coalesce replaceable snapshots. A slow client can skip snapshots and resynchronize; do not let it stall the simulation or accumulate unbounded memory. Keep important state changes in the bounded event/history interface rather than relying on every WebSocket delivery. Bound client count and payload size. Start with full snapshots, not a fragile custom delta protocol or durable event bus.

## Frontend, deployment and AI

### Existing-dashboard integration

Agree on a typed adapter contract with the dashboard/map owners before implementation. A single client subscription/store consumes the authoritative snapshot; components select metrics without independent timers or derived competing resource balances. Attach recorded/simulated badges, timestamp/age, units and quality reasons to cards. Show unknown values as unavailable, not zero, and do not connect chart lines across missing runs. Route results carry the same mission revision as resources and selected base.

Existing layout, charts, map library and state patterns stay with their owners. Do not introduce a charting/map replacement to deliver telemetry. AI and the frontend must consume the same deterministic values rather than independently calculating reserve decisions.

### Hosting reality

Use one long-lived Python/ASGI process in an approved VM/container host for the initial design. A traditional FastAPI/Uvicorn process and its in-memory clock do not automatically run inside this repository's TypeScript Cloudflare Worker deployment. Python Workers are not a drop-in promise of a persistent Uvicorn process. There is no approved Python host, container/dependency configuration or deployment secret setup here yet.

Keep the frontend on its existing Cloudflare path. A same-origin Hono proxy is the preferred integration if WebSocket upgrade, idle timeout, origin handling and host reachability are proven end-to-end. An explicitly configured direct browser-to-service origin is an alternative when proxying is blocked, requiring separate TLS, authentication, REST CORS and WebSocket Origin checks. REST CORS middleware alone does not secure WebSockets.

Do not use multiple Uvicorn workers or horizontally replicated containers with independent in-memory mission clocks. FastAPI's example in-memory connection manager works only within one running process [A1]. If real multi-session persistence/scaling becomes necessary, explicitly redesign ownership/storage then; do not add a broker preemptively.

For a local demo, approve the Python dependency/environment approach first, then run the backend separately from the existing frontend. Follow the repository's process-group startup/cleanup rules. Do not install packages or modify Nix in a research-only task. Future packaged scientific assets must be deliberately added to the deployment source fileset; `data/` is not currently shipped by `flake.nix`. Never embed the approximately 639 MB download tree into the frontend bundle. Deploy only reviewed bounded normalized products with attribution and integrity metadata.

Apply authentication/authorization to mutations, session isolation if later introduced, exact allowed origins, secure transport and bounded request/socket resources. With cookie authentication, protect commands against CSRF and validate WebSocket Origin. Avoid long-lived credentials in query strings or browser-visible server secrets. The Python process must not trust an arbitrary forwarded identity header from the public internet.

If Python hosting is not approved, retain the existing Hono frontend API and consider exporting a small, immutable bounded replay dataset for client playback. That is a different implementation option requiring the same quality/provenance guarantees, not an excuse to pretend FastAPI is already deployed.

### Future AI access

Start with read-only functions backed by the same REST services: list available datasets/runs, fetch a bounded metric window, inspect provenance, read a mission snapshot, and request an existing deterministic route/resource comparison. Replies must cite product/run, source time, scenario/model revision and assumptions. Cache responses by revision, not just by prompt.

The AI may explain “this configured reserve would be violated,” not declare the crew safe. No invented MEDA values, purity, radiation thresholds or tool outputs. No direct writes to resource state, reserve changes, action execution or autonomous safety decisions. A later action proposal requires user review and the same strict command validation as any UI command. Do not build an AI layer before tools and error handling work.

## Validation and delivery order

1. **Contract and evidence gate:** coordinate owners, choose preset base and bounded source run, agree on units/quality/time conventions, confirm hosting. Nothing here authorizes large downloads or service implementation.
2. **Ingestion tests:** verify hashes, actual versus declared record counts, derived numbering exception, sentinels/blanks, finite invalid values, duplicated `run_id`, directory-96 timing quarantine, sol-631 identity, and sol-901 counter reset/absent derived data. Preserve both counter segments without false duplicates or inferred UTC continuity. Do not rewrite originals.
3. **Numerical tests:** reproduce analysis cohort sizes, run oxygen sums and power identity within explicit rounding tolerances. Retain the approximately 0.105 Wh archive/reconstruction discrepancy rather than hiding it in an arbitrary tolerance.
4. **Clock/resource tests:** pause/speed invariance, supported interval integration, gap/end behavior, seek/reset equivalence, event ordering, conservation, capacity/depletion, unknown constraints and stale route/command rejection.
5. **Transport tests:** concurrent viewers, duplicate command retry, stale revision, reconnect, restart identity, slow client, source absence and upstream service failure. Snapshot transport must not change modeled outcomes.
6. **End-user E2E:** load the existing dashboard, select a real run, replay/seek, inspect warnings, alter an explicit hypothetical demand, and compare a valid return under one revision. Confirm a missing weather source, disconnected backend, unknown constraint and no-path state cannot look healthy or live. Test the actual deployed proxy/socket, not only FastAPI's local examples.
7. **Packaging gate:** prove that the reviewed normalized products are served by the packaged build/backend artifact, with attribution and no dependency on an untracked developer download tree.

Sources inspected on 2026-11-14:

- **A1:** [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/), including the single-process limitation of the example in-memory connection manager.
- **A2:** [FastAPI deployment concepts](https://fastapi.tiangolo.com/deployment/concepts/) and [server workers](https://fastapi.tiangolo.com/deployment/server-workers/), especially independent process memory.
- **A3:** [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/). Explicit origin configuration; not a replacement for WebSocket authentication/Origin validation.
- **A4:** [Python SQLite documentation](https://docs.python.org/3/library/sqlite3.html), an optional later local persistence path, not a selected initial dependency.
- Dataset definitions and scientific caveats: [telemetry analysis](TELEMETRY_ANALYSIS.md). Resource-model scope: [simulation research](SIMULATION_RESEARCH.md).
