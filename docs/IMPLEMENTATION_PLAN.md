# ARES: 48-hour implementation plan

Planning date: 2026-11-14. **This is a proposed plan, not an implementation record.** Existing application code is unchanged by this research.

> Historical Jezero plan, not the current architecture, release checklist or approval to implement its tasks. Current LARA/Arcadia decisions are in [CLAUDE.md](../CLAUDE.md); implemented backend, route planning and expedition contracts are in [BACKEND.md](BACKEND.md), [ROUTE_PLANNING.md](ROUTE_PLANNING.md) and [EXPEDITION.md](EXPEDITION.md). The missing-data and missing-feature statements below describe the original snapshot, not the current checkout.

## 1. Final scope and release contract

Deliver one bounded Jezero sortie, integrated into the mapping interface and mission dashboard already under development:

1. Source-backed terrain inspection and coverage/slope overlays.
2. Distance-only versus terrain-aware route comparison and elevation profile.
3. A reviewed scientific objective with geology and verified Perseverance evidence.
4. An explicit round trip, modeled science dwell, and oxygen/battery reserve assessment.
5. Deterministic scenario replay, reason codes, and a versioned mission receipt.

The critical input is still missing: **no scientific datasets are local**. Do not start by assuming a raster or geologic API exists. The metadata conflicts and product identifiers in [DATA_ANALYSIS.md](DATA_ANALYSIS.md) are acquisition acceptance criteria.

Use optical context, numeric terrain, and geologic interpretation as three information types, joined with Mars 2020 evidence for an explicit second mission. Add Odyssey thermal context only after obtaining a small quantitative subset. Do not call three visualizations of one DEM a multi-type integration. The exact official 2026 challenge page remains to be confirmed.

### Capacity assumption

Five experienced developers each have at most **28 focused person-hours** across the 48 elapsed hours, allowing rest, coordination, and interruptions: 140 person-hours total. Budget 80-120 hours for the core and reserve at least 20 at the upper end. Remaining work on maps/dashboard must be subtracted from this capacity; it is unknown from this checkout. Do not assume five developers can productively work 240 hours.

If the core finishes early, spend at most 8 spare hours on one reduced addition: sensitivity, a return envelope, or explain-only AI. A full conversational copilot is estimated at 8-12 hours and is not a delivery dependency.

## 2. Current architecture and constraints

| Existing path/configuration                  | Responsibility today                                 | Preserve                                                                    |
| -------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `app/`                                       | vinext App Router layout and landing page            | Existing route/layout ownership; connect to parallel UI work                |
| `components/ui/`, `lib/utils.ts`             | shadcn/Base UI primitive and styling helpers         | Reuse the approved component system                                         |
| `app/api/[[...route]]/route.ts`              | Forwards HTTP methods to Hono                        | Do not add competing business handlers                                      |
| `server/api/app.ts`                          | `/api/health` and JSON not-found                     | Add future science/AI routes under `server/api/`                            |
| `server/api/app.test.ts`, `vitest.config.ts` | Two API cases, standalone Vitest config              | Extend established tests; do not load Vite/Cloudflare plugins in unit tests |
| `vite.config.ts`, `wrangler.jsonc`           | vinext/Vite/Cloudflare integration and static assets | One deployment; no new backend platform                                     |
| `flake.nix`, `nix/`, lockfile                | Node 24/pnpm 12, build and check workflow            | Preserve sandbox/runtime constraints                                        |

There is no mapping library, geospatial processor, database binding, mission state store, scientific API, or AI integration in this snapshot. Map/dashboard contracts must be confirmed with their current owners; missing source here is not authorization to replace their work.

## 3. Technical architecture

### Recommended shape

```text
Approved source products and labels
    -> one-time local validation and bounded preprocessing
    -> immutable study-area release: manifest + numeric grids + masks + tiles + science records

Existing map <-> existing shared mission state <-> existing dashboard
                         |
                 bounded browser Web Worker
                 terrain / A* / return / EVA calculations
                         |
                 structured results + reason codes

Existing Hono API
    -> small dataset/science metadata reads
    -> optional bounded AI intent/explanation requests
    -> no planetary archive processing per request
```

These are in-process modules and one browser worker, not separate services. Use plain TypeScript, typed arrays, fetch and existing React state patterns. A small binary heap for A* does not require a general GIS SDK. Add a dependency only if a concrete input format requires it and the team approves it. Use an existing GIS tool for one-time conversion if available; do not hand-build a TIFF/ISIS decoder or add GDAL to the Worker runtime.

### Why browser computation first

Two self-generated alternatives were evaluated:

| Shape                                        | Advantage                                                                                          | Constraint                                                                                                                    | Decision                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| All search/simulation inside Hono on Workers | Central calculation and easy server tool calls                                                     | Deployment plan unknown; documented Free CPU budget is 10 ms/request and isolate memory 128 MB; full DEM alone is about 90 MB | Keep only as a benchmark-gated alternative |
| Bounded numeric data plus browser Web Worker | Avoids server CPU billing/limits and main-thread blocking; deterministic local scenario evaluation | Browser memory, download size, worker lifecycle, and device performance need testing                                          | Default for the hackathon                  |

Cloudflare's documented Paid default CPU allowance is 30 seconds/request, configurable higher, but no paid entitlement or measured planner cost is established. Limits can change; recheck [official limits](https://developers.cloudflare.com/workers/platform/limits/). Never assume `nodejs_compat` provides GDAL or a persistent server filesystem.

Start with a study area small enough for a 20 m grid, chosen by actual science coverage and round-trip needs. A 10 km-square example has 250,000 cells and a 1 MB float32 elevation array, but graph scores, heap, predecessors, masks and multiple routes add memory. Count peak allocations and avoid duplicate buffers. Do not bundle the full crater image or DEM into server code.

If a bounded server implementation is later benchmarked on a confirmed suitable plan, move the same pure calculation module behind Hono without changing result contracts. Do not build both execution paths during the core milestone.

### Module ownership, proposed paths

These paths do not exist yet. Adjust to the map/dashboard owners' actual organization rather than imposing a second state system.

| Proposed owner                | Responsibility                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `lib/ares/contracts.ts`       | Body-aware coordinates, dataset/model versions, commands, results and errors  |
| `lib/ares/terrain.ts`         | Validity masks, coordinate sampling, slope/profile helpers                    |
| `lib/ares/routing.ts`         | Bounded A*, constraints, directed return graph, reason codes                  |
| `lib/ares/simulation.ts`      | Time/resource integration and assessment of a selected round trip             |
| `lib/ares/planner.worker.ts`  | Worker lifecycle, bounded jobs, cancellation and transferable buffers         |
| Existing map/state owner      | One mission reducer/store, rendering adapters and current simulation position |
| `server/api/`                 | Dataset/science reads and optional copilot endpoint                           |
| Future static asset directory | Small versioned release; compatible with vinext asset serving                 |

No PostGIS, R2, D1, Durable Objects, message broker, Kubernetes, agent framework, or collaboration backend is required for one local mission. Use existing static assets for small artifacts; consider object storage only if verified asset size/delivery constraints force it.

**Nix integration warning:** `flake.nix` explicitly enumerates its source directories and currently has no scientific static-asset directory. Future implementation must add the chosen asset path to the Nix fileset if required, and prove the packaged build serves it. This research does not change Nix files. A development-only file that vanishes from `nix build` is not a successful data integration.

## 4. Scientific data release and calculation contracts

### One study-area manifest

Each source/derived artifact needs: ID, title, mission/instrument, original URL/identifier/version, acquisition time if known, retrieval time, checksum, processing method/version, units, dimensions, CRS/body definition, transform, missing-data convention, native and analysis resolution, valid footprint/mask, attribution, and uncertainty/registration notes. Missing time or accuracy is `unknown`, not inferred from publication date.

Keep original products immutable outside generated application artifacts. After approval, clip/reproject to derived files with explicit lineage. Preserve missing masks before interpolation or arithmetic. Numeric grids and rendered overlays must share a version and transform. Use an explicit valid mask rather than hoping float32 missing sentinels survive JSON serialization.

For the matched CTX products, validate the TIFF header against the labels' 3,396,190 m sphere and 18.4663-degree standard parallel; record the catalog's contrary radius and swapped latitude extrema. For geology, transform from Mars Transverse Mercator and retain the 100-200 m registration caveat. Reprojection alone does not correct original misregistration.

### Coordinates

At UI/API boundaries use a named Mars coordinate object, not an unlabeled number pair:

```text
MarsPoint = { body: "Mars", longitudeDeg: number, latitudeDeg: number,
              latitudeType: "planetocentric", longitudeDirection: "east" }
```

Normalize longitude to one documented domain, preferably [-180, 180), rejecting malformed/nonfinite inputs. Use native projected meters for this small area's route costs, with projection scale effects documented. Convert at the existing map adapter, not independently in every widget. Never let an Earth-radius helper calculate Mars lengths.

Line geometry can use GeoJSON-shaped coordinates in an internal adapter, explicitly interpreted as Mars. Do not label non-Earth data as standards-compliant RFC 7946 GeoJSON/WGS84 or export it with an Earth CRS. Preserve a separate frame descriptor and use a custom JSON media type or ordinary JSON for the internal contract.

### Shared mission state and lifetimes

One state owner holds:

- `missionId`, monotonically increasing `revision`, `datasetVersion`, and `modelVersion`.
- Hypothetical base, start/goal/site IDs, exclusions, optimizer mode and threshold settings.
- Scenario capacities, activity rates, nominal/pessimistic speed parameters, reserve requirements and dwell.
- Route results, active route, assessment, simulation clock, simulated position and event log.

Suggested lifecycle: `draft -> planning -> ready -> running -> paused -> completed`, with explicit `no-path`, `unknown-data`, and `error` outcomes. Modifying terrain, constraints, endpoints or resource assumptions invalidates affected outputs. A result carries its input revision; discard late results from an older revision. Paused replay must not consume resources through a separate UI interval.

The worker owns numeric buffers for the current dataset and transient search memory; React owns mission intent/results, not per-cell graph objects. Initialize once per dataset version and release old buffers when switching. Do not place mutable user missions in Hono module globals.

### Planner request/result sketch

The UI caller is `planner.plan({ revision, datasetVersion, start, goal, base, constraints, scenario })`. This is a proposed Promise-based interface; no such implementation exists today.

| Result field      | Contract                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `status`          | `ok`, `no-path`, `unknown-data`, `invalid-input`, `cancelled`, or `budget-exceeded`                |
| Versions/revision | Echo input lineage and calculation model; UI rejects stale results                                 |
| `routes`          | At most two candidates; Mars-frame geometry plus native metric analysis resolution                 |
| Metrics           | Distance m, ascent/descent m, slope summary with definition, profile and cost components           |
| Assessment        | Outbound/dwell/return times, explicit return path, modeled oxygen kg and energy Wh, reserve checks |
| Evidence          | Dataset/site IDs and source links, assumption flags, coverage and registration warnings            |
| Explanation       | Machine-readable reason codes and values, not uncited generated claims                             |

A worker may expose `INIT_DATASET`, `PLAN_ROUTE`, `ASSESS_MISSION`, and later `COMPUTE_RETURN_FIELD`. Transfer large buffers during initialization; do not resend them with every request. Bound study area, waypoint count, queue length, profile length and expanded nodes. Support cancellation or terminate/recreate the worker when a superseded search cannot promptly yield.

## 5. Deterministic model and scientific boundaries

### Routing

Use 8-connected A*, a metric admissible heuristic, no corner cutting, blocked missing/unsupported cells, and separate regional slope and directed edge-grade limits. Compare distance-only and terrain-weighted costs using the same admissible mask. Keep weights nonnegative and science priorities out of edge rewards. If smoothing is added, revalidate every crossed cell and all reported metrics; omit smoothing for the core.

Compute a distinct return path. For a return field, run Dijkstra on reversed directed edges; ascent/descent costs mean outbound and return are not interchangeable. Assess all resources on the same selected return path. Label a selected-policy return envelope as a conservative known-return set, not an exhaustive solution to a multi-resource optimization problem.

### EVA simulation

Use a transparent, versioned scenario model. A possible uncalibrated speed model is:

```text
speed = v0 / (1 + ku*max(grade,0) + kd*abs(min(grade,0)))
segmentHours = segmentDistanceMeters / speedMetersPerHour
oxygenUsedKg = sum(activityRateKgPerHour * activityHours)
energyUsedWh = sum(activityPowerW * activityHours)
arrivalReserve = initialAmount - outboundUse - dwellUse - returnUse - contingencyUse
```

The formula is a proposed training model, not a NASA physiological relationship. Validate units and nonnegative coefficients. Different activity rates can be specified for walking, science, rest and contingency. Retain separate oxygen and energy quantities; percentages alone hide assumptions. Reserve requirements must state whether they are absolute amounts or fractions of initial capacity and how contingency is counted, avoiding double counting.

For each resource `r`, a modeled mission passes only if `initial_r - totalUse_r >= requiredReserve_r`, alongside route validity and any scenario duration limit. Report the limiting constraint. If a resource input is unknown, assessment is unknown. Oxygen/battery sufficiency never establishes real EVA safety because cooling, CO2 scrubbing, thermal conditions, fatigue and suit reliability are not modeled.

Sensitivity compares separately labeled nominal and pessimistic assumptions. These are scenario bounds, not 95% confidence intervals. Do not tune rates solely to manufacture an exciting demonstration failure.

## 6. Backend APIs and optional AI

All routes below are **proposals**, except `/api/health`, which already exists. Keep them in Hono and reuse `api.request` testing.

| Interface                          | Input                                                            | Output/responsibility                                                  | Core?                                    |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `GET /api/health`                  | None                                                             | Existing health response                                               | Existing                                 |
| `GET /api/datasets`                | Optional approved study-area ID                                  | Source/derived manifests and small asset URLs                          | Yes, or equivalent static manifest       |
| `GET /api/science/sites`           | Approved area ID                                                 | Reviewed sites, questions, unit context, source IDs and dwell defaults | Yes, or equivalent static JSON           |
| `GET /api/observations?siteId=...` | Allowlisted site ID                                              | Curated observation references with camera/time/location evidence      | Yes, may be embedded in site response    |
| `POST /api/copilot`                | Phase `interpret` or `explain`, bounded intent/context, revision | Validated proposed action or source-grounded explanation               | Optional                                 |
| `POST /api/route/plan`             | Same bounded planner command                                     | Same result contract if suitable Workers runtime is proven             | Not implemented for default browser path |

Do not add endpoints merely to proxy immutable files. Choose static JSON for small read-only catalogs if simpler; the above describes contracts, not a requirement to build four wrappers. Unknown IDs return structured 404; malformed inputs 400; unavailable upstream dependencies 503. Do not return status 200 with invented zeros. Search exhaustion is distinct from no path. Browser worker errors use the corresponding domain statuses without pretending to be HTTP responses.

Use fixed source IDs/URLs, timeouts and output limits. No arbitrary remote URLs, broad scraping proxy, arbitrary expression evaluation, or model-generated SQL. Serve immutable artifacts with versioned URLs and suitable cache headers. Preserve attribution. No AI keys in client bundles.

### Copilot execution model

1. The model may propose a structured action using allowlisted sites and explicit parameters. Validate it and require user confirmation before changing the mission.
2. The client invokes the same browser planner/simulation functions as manual UI actions. The LLM does not calculate route lengths or resource budgets.
3. Send bounded structured results, their revision and approved evidence snippets to the explain phase. Reject stale responses. Numbers in narrative must match supplied result fields.
4. Treat source text as untrusted reference content, not instructions. Model text cannot lower reserves, change exclusion masks, or manufacture observations.
5. If the provider is missing, times out, or invents a citation, fall back to deterministic reason codes. No multi-agent system or general retrieval database is needed for a handful of reviewed sources.

## 7. Integration with existing maps and dashboard

### Map team contract

Agree callbacks equivalent to `selectLocation(MarsPoint)`, `setDestination(siteId)`, `setExclusion(geometry)` and `selectRoute(routeId)`. Supply renderable route lines, sampled markers, overlay URLs with transforms, valid-data footprint, site records, and a linked profile cursor. Do not require a particular map library or a renderer rewrite.

Validate Mars projection and Trek's actual WMTS matrix set before integrating layers. A 2 x 1 level-0 matrix cannot be treated as ordinary Earth XYZ. Test at several zoom levels and landmarks. Mark imagery-only coverage where numeric terrain is absent. A user must not be able to infer fine-scale safety from a highly detailed image beneath a 20 m analysis grid.

### Dashboard team contract

Bind existing cards and controls to the shared mission state: selected target/evidence, optimizer comparison, modeled arrival reserves, limiting constraint, reason codes, scenario assumptions, and clock/replay actions. Keep current design and navigation. Display "simulated" on crew resource indicators and distinguish measured product values from derived metrics.

Use units, restrained rounding tied to input support, accessible contrast, keyboard-operable controls, and text/icons in addition to color. Show the most important constraint first. Do not bury missing-data warnings or simulate live NASA telemetry through decorative animations.

## 8. Five-developer task distribution

Preserve the two existing UI owners. Each lane includes its own tests; all developers participate in the shared integration block. Caps are allocations, not measured effort.

| Developer                      | Primary ownership                                                       | Deliverable and collaboration                                                                         | Core cap |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------: |
| 1: scientific data             | Acquisition, metadata validation, CRS/masks, derivative release         | Approved bounded assets and verified science joins with developer 5; handoff to map/routing by hour 6 |     24 h |
| 2: existing map owner          | Map integration, overlays, profile cursor, route/POI selection          | Adapt current map without rebuilding it; registration, coverage and worker input/output adapters      |     24 h |
| 3: planning engine             | Pure terrain/routing core, A*, return path, worker lifecycle            | Deterministic commands/results, performance budget, no-path and reversed-graph tests                  |     26 h |
| 4: existing dashboard owner    | Shared mission state, scenario model, replay, reserve UI                | Integrate current dashboard; one clock/revision owner; pair on resource-return consistency            |     24 h |
| 5: science/product integration | Reviewed sites, evidence cards, reason codes, end-to-end tests and demo | Verify challenge wording and attribution; own release rehearsal; optional AI only after core green    |     22 h |
| Team contingency               | Data/tooling failure, performance fixes, final packaging                | Spend explicitly; optional slice uses at most 8 h if no release blockers remain                       |     20 h |

Core cap totals 120 hours. If parallel UI work consumes substantial additional effort, reduce optional overlays, continuous envelopes and animation before dropping numeric correctness, three-type evidence, or explicit return assessment. Do not repurpose the map/dashboard owners into rebuilding already functioning components.

## 9. Development priorities and milestones

| Elapsed time | Milestone                         | Acceptance gate and fallback                                                                                                                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-2 h        | Contract and evidence alignment   | Confirm actual map/dashboard branch, frame/state ownership, Workers plan, official challenge link, approved acquisition size/source and study-area candidates                |
| 2-6 h        | Data gate                         | Acquire approved numeric DEM subset, image registration source, geologic subset and curated rover evidence; inspect CRS/mask/units; report first actual elevation/slope EDA  |
| 6-12 h       | First vertical slice              | Map selection -> numeric sample -> route -> dashboard metric; correct body/units and one shared revision. Use synthetic fixtures only in tests, never as disguised NASA data |
| 12-20 h      | Deterministic core                | Both route modes, profile, source-backed target, explicit return and dwell/resource accounting; distinguish no-path, unknown and exhausted search                            |
| 20-28 h      | Integrated mission                | Replay/clock, reserve decision, reason codes and mission receipt on existing UI; run end-to-end unhappy paths                                                                |
| 28-36 h      | Harden and optionally distinguish | Benchmark packaged build and browser worker; complete sensitivity first. Add at most one spare-capacity feature; no new major data pipeline                                  |
| 36-42 h      | Feature freeze                    | All acceptance gates pass, source/assumption audit complete, no unbounded network dependency in core demo                                                                    |
| 42-48 h      | Rehearse and submit               | Test from clean browser and packaged deployment, check attribution, record fallback demo, final scenario and submission narrative                                            |

**Data-gate failure is a product blocker.** Seek team approval for a manageable cutout or switch to another real, documented study area. If numeric elevations remain unavailable, deliver only an honestly labeled evidence viewer and planning design, and acknowledge that terrain-aware routing is not demonstrated. If geology is unavailable, acquire a verified alternative third information type before asserting challenge alignment. Do not fill gaps with generated heights, hillshade colors, or hardcoded route claims.

Prerequisite order is `data/CRS -> terrain -> graph -> route -> return/resource assessment -> UI evidence/replay -> optional AI`. Frontend adaptation and reviewed science curation can proceed in parallel, but integration must begin at the first vertical slice, not hour 40.

## 10. Testing requirements

### Scientific and deterministic unit tests

| Area                  | Required cases                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinates           | Mars grid/world round trip, cell centers vs corners, north-up row direction, longitude normalization, nonfinite/invalid inputs, Earth-radius misuse                          |
| Ingestion             | Header/label conflict, wrong units/body, actual missing sentinel, zero image mask, checksum/version mismatch, negative valid elevations                                      |
| Terrain               | Flat grid slope=0; analytic plane gives expected gradient; missing neighbors mask derivative; stencil/halo edge behavior                                                     |
| Routing               | Flat shortest path, blocked barrier/no path, invalid endpoints, no diagonal corner cuts, grade and regional slope limits, deterministic ties, cancellation and search budget |
| A* correctness        | Match reference Dijkstra costs on small synthetic graphs with the same admissible mask and nonnegative costs                                                                 |
| Return direction      | Asymmetric uphill/downhill toy graph; reversed-graph field matches explicit position-to-base searches; same path used for all resource totals                                |
| Simulation            | Unit conversions, science dwell, reserve boundary equality, no resource creation, zero/negative rate validation, pause/resume, timestep-independent segment totals           |
| State                 | Changing scenario invalidates assessment; changing dataset invalidates route; late result rejected by revision; no stale AI recommendation                                   |
| Science               | IDs and source links valid, raw names preserved, unit/observation association backed by evidence; geologic-contact warning retained                                          |
| Grounded AI, if added | Missing tool output, fabricated citation, prompt injection in source text, impossible target, malformed action, timeout, provider absence and conflicting scenario           |

Synthetic terrain fixtures are appropriate to prove algorithms and must be labeled synthetic. They are not substitutes for actual-source end-to-end validation.

### End-user and deployment verification

From the existing map/dashboard, select a real covered location, inspect its evidence, compare routes, choose a science target, assess the round trip, change one assumption, replay, and export/review the mission receipt. Verify numbers against direct deterministic results. Exercise missing coverage, infeasible return, malformed settings, network/provider failure, reload, and switching datasets while a calculation is running.

Be exacting about route/overlay alignment, legends and units, profile cursor location, crisp readable type, responsive panel layout, keyboard focus, and warning contrast. Fix visible integration defects rather than accepting them as demo polish. Confirm 100-200 m contact ambiguity remains visible at close zoom.

Proposed performance targets, not measured results: no planner work on the main thread; initial bounded route result within 2 seconds on the agreed demo laptop; subsequent selection/feedback remains responsive; inspect actual worker/browser peak memory and packaged asset size. Record device, dataset size and warm/cold timings. If the budget fails, shrink the study area or precompute a carefully bounded field, without hiding missing coverage or inventing higher-resolution results.

Test the deployed origin's CORS and tile handling, and the Nix-packaged build's science asset paths. Warm-cache operation is not proof of offline reload. Use frozen approved local assets for the core scenario; if reload truly requires the network, disclose it and retain a recording as backup rather than claiming offline support.

### Repository checks

- Format changed files with approved oxfmt through `nix run .#fmt`; do not reformat others' unrelated work.
- Before implementation commits run `nix run .#check` for format, lint, typecheck, tests and build.
- Run `nix flake check` for changes to Nix, dependencies or sandbox build inputs. Updating `pnpm-lock.yaml` requires the `pnpmDeps.hash` workflow in `AGENTS.md`/`nix/package.nix`.
- Keep `wrangler types --include-runtime=false`, runtime types from `@cloudflare/workers-types`, and the supported `compatibility_date` ceiling.
- Start local servers in their own process group using `setsid`; stop the entire group to avoid stale workerd processes.

These are requirements for future implementation. This documentation-only task did not execute or certify the proposed product tests, planner benchmarks, or browser integrations.

## 11. Release checklist and exclusions

- [ ] Official challenge page/rubric confirmed; submission claims match demonstrated information types and missions.
- [ ] Real numeric study-area data and masks validated; meaningful elevation/slope EDA recorded, not inferred from images.
- [ ] Map and dashboard work preserved; body/frame, revision, model and dataset versions agree end to end.
- [ ] Route, science dwell, return and reserves are computed on consistent data and paths.
- [ ] Simulation/assumption labels and scientific limitations remain visible in the demonstration and export.
- [ ] Unknown, no-path and computational-budget failures are distinct and exercised.
- [ ] Core scenario runs without an AI provider; packaged assets and source credits verified.
- [ ] Tests, format, lint, types and build pass; UI and performance checked on the real demonstration environment.

Exclude quantitative radiation prediction, real-time weather forecasts, actual astronaut telemetry, validated medical/suit recommendations, autonomous driving, global routing, and duplicate map/dashboard construction. No current dataset supports those promises within this timeframe.

The scientific basis, source links and unknowns are in [DATA_ANALYSIS.md](DATA_ANALYSIS.md). Feature rationale, feasibility taxonomy and estimated effort are in [FEATURE_RESEARCH.md](FEATURE_RESEARCH.md). Keep persistent agent guidance concise in [AGENTS.md](../AGENTS.md); update these reports when real data acquisition changes the evidence.

## 12. Research handoff verification

For this documentation-only change, targeted oxfmt checks and `git diff --check` passed. `nix run .#check` passed formatting, lint, type generation/typecheck, both existing API tests, and the application build. Build output included vinext/RSC sourcemap and ineffective-dynamic-import warnings; these dependency/build concerns were not changed within the no-application-code scope. The configured formatter bootstrapped existing locked development dependencies; no package manifest or lockfile changes were made.

No proposed planner, EVA, browser, CORS, scientific pixel-statistics, or performance tests were executed because those features/data are absent. Git status was initially clean. jj metadata was absent, so no VCS initialization or commit was performed. Only the three requested reports and root `AGENTS.md` are intended source changes.
