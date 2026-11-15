# Project Context: LARA — Mars EVA Planning Tool (NASA Space Apps Challenge 2026)

_Last updated: Sat Nov 14, 2026 15:30 (hackathon day 1). Team of 5. Hackathon runs Nov 14–15, 2026._

## 1. The challenge (summary)

Build a map, tool, or interface a Mars astronaut could use during a surface exploration mission ("Marswalk"/EVA), using NASA data. It should:

- Layer **≥3 kinds of NASA data** (optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, chemical…) for a **hyperlocal** location or route (existing tools like JPL Mars Trek / USGS maps are regional/global).
- Prioritize **astronaut safety** (radiation/space weather, obstacles, spacesuit mobility).
- Ideally include a **route map** that avoids hazards and supports **science objectives** along the way.

### Judging criteria (equal weight)

Influence · Creativity · Validity (scientifically sound, works in the real world) · Relevance (answers the challenge, complete, usable) · **Presentation** (often neglected — don't).
Note: "Create Your Own Challenge" projects are not eligible for global awards; we are answering an official challenge.

### Patterns from past global winners (2025)

- Working tool (dashboard/web app), not just an idea
- NASA data → a **decision** for a specific user, with a clear "why"
- AI used for a specific job, never "an AI for X"
- Concrete, quantified problem; strong story/video

## 2. Product concept

**LARA** — a layered Mars EVA planning + current-outlook tool.

- **Level 1 — Routing & current outlook:** route + field-day GO/CAUTION/NO-GO decisions, fed by:
  1. **Stable data** (updated ~weekly): terrain/DEM, slope, geology/hazard maps, shadows (sun position + terrain — predictable, so it's _stable_, not live), ice.
  2. **Live data** (sensors): radiation/space weather, dust, weather.
- **Level 2 — Short-term (same-day) prediction:** forecast is computed with **code/threshold rules with a stated confidence level, not a model**. **if RAG is used at all, it's only to explain verdicts** (retrieving flight rules, rover reports), citing which rule fired.

## 3. Team roles

> **Naming note:** Roles **A–D and M** in this table are _human team members_. They are unrelated to the **Claude advisor personas** in §9. When a request says "Role 1/2/3" in the context of asking Claude for advice, it means the §9 personas; when it refers to team ownership of work, it means this table. Jess = team role **B** (stable data).
> | Role | Owner | Scope | |---|---|---|
> | **A — Flight rules, GO/NO-GO, integration** | TBD | Owns the flight rules/assumptions sheet; every GO/NO-GO cites it. Owns integration: common time base, file names, CRS, `config.yaml`, `schemas/`, `validate.ts`. The GO/NO-GO logic and flight rules are the critical decisions NASA would want from the data. |
> | **B — Stable data (geospatial/mapping)** | **Jess** | Terrain (DEM), slope, roughness, hazard masks, shadows (sun + terrain), geology. Reproject → clip → snap to common grid → clean → derive → export. |
> | **C — Routing & mission planning** | TBD | Picks science stops (sample/data collection sites); cost surface → least-cost route; walk time; **walk-back margin**. Builds on B and D. Uses Apollo lunar walking data with labeled assumptions. |
> | **D — Live data + forecast (space weather/radiation console)** | TBD | Replays archived live data as a "live" feed; same-day forecast as threshold rules with confidence; RAG explanation (stretch/might drop). |
> | ⭐ **M — UI + story/pitch** | **M** | Map UI, layer panel, timeline, verdict banner, demo script, video, slides. |

### Notes from expert review (sanity check, not official NASA guidance)

- Split mirrors real NASA functions: ground data systems (A), geospatial team (B), traverse planning (C), space weather/radiation console — SRAG at JSC (D), crew displays (M).
- **Verdict banner should read like a flight rule:** status · limiting constraint · margin · time to shelter.
- **Walk-back margin = remaining suit consumables (O₂, CO₂ scrubbing, power, cooling) − return time at a degraded pace** — not just distance. Apollo planned walk-back assuming rover failure.
- **Apollo walking data is lunar (1/6 g, different suit). Mars gravity is ~0.38 g**, so metabolic cost and pace differ — label as an assumption.
- Mars crews operate autonomously (4–24 min one-way light delay). Line-of-sight/comm = one pitch sentence or a simple viewshed back to habitat, not a full category.
- Data caveats: Curiosity's RAD (radiation) + REMS (weather) are co-located at **Gale crater**. REMS does **not** measure dust opacity directly (that comes from imaging). NASA DONKI space-weather alerts are Earth-centric — must reason about Mars's position relative to each event.

## 4. Key decisions log

| Question                   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data output formats        | **Stable layers:** Cloud-Optimized GeoTIFF rasters on a common grid; GeoJSON for stops/features. **Live feed:** JSON, 1 snapshot per update, e.g. `{timestamp, radiation_dose_rate, solar_alert_level, dust_opacity, temp, wind, sun_elevation}`. **Route output:** GeoJSON line + `{distance_km, est_time_min, max_slope, verdict: GO/CAUTION/NO_GO, limiting_factor, reasons[]}`. **Forecast output:** `[{hour, dust, radiation, verdict}]` + `explanation`. |
| UI theme                   | _The Martian_-inspired (original design — no copyrighted assets/logos)                                                                                                                                                                                                                                                                                                                                                                                         |
| Landing & base location    | **Arcadia Planitia** (plains) — **final**. Chosen because it's a much more favorable base location (smooth terrain, good access to subsurface water ice, sunlight for power), **despite sparse surface data** (no rover has operated there). Landing and base in the same general area, with distance between them for landing safety.                                                                                                                         |
| Live data for Arcadia      | Use Gale (Curiosity: REMS weather, RAD radiation) and/or Jezero (Perseverance: MEDA) data as a **clearly labeled proxy feed**, optionally adjusted with Mars Climate Database values for Arcadia. Orbital imagery (HiRISE/CTX) replaces rover imagery.                                                                                                                                                                                                         |
| Product name               | **LARA** (only name — the assessment engine is part of LARA, not a separate "ARES")                                                                                                                                                                                                                                                                                                                                                                            |
| Map library                | **Mapbox GL JS v3** (decided by Jess, Sat 16:45, after a side-by-side spike vs MapLibre). Why: 3D terrain + built-in fog/particle effects (dust storm) + native 3D model layer for the base. Costs: needs a public `pk.` token (free tier, billed per map load), proprietary licence. Same Earth-radius caveats as MapLibre.                                                                                                                                   |
| Science problem            | **OPEN** — do we need one, or is it just routing/forecasting? (Expert view: yes — without science stops, the route only avoids hazards and has no purpose. Plan stops → route → timeline → walk-back check.)                                                                                                                                                                                                                                                   |
| Flight rules / assumptions | Slope limit: **20°** (from Artemis lunar planning — label as assumption for Mars). Suit supply budget: **TBD**. Radiation thresholds: **TBD**. Walk-back rule: **TBD**.                                                                                                                                                                                                                                                                                        |

## 5. User story — "Plan a science mission and get home"

You open LARA and select a hypothetical habitat in Arcadia Planitia as your base. Your goal is to explore an interesting geological site and return within your simulated EVA budget.

1. **Inspect the terrain** — click the Mars map to see elevation, slope, imagery, and data sources. Overlays highlight steep terrain and areas without reliable coverage.
2. **Discover meaningful destinations** — browse science targets with geological context, relevant orbital imagery (HiRISE/CTX), and what you could investigate there.
3. **Compare routes** — shortest allowed route vs. terrain-aware alternative: distance, elevation profile, ascent, difficult segments.
4. **Check the whole mission** — set simulated oxygen, battery, walking speed, science-stop duration, reserve requirements. LARA assesses outbound + return and shows your **limiting resource**.
5. **Play through the EVA** — simulated position moves along the route; dashboard updates elapsed time, remaining resources, modeled return reserves. Pause or change assumptions for "what if?"

- **Understand the recommendation** — why a route/destination fits your constraints, the evidence, what remains uncertain. Finish with a mission summary (route, objectives, assumptions, sources).
- **Stretch:** AI copilot explains comparisons; draw a hypothetical blocked zone and reroute; thermal-material context.
- All astronaut resources and movement are **clearly labeled simulated**. NASA terrain and observations are evidence, not a guarantee of real-world safety.

### Target demo moment

Plan a nominal walk → mid-sol, the replayed feed shows a solar particle event (SEP) alert → verdict flips to CAUTION → return path and time-to-shelter appear.

## 6. Data architecture (agreed approach)

```
data/
  raw/        # as downloaded, never edited (+ source/date note)
  interim/    # reprojected, clipped, cleaned, units fixed
  processed/  # only the agreed formats — the app reads ONLY this
pipelines/
  stable/     # dem.ts, slope.ts, hazards.ts, geology.ts, shadows.ts
  live/       # rems.ts, rad.ts, donki.ts, replay.ts
schemas/      # Zod schemas of the data formats (TS types inferred from them) + validate.ts
config.yaml   # AOI, CRS, resolution, thresholds — no hardcoding
```

- **Stable pipeline:** download → reproject to a **local metric CRS on the Mars 2000 sphere** (e.g. equirectangular centered on AOI) → clip to AOI + ~200 m buffer → snap all layers to the same grid → clean (explicit no-data, fill small DEM holes, meters) → derive slope/roughness/hazards/shadows → export COG + GeoJSON. Tools: TypeScript scripts that **shell out to the GDAL CLI** for raster heavy lifting (`gdalwarp` reproject/clip/snap, `gdaldem slope|hillshade|roughness`, `gdal_calc`, `gdal_translate -of COG`, `gdal_fillnodata`) — install with `brew install gdal`; `geotiff` (geotiff.js) for reading values in TS; `@turf/turf` for GeoJSON ops (note: Turf distances assume Earth — pass Mars radius or compute ourselves); `proj4` only if we must reproject vectors in TS.
- **Live pipeline:** ingest to tidy long table → **UTC master clock + sol + LMST** (implement the Mars24 algorithm — Allison & McEwen 2000 — as a small TS module with unit tests against the Mars24 worked example; no maintained npm package) → convert units, flag outliers, fill short gaps with `quality_flag` → resample (e.g. 15 min) → Parquet `timestamp_utc, sol, lmst, variable, value, unit, source, quality_flag` → `replay.ts` emits live-snapshot JSON. Tools: DuckDB (`@duckdb/node-api`) for tidy/resample/Parquet via SQL, built-in `fetch` for APIs (DONKI, PDS).
- **Handoff rule:** run `pnpm validate` (`schemas/validate.ts`) before handing off; passing = ready.
- **Gotchas:** Mars datasets mix planetocentric/planetographic latitude and east/west longitude — record each file's CRS. HiRISE DTMs cover small strips — choose the AOI to fit coverage. Don't let AI agents choose CRS, units, or thresholds unchecked.

### Candidate NASA datasets

- **Terrain:** HiRISE DTM (~1 m) where available; CTX DEM/mosaic; MOLA for regional context
- **Imagery:** HiRISE, CTX
- **Geology/minerals:** USGS geologic maps; CRISM where covered
- **Ice:** SWIM (Subsurface Water Ice Mapping) — especially relevant to Arcadia Planitia
- **Thermal:** THEMIS (thermal inertia)
- **Weather:** REMS (Curiosity, Gale), MEDA (Perseverance, Jezero), Mars Climate Database
- **Radiation:** RAD (Curiosity, Gale)
- **Space weather:** NASA DONKI API (`DEMO_KEY` works for light use)

## 7. Open questions / known inconsistencies to resolve

1. **Science objective — still open.** Candidates that fit Arcadia: subsurface ice / ice-exposing craters (ISRU, water theme), scalloped terrain, periglacial landforms.
2. **HiRISE DTM coverage in Arcadia Planitia:** check which DTMs exist, then pick an AOI that fits.
3. **Proxy-data framing:** decide exactly how the UI labels Gale/Jezero data as a proxy for Arcadia (and whether to adjust with Mars Climate Database values).
4. **Fill in flight rules:** suit supply budget, radiation thresholds, walk-back rule.
5. **Role A owner** and owners for C and D: confirm names.

## 8. Working agreements

- Don't change the data format without telling everyone; update the sample files the same hour.
- Build the demo path first: one location, one route, one live event, one verdict.
- Every layer shows its NASA source (supports Validity criterion).
- Hourly 5-minute check-in: done / blocked.
- Freeze features ~6 hours before the deadline; then integrate, test, record.

## 9. Claude roles (advisor personas — NOT team roles)

> These 1/2/3 are perspectives Claude advises Jess from. They are not the team roles A–D/M in §3. To avoid confusion, refer to them as **Advisor 1 (geospatial), Advisor 2 (data scientist / data pipelines & I/O), Advisor 3 (space mission-planning veteran)**.

Respond from these perspectives/expertise: A: You are a geospatial professional (10+ years of experience with GIS, working with agentic workflows and constantly keeping your skills up-to-date since 2024) whom I've hired to complete simpler tasks I want to offload, and can advise me on the best workflows to complete these tasks if I need to be the one doing them. B. A data scientist with 15 years of experience and great enthusiasm about automating data pipelines and aggregating data to extract value, especially in the age of Gen AI. Most of your expertise has been in creating CLEAN data pipelines. 3 years ago, you pivoted your career to education and have been tutoring adults who want to make the career transition to data science, so you know how to tailor individual education plans. C. NASA veteran who's been chief engineer in mission planning for various Apollo and Artemis missions, and has experience from the Moon landing in 1969.

# Project Handoff/Next Steps as of 14:32 on 14 November 2026

## Toolchain (decided 14:32 — no Nix, no jj)

Experts advised against Nix and jj for this hackathon. `flake.nix`, `nix/` and jj colocation stay in the repo
untouched "just in case", but **nobody needs them locally**. Where `AGENTS.md` says to use Nix or jj, this section wins.

- **Node.js 24 LTS** (install via `fnm`, `nvm`, or `brew install node@24`).
- **pnpm via Corepack:** `corepack enable` — picks up the version pinned in `package.json` (`packageManager`). Don't use npm/yarn (one lockfile: `pnpm-lock.yaml`).
- **Web app scripts:** `pnpm install` · `pnpm dev` · `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
  Pre-commit check = `pnpm fmt && pnpm lint && pnpm typecheck && pnpm test`.
- **Pipelines: TypeScript too** (one language, one lockfile, schemas shared with the app). Run scripts directly with Node 24 (`node pipelines/stable/dem.ts` — native type stripping) or `tsx` if a script needs TS-only syntax like enums. Add `pnpm` scripts per pipeline, e.g. `"pipe:dem": "node pipelines/stable/dem.ts"`. Deps: `zod`, `yaml`, `geotiff`, `@turf/turf`, `@duckdb/node-api`, `execa` (call GDAL). System dep: `brew install gdal` (check `gdalinfo --version`). Pipelines run locally, never in the Workers runtime.
- **Version control: plain Git + GitHub.** Small commits, keep the existing message style `area(type): Summary`. Jess works **directly on local `main`** (no feature branches). **Don't push `main` until 0a's CI fix lands** — every push to `main` deploys. `main` must always run.
- **⚠️ CI caveat:** the GitHub Actions deploy still runs `nix flake check`. After any change to `pnpm-lock.yaml` the Nix `pnpmDeps.hash` goes stale and **deploys will fail**. Options (decide with team role A): (a) switch the workflow to `pnpm install && pnpm build && pnpm deploy` (recommended), or (b) ask whoever owns Nix to bump the hash. Until then, local `pnpm dev` is unaffected.

## Current state (as of Sat Nov 14, 2026, ~16:45)

- **Step 1 done**, fast-forwarded onto local `main` (3 commits, **not pushed** — see 0a): `docs(docs)` toolchain, `map(feat)` MapLibre map
  (`lib/mars/types.ts`, `components/map/{mars-map,layer-panel}.tsx`, `/api/live` stub + test, placeholder `public/data/processed/*`),
  `pipelines(feat)` (`config.yaml`, `data/{raw,interim,processed}/`, `pipelines/`, `pnpm pipe:check`). `jess/map-skeleton` branch is now redundant.
- **Spike (uncommitted, on `main`)** to choose the map library:
  - MOLA 463 m DEM cut for 180–192°E, 40–52°N straight from USGS via `/vsicurl/` → `pipelines/spike/terrain-tiles.ts` → Terrarium + shaded-colour
    XYZ tiles in `public/data/spike/` (58 MB, gitignored, z5–9).
  - `/` = MapLibre: terrain, butterscotch sky, three.js habitat, canvas dust streaks (`components/map/spike/{terrain-storm.ts,spike-panel.tsx}`).
  - `/mapbox-spike` = Mapbox v3: same tiles + habitat, native `setFog` + `setSnow` tinted as dust; token pasted in-page (localStorage only).
  - **Outcome: Mapbox chosen** (§4). The MapLibre spike + `maplibre-gl` get removed when the main map is ported (1h).
- Gotchas: `maplibre-gl.css` forces `position: relative` on the container → size it with `h-full w-full`, not `absolute inset-0` (check the same for
  `mapbox-gl.css`). vinext dev server hit "Maximum call stack size exceeded" after ~1,200 files landed in `public/` — restart `pnpm dev` if `/` returns 500.
- Mars-scale constants: MapLibre/Mapbox size the world with Earth's radius → terrain `exaggeration: 1.878` (= 6378137 / 3396190) is **true Mars scale**;
  3D models scale by the same factor.

## Architecture (summary)

TypeScript pipelines (Node + GDAL CLI) → `data/processed/` (COG + GeoJSON + `manifest.json`) → served from `public/` or R2 →
Mapbox GL JS (v3) in the existing vinext app reads the manifest; Hono `/api/*` serves `/live`, `/route`, `/verdict`.
Each raster = COG (true values) + colored PNG/WebP preview with 4 corners. Mapbox measurements use
Earth's radius (~1.9× Mars) — compute distances in pipeline/routing code, no built-in scale bar.

## Step-by-step plan (∥ = can run in parallel)

### Step 0 — open items → send to team role A for approval

Everything below is a **proposal** until team role A approves it. Files to show them: `lib/mars/types.ts`, `config.yaml`,
`public/data/processed/manifest.json`, `server/api/app.ts` (`/api/live` stub). Record each answer in §4 Key decisions log.

- 0a. **OPEN — Toolchain + CI.** (1) Team agrees: no Nix/jj; Node 24 + pnpm (Corepack), Git (Jess on `main`), TypeScript pipelines + GDAL CLI, **Mapbox GL v3** for the map.
  (2) **Blocking merge to `main`:** CI deploy runs `nix flake check`, which fails once `pnpm-lock.yaml` changes (it already has on
  local `main`). Recommend: switch the workflow to `pnpm install && pnpm build && pnpm deploy`. Who edits the workflow?
- 0b. **OPEN — Data contracts (`lib/mars/types.ts`). Must be settled before Step 2.** Ask A to approve or change:
  1. `LayerManifest` = `{ aoi: {name, center, zoom, bounds}, crs, layers: StableLayer[] }`.
  2. `StableLayer` = `{ id, title, kind: raster|vector, path, corners?, cogPath?, units?, opacity?, visible?, source: {name, url?} }`.
     `source` is **required** (every layer shows its NASA source). Rasters ship as COG (values) + PNG/WebP preview + 4 corners.
  3. `LiveSnapshot` **adds 3 fields beyond §4**: `sol`, `lmst`, and `proxy_source` (e.g. "Gale (Curiosity REMS/RAD)") so the UI can label proxy data.
  4. `solar_alert_level` enum `none | watch | warning` — invented placeholder; A to define levels from DONKI + flight rules.
  5. **Units are not yet specified** for `radiation_dose_rate` (µGy/day? µGy/h?), `temp` (K or °C), `wind` (m/s), `dust_opacity` (τ), `sun_elevation` (°). Pick one each.
  6. `RouteResult` matches §4 as-is (`distance_km`, `est_time_min`, `max_slope` in degrees, `verdict`, `limiting_factor`, `reasons[]`).
  7. **Longitude convention conflict:** types + manifest use −180..180 (Mapbox needs this); `config.yaml` and the UI readout use 0–360 °E.
     Proposal: store −180..180 in data files, display 0–360 °E, convert only in the UI. A to confirm.
- 0c. **OPEN — Single source of truth for schemas.** Proposal: Zod schemas in `schemas/`; `lib/mars/types.ts` becomes `z.infer<>` re-exports;
  `schemas/validate.ts` (`pnpm validate`) checks every file in `data/processed/` + `manifest.json`; `z.toJSONSchema()` if anyone needs JSON Schema.
  Replaces the old Pydantic/`validate.py` plan.
- 0d. **OPEN — `config.yaml` values A owns.** `thresholds.suit_budget`, `radiation`, `walk_back` are **TBD**; `slope_max_deg: 20` is labeled an
  Artemis-lunar assumption. Confirm or replace. (`aoi` + `resolution_m` are Jess's, Step 2.)
- 0e. **OPEN — Data home (was 2c, pulled forward because it affects file paths in the contract).** Pipelines write `data/processed/`;
  the app currently reads `public/data/processed/`. Options: copy step (`pnpm pipe:publish`) into `public/`, or upload to R2. Recommend copy for the demo, R2 only if files exceed the static-asset limit.
- 0f. **OPEN — Mapbox account + token** (new, from the library decision). Who owns the Mapbox account; create a **public `pk.` token
  URL-restricted** to `imstuckonmars.help` + `localhost`; how the app reads it (build-time env var, never committed — `.env*` is gitignored);
  confirm expected map loads stay inside the free tier. Tell M (owns UI) about the switch.

### Step 1 — Get the skeleton running ✅ DONE (Sat 15:30)

- 1a–1e ✅ install, `maplibre-gl@5.24.1`, fmt/lint/typecheck, build, dev server serves `public/` (no Hono route needed), map + toggles + readout verified, `/api/live` test.
- 1f ✅ committed; now on local `main` (not pushed).
- 1g ✅ GDAL 3.13.3, pipeline deps (`@duckdb/node-api` is pre-release `2.0.0-r.1` — pin older if it misbehaves), folders, `config.yaml`, `pnpm pipe:check`.
- 1h. **OPEN — Port the main map to Mapbox v3.** Move `components/map/mars-map.tsx` + layers + habitat + storm onto `mapbox-gl`, token from env (0f),
  remove `maplibre-gl` and the MapLibre spike files, keep `/mapbox-spike` only until the port works. Then decide whether to keep the MOLA spike tiles as
  regional context (`pipelines/spike/terrain-tiles.ts` → a real `pipelines/stable/` script) and commit.

### Step 2 — AOI (team role B / Jess, with Advisor A)

- 2a. ~~Verify −176°, 46°N is inside Arcadia~~ ✅ roughly (Gazetteer map readout 46.4°N 181.4°E is inside the outline; placeholder sits ~107 km east,
  still inside). Still to do: copy Arcadia's **official center + N/S/E/W bounds** from the Gazetteer entry, then **search HiRISE DTMs** in those bounds
  (Mars Orbital Data Explorer, ode.rsl.wustl.edu/mars) and pick the AOI near a science target (ice-exposing craters / scalloped terrain).
- 2b. ~~Confirm Mars 2000 radius matches GDAL/PROJ~~ ✅ (`IAU_2015:49900` = `+R=3396190`). Still to do: record CRS, lat convention, lon direction per file in `data/raw/README.md`.
- 2c. → moved to 0e. Decide data home: `data/processed/` copied into `public/`, or R2 (resolves duplication with the "app reads only data/processed" rule).
- 2d. Update `manifest.json` + `config.yaml` AOI (and regenerate terrain tiles for the new AOI).

### Step 3 — First real layers (team role B)

- 3a. Hillshade, slope, hazard mask (20° — labeled assumption): COG + PNG/WebP preview + corners.
- 3b. Check: overlay preview on a known feature for misalignment (tests the linear image-corner approximation at real AOI size).
- 3c. Check: each layer's NASA source shows in the panel.

### Step 4 — ≥3 NASA data types

- 4a. CTX/HiRISE imagery, SWIM ice, THEMIS thermal inertia via manifest entries.
- 4b. ∥ Optional check: whether any NASA Trek endpoint offers a Web Mercator tile grid (regional basemap). Non-blocking.

### Step 5 — Route (team role C)

- 5a. Route GeoJSON + `/api/route` returning `RouteResult`.
- 5b. Check: distances use Mars radius in pipeline, never Mapbox; no built-in scale bar.

### Step 6 — Live feed (team role D)

- 6a. Replace `/api/live` stub with replayed snapshots; show `proxy_source` in UI.
- 6b. Check: stub zeros never displayed as real data.

### Step 7 — Verdict banner + timeline (team roles A + M)

- 7a. Server-side `/api/verdict` citing the fired flight rule; banner = status · limiting constraint · margin · time to shelter; SEP demo flip to CAUTION.
- 7b. Polish: move hardcoded map hex colors to theme tokens in `app/globals.css`; error state if manifest fetch fails; confirm °E readout convention.

### Step 8 — Scale / stretch

- 8a. Check: verify Workers static-asset per-file limit (believed 25 MiB) in Cloudflare docs; move larger COGs to R2.
- 8b. Click-to-inspect values via `geotiff.js` reading COGs.

### Before feature freeze

- Remove/replace all placeholders (`stops.geojson`, `route.geojson`, AOI name) so nothing fake ships.

## Unverified claims to treat with caution

25 MiB static-asset limit · NASA Trek tile projections · AOI coordinates.
Verified 15:30: Mars 2000 radius = 3396190 m in PROJ (`IAU_2015:49900`) · vinext dev serves `public/`.
