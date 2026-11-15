# Project Context: LARA — Mars EVA Planning Tool (NASA Space Apps Challenge 2026)

_Last updated: Sun Nov 15, 2026 (hackathon day 2 of Nov 14–15). Team of 5. Reorganised: one decisions log, one open-items list (§7), finished work in §11 "Completed"._

**How this file is organised:** §1–2 the brief · §3 who does what · §4 decisions (what's settled) · §5–6 user story + data architecture ·
**§7 open items — the only to-do list** · §8 how we work + how to run · §9 data reference (what exists, where, caveats) · §10 advisor personas ·
§11 completed log · §12 references.

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

> **Naming note:** Roles **A–D and M** are _human team members_, unrelated to the **Claude advisor personas** in §10. "Role 1/2/3" in an
> advice request means the §10 personas; team ownership of work means this table. Jess = team role **B** (stable data).

| Role                                        | Owner                                     | Scope                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Flight rules, GO/NO-GO, integration** | **Shared by the whole team** (Sun Nov 15) | Decided together so everyone is on board with format/schema/threshold changes. Flight rules/assumptions sheet (every GO/NO-GO cites it); integration: common time base, file names, CRS, `config.yaml`, `schemas/`, `validate.ts`. |
| **B — Stable data (geospatial/mapping)**    | **Jess**                                  | Terrain (DEM), slope, roughness, hazard masks, shadows, geology, thermal inertia. Reproject → clip → snap to common grid → clean → derive → export.                                                                                |
| **C — Routing & mission planning**          | TBD (confirm name)                        | Science stops; cost surface → least-cost rover route base → staging point → walk; drive time; battery / return-to-base margin. Rover energy figures are labelled assumptions/simulated.                                            |
| **D — Live data + forecast**                | TBD (confirm name)                        | Replays archived live data as a "live" feed; same-day forecast as threshold rules with confidence; RAG explanation (stretch).                                                                                                      |
| ⭐ **M — UI + story/pitch**                 | **M**                                     | Map UI, layer panel, timeline, verdict banner, demo script, video, slides. Owns R2 hosting/uploads.                                                                                                                                |

### Notes from expert review (sanity check, not official NASA guidance)

- Split mirrors real NASA functions: ground data systems (A), geospatial team (B), traverse planning (C), space weather/radiation console — SRAG at JSC (D), crew displays (M).
- **Verdict banner should read like a flight rule:** status · limiting constraint · margin · time to shelter.
- **Return margin = remaining rover battery (and crew consumables) − energy/time to drive home at a degraded pace** — not just distance. Apollo limited rover range by walk-back distance assuming rover failure; at 93–468 km that's impossible, so state the rover-failure assumption (pressurized rover / rescue) explicitly.
- _(Superseded by the rover-only decision, kept for context:)_ Apollo walking data is lunar (1/6 g, different suit); Mars gravity is ~0.38 g, so any walking/driving figures from the Moon are assumptions.
- Mars crews operate autonomously (4–24 min one-way light delay). Line-of-sight/comm = one pitch sentence or a simple viewshed back to habitat, not a full category.
- Data caveats: Curiosity's RAD (radiation) + REMS (weather) are co-located at **Gale crater**. REMS does **not** measure dust opacity directly (that comes from imaging). NASA DONKI space-weather alerts are Earth-centric — must reason about Mars's position relative to each event.

## 4. Key decisions log (settled — change only as a team)

| Question                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name             | **LARA** (only name; the assessment engine is part of LARA, not a separate "ARES").                                                                                                                                                                                                                                                                                                                                           |
| Landing & base           | **Arcadia Planitia** (plains) — final. Smooth terrain, subsurface water ice, sunlight for power, despite sparse surface data. Habitat at −176.05°E, 45.97°N.                                                                                                                                                                                                                                                                  |
| Science problem          | **Water-ice procurement (ISRU)** (Jess, Sat ~20:00). POIs = 4 HiRISE sites: terraced craters (buried-ice evidence, Bramson et al. 2015) + one ridge site.                                                                                                                                                                                                                                                                     |
| Mobility                 | **2-leg journeys** (Jess + Role C, Sun Nov 15): drive (rover) base → staging point, then walk (EVA) staging point → POI and back. Drive leg: rover rules + slope + thermal inertia. Walk leg: suit rules + slope + roughness. _Superseded: "rover drives only" (same morning)._                                                                                                                                               |
| Staging point            | **Jess, Sun Nov 15:** nearest **40 × 40 m** square **≥ 25 m** from the POI, within 2 km, **no 1 m slope > 5°** (10° fallback → CAUTION reason), **roughness < 0.25 m**, no boulders. In code: `findStagingPoint` (`lib/mars/site-grid.ts`) and `pnpm pipe:staging`. Rationale + sources: §9 "Staging point".                                                                                                                  |
| Far sites (> 200 km)     | **Team, Sun Nov 15:** ESP_037352 (424 km) and ESP_054060 (468 km) are shown as **NO-GO** under the 200 km rover range rule — for now.                                                                                                                                                                                                                                                                                         |
| Roughness + rock sizes   | **Team, Sun Nov 15:** roughness classes 0.25 / 0.5 / 1 m and walker rock sizes 0.3 / 0.5 / 1 m agreed. Team assumptions — NASA has no suited-walking limit. Rationale: `docs/PITCH_NOTES.md`.                                                                                                                                                                                                                                 |
| Rovers per mission       | **2 rovers go out together** (mutual rescue).                                                                                                                                                                                                                                                                                                                                                                                 |
| Suit / walk flight rules | Sourced values (`config.yaml` ↔ `lib/flight-rules/rules.ts`, synced by `config.test.ts`): slope 20° (NASA lunar suit limit), suit 8 h + 30 min reserve, radiation 18 / 90 µGy/h (ASSUMPTION from Curiosity RAD quiet rate), suit walk-back ≤ 2 km. NASA has no Mars limits — Moon/ISS values are labelled assumptions.                                                                                                        |
| Rover flight rules       | **AGREED by the team, Sun Nov 15** (`lib/flight-rules/rover-rules.ts`): slope 5° caution / 10° no-go on the 463 m MOLA grid (halved because MOLA reads slopes low; 5° is the lower limit), battery 30 / 20 %, reserve 20 / 10 km, range 100 / 200 km (EVA-EXP-0042 two-rover source added), trip 7 / 14 sols, rover breakdown walk-back 15 km. ⚠ On slides, name the suit walk-back (2 km) and rover walk-back (15 km) apart. |
| Level 2 forecast         | Code/threshold rules with stated confidence, not a model. RAG (if any) only explains verdicts, citing the rule that fired.                                                                                                                                                                                                                                                                                                    |
| Data output formats      | **Stable:** COG rasters on a common grid; GeoJSON for stops/features. **Live:** JSON snapshot `{timestamp, radiation_dose_rate, solar_alert_level, dust_opacity, temp, wind, sun_elevation}`. **Route:** GeoJSON line + `{distance_km, est_time_min, max_slope, verdict, limiting_factor, reasons[]}`. **Forecast:** `[{hour, dust, radiation, verdict}]` + `explanation`.                                                    |
| Live data for Arcadia    | Gale (Curiosity RAD) / Jezero (Perseverance MEDA, MOXIE) as a **clearly labelled proxy feed**, optionally adjusted with Mars Climate Database values. Orbital imagery (HiRISE/CTX) replaces rover imagery.                                                                                                                                                                                                                    |
| Map library              | **MapLibre GL JS 6.18.0** (M, Sun Nov 15, unexpected ruling; `1bbb6d0`, `docs/MAP_RENDERER.md`; no token). Replaced Mapbox GL JS v3.                                                                                                                                                                                                                                                                                          |
| Toolchain                | Plain Git + GitHub (no jj); Nix optional; Node 24 + pnpm; TypeScript pipelines + GDAL CLI. Details §8.                                                                                                                                                                                                                                                                                                                        |
| Data home                | Telemetry in **D1** (teammate's backend). Static rasters/tiles on **R2** (`tiles.imstuckonmars.help`, M uploads) or locally in `public/data/`.                                                                                                                                                                                                                                                                                |
| Schemas                  | Owned by a teammate — don't build `schemas/` here. Longitude: store −180..180, display 0–360 °E.                                                                                                                                                                                                                                                                                                                              |
| Proxy-data framing       | **Team, Sun Nov 15:** Gale/Jezero data may stand in for Arcadia, always labelled as a proxy with the caveat that **Arcadia has not been ground-truthed**. **No Mars Climate Database adjustment for now** (keeps every shown number a real measurement); MCD scaling (pressure, temperature, sun elevation) is future work.                                                                                                   |
| Manifest format          | **M OK'd, Sun Nov 15:** optional `sceneControl` + `caveats` on `StableLayer` (`lib/mars/types.ts`) may be added.                                                                                                                                                                                                                                                                                                              |
| UI theme                 | _The Martian_-inspired, original design — no copyrighted assets/logos.                                                                                                                                                                                                                                                                                                                                                        |

### Telemetry units (team table, Sat Nov 14 — the table was titled "ARES" by mistake; the product is **LARA**)

| Dataset | Measurement                           | Unit                                          |
| ------- | ------------------------------------- | --------------------------------------------- |
| MEDA    | Air temperature                       | K                                             |
| MEDA    | Atmospheric pressure                  | mbar                                          |
| MEDA    | Ground/thermal brightness temperature | K                                             |
| MEDA    | Relative humidity                     | %RH                                           |
| MEDA    | Wind speed                            | m/s                                           |
| MEDA    | Wind direction                        | °                                             |
| MEDA    | Solar irradiance                      | W/m²                                          |
| MEDA    | Infrared radiation                    | sensor-dependent; brightness temperature in K |
| MEDA    | Dust optical depth                    | dimensionless                                 |
| MOXIE   | Oxygen production rate                | g/h                                           |
| MOXIE   | Total oxygen produced                 | g                                             |
| MOXIE   | Electrical current                    | A                                             |
| MOXIE   | Voltage                               | V                                             |
| MOXIE   | Electrical power                      | W                                             |
| MOXIE   | Internal temperature                  | field-dependent (K or °C)                     |
| MOXIE   | Gas pressure                          | field-dependent (requires XML verification)   |
| MOXIE   | Gas flow rate                         | field-dependent (requires XML verification)   |
| MOXIE   | Experiment elapsed time               | s                                             |
| RAD     | Radiation absorbed-dose rate          | µGy/h                                         |

Not in this table → **PLACEHOLDER** until agreed: sol/LMST format, solar alert levels, sun elevation.

## 5. User story — "Plan a science mission and get home"

You open LARA and select a hypothetical habitat in Arcadia Planitia as your base. Your goal is to explore an interesting geological site by rover and return within your simulated battery budget.

1. **Inspect the terrain** — click the Mars map to see elevation, slope, imagery, and data sources. Overlays highlight steep terrain and areas without reliable coverage.
2. **Discover meaningful destinations** — browse science targets with geological context, relevant orbital imagery (HiRISE/CTX), and what you could investigate there.
3. **Compare routes** — shortest allowed route vs. terrain-aware alternative: distance, elevation profile, ascent, difficult segments.
4. **Check the whole mission** — set simulated rover battery, drive speed, crew consumables, science-stop duration, reserve requirements. LARA assesses outbound + return and shows your **limiting resource**.
5. **Play through the traverse** — simulated rover position moves along the route; dashboard updates elapsed time, remaining resources, modeled return reserves. Pause or change assumptions for "what if?"

- **Understand the recommendation** — why a route/destination fits your constraints, the evidence, what remains uncertain. Finish with a mission summary (route, objectives, assumptions, sources).
- **Stretch:** AI copilot explains comparisons; draw a hypothetical blocked zone and reroute; thermal-material context.
- All astronaut/rover resources and movement are **clearly labeled simulated**. NASA terrain and observations are evidence, not a guarantee of real-world safety.

### Target demo moment

Plan a nominal rover traverse → mid-sol, the replayed feed shows a solar particle event (SEP) alert → verdict flips to CAUTION → return path and time-to-shelter appear (pressurized rover = immediate shelter; base is X h away).

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

## 7. Open items — the one to-do list

Grouped by who acts. Strike through and move to §11 when done.

### Team decisions (shared role A)

1. **Regional slope 200 m** — waiting on the routing teammate; router input (would mean re-setting the halved MOLA slope limits) or display-only?
2. ~~Manifest format change~~ — M OK'd (§4). Jess/Role A to add `sceneControl` + `caveats` to `StableLayer`.
3. ~~Proxy-data framing~~ — decided (§4): proxy label + not ground-truthed caveat, no MCD adjustment yet. Exact UI wording still to write (D / M).
4. Confirm owner names for roles C and D.

### M (hosting + UI)

1. ~~Upload sites-v2~~ done Sun Nov 15 — live at `tiles.imstuckonmars.help/sites-v2`; `SITE_DATA_ROOT` / `ROUGHNESS_DATA_ROOT` point at it (verified: slope + roughness COGs, TI / regional-slope / roughness tiles all HTTP 200).
2. ~~Host regional-slope tiles~~ — already inside sites-v2 (`sites-v2/regional-slope`), no release config needed.
3. Steep-tilt terrain fallback fix (§9 Gotchas) — centre-based check in `terrainSourceForView`.
4. Before freeze: replace placeholder `stops.geojson` / `route.geojson` (AOI name now fixed in `config.yaml`) with real routes so nothing fake ships.
5. Polish (incl. tinted HiRISE RED, imagery to z18 — moved from Jess): map hex colours → theme tokens in `app/globals.css`; error state if manifest fetch fails; confirm °E readout convention.

### Jess (role B)

1. ~~Thermal-inertia R2 prefix~~ — `sites-v2/thermal-inertia`; wired (`THERMAL_INERTIA_DATA_ROOT`).
2. ~~Regional slope onto the map~~ — Scene panel switch "Regional slope" (`addRegionalSlope`, `REGIONAL_SLOPE_*` in `lib/mars/ground-layers.ts`); display only until the team decides §7 item 1. ~~Geology~~ done (`8704a69e`).
3. Slides: pin the page of the Hassler 2014 quiet-time dose rate (~9 µGy/h) — the radiation flight rule's 18 / 90 µGy/h thresholds are
   2× / 10× it (`config.yaml`). ~~Golombek 2012 journal URL~~ added to `docs/PITCH_NOTES.md`.
4. **Ice evidence** — swim.psi.edu is down for the long term (HTTP 523, no mirror found). Use instead: Bramson 2015 + Morgan 2021 figures on slides; Mars Odyssey Neutron Spectrometer water-equivalent-hydrogen maps (Feldman et al.; arXiv 1708.00518; coarse ~300 km; PDS download path not yet confirmed) as a regional layer; HiRISE terraced craters (have). PIA26045 / PIA12214 are illustrations → slides only.
5. **Regional slope tiles** regenerated with 1° / 2° / 5° / 10° / 20° classes (the corridor is flat: ≥ 1° 8.7 %, ≥ 5° 0.4 %, ≥ 10° 0.04 %). **M: re-upload `sites-v2/regional-slope`** (local tiles are new; R2 still has the old 10°+ classes, so the overlay looks blank until then).

### Roles C / D

- C: route GeoJSON fixtures for both legs (demo dry run) so M can build UI; `/api/route` returning `RouteResult`; distances on the Mars radius.
- D: replace `/api/live` stub with replayed snapshots, show `proxy_source`; never display stub zeros as real data.

### Before feature freeze (~6 h before deadline)

- Every layer shows its NASA source; references (§12) in sync; AI voice disclosure in place.
- Check: Workers static-asset per-file limit (believed 25 MiB) — move larger COGs to R2.

### Future data layers (horizon)

Dust-raising potential / dust cover (TES DCI + TI + wind) · illumination/shadows (sun position + DTM horizon) · CRISM where covered ·
line-of-sight to habitat (one pitch sentence or simple viewshed) · click-to-inspect values via `geotiff.js`.

## 8. How we work

### Working agreements

- Don't change the data format without telling everyone; update the sample files the same hour.
- Build the demo path first: one location, one route, one live event, one verdict.
- Every layer shows its NASA source (supports Validity criterion).
- Hourly 5-minute check-in: done / blocked.
- Freeze features ~6 hours before the deadline; then integrate, test, record.
- **Jess:** work directly on `main`, no feature branches; ask before pushing; explain jargon in plain language.

### Toolchain + how to run (team-agreed Sat Nov 14; wins over `AGENTS.md` where they disagree)

- Plain Git + GitHub, small commits, message style `area(type): Summary`. Every push to `main` runs CI (`.github/workflows/ci.yml`: frozen
  install → `fmt:check` → `lint` → `typecheck` → `test` → `build` → deploy).
- Node 24 (fnm) + pnpm via Corepack; GDAL via `brew install gdal`. Nix optional.
- `pnpm dev` → http://localhost:5173. **Restart it after running any tile pipeline.**
- Pre-push check = `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Pipelines: TypeScript run with Node 24, shelling out to GDAL; run locally, never in Workers. `pnpm pipe:check` verifies GDAL + the Mars 2000
  sphere. Pipelines that write committed JSON print it unformatted → `pnpm fmt` afterwards.
- Site pipeline: `pnpm pipe:sites [dtm]` → `pnpm pipe:slope <dtm>` → `pnpm sites:package`. Raw inputs (1.8 GB) in `data/raw/hirise/` (URLs in
  `data/raw/README.md`); intermediates in `data/interim/hirise/<dtm>/` (keep `dem.tif`, `ortho.tif`, `*.vrt`, `slope-deg.tif`, `mola-pad.tif`,
  `footprint.geojson`, `dtm-srs.wkt`).
- Other Role B pipelines: `pipe:roughness`, `pipe:boulders`, `pipe:thermal-inertia`, `pipe:regional-slope`, `pipe:geology`, `pipe:staging`.

### Architecture (summary)

TypeScript pipelines (Node + GDAL CLI) → COGs + tiles + GeoJSON (R2 / `public/data/`); telemetry → D1 (`/api/telemetry`, `/api/missions`).
MapLibre in the vinext app reads `manifest.json`; Hono `/api/*` serves `/live`, `/route`, `/verdict`. Each raster = COG (true values) + coloured
tiles. The map measures with Earth's radius (~1.88× Mars) — compute distances in pipeline/routing code; no built-in scale bar.

## 9. Data reference (Role B — what exists, where, caveats)

### Water-ice sites (POIs)

| DTM                               | HiRISE obs      | POI (lon −180..180, lat) | Type                                                  | Distance from habitat | POI provenance                                     |
| --------------------------------- | --------------- | ------------------------ | ----------------------------------------------------- | --------------------- | -------------------------------------------------- |
| DTEEC_033225_2250_033146_2250_A01 | ESP_033225_2250 | −176.33383, 44.41589     | Possible terraced crater, ~130 m, 12 m deep           | 93 km                 | Picked by Claude from the ortho; confirmed by Jess |
| DTEEC_034082_2260_033014_2260_A01 | ESP_034082_2260 | −171.38243, 45.64829     | Possible terraced bullseye crater, bowl ~28 m deep    | 194 km                | Circled by Jess; DTM-refined (moved 35 m)          |
| DTEEC_037352_2245_037418_2245_A01 | ESP_037352_2245 | −166.14298, 44.39035     | Terraced bullseye crater (confirmed), bowl ~41 m deep | 424 km                | Circled by Jess; DTM-refined (moved 85 m)          |
| DTEEC_054060_2265_054126_2265_A01 | ESP_054060_2265 | 172.56388, 46.07022      | Ridges (not a crater)                                 | 468 km                | DTM centre                                         |

POI refinement: circle → lon/lat via ortho footprint (±~50 m), then centroid of the lowest 30 % of relief within 250 m on the 1 m DTM. Logged in
`pipelines/stable/hirise-sites.ts` and `sites.geojson` (`position_note`). Distances: great-circle, Mars 2000 sphere.

- **Files:** `public/data/processed/sites.geojson` (committed; per site `poi` point + `footprint` polygon; props `id`, `hirise_id`, `title`,
  `site_kind`, `bbox`, `terrain_bbox`, `position_note`, `url`, `attribution`). Tiles on R2 `sites-v1` (`SITE_DATA_ROOT`).
- **Slope:** `data/processed/sites/<dtm>/slope.tif` (R2: `sites-v1/slope/<HiRISE ID>_slope.tif`) — COG, Int16 tenths of a degree, lon/lat Mars
  2000, ~1 m, nodata −9999 (incl. 10 m trimmed edge). Mean / % ≥ 20°: ESP_033225 4.3° / 0.1 % · ESP_034082 7.3° / 1.8 % · ESP_037352 4.1° /
  0.2 % · ESP_054060 5.5° / 0.7 %. Hazards are crater walls / ridge flanks. Overlay: yellow 10–15°, orange 15–20°, red ≥ 20°.
- **Elevation (true, m):** `data/interim/hirise/<dtm>/dem.tif` (1 m, nodata −32768); MOLA 463 m around it. Never read heights from display tiles (+10 km).
- **Map code:** `components/map/scene.ts` (`addSites`, slope, terrain switching), `components/map/scene-panel.tsx`, `components/map/mars-map.tsx`,
  `lib/mars/terrain.ts` (`terrainSourceForView`), `lib/mars/map-data.ts` (`SITE_DATA_ROOT`), `lib/mars/ground-layers.ts` (TI/roughness roots).

### Walking-scale ground: roughness + boulders

- **Roughness** (`pnpm pipe:roughness <dtm>`): RMS height deviation from the local 5 m trend, 5 m cells. COG `data/processed/sites/<dtm>/roughness.tif`
  (Int16 cm), tiles `public/data/sites/<dtm>/roughness/` z11–16, summary `public/data/processed/roughness-sites.json`. p50 0.08–0.15 m, mostly DTM
  noise (Kirk et al. 2008); only crater rims/ridge flanks stand out. In the `sites-v2` package (uploaded, live).
- **Boulders** (`pnpm pipe:boulders [dtm]`): rock-shadow candidates within 500 m of each POI on the 0.25 m ortho (Golombek et al. 2008/2012) →
  36-candidate review (`pipelines/stable/boulders-review.json`) → upper bound on rock abundance (rule of three / Wilson) → Golombek & Rapp (1997).
  Review found **0/36, 0/36, 0/36, 0/1** real rocks (confirmed by Jess). Upper bounds k ≤ 6.7 % · 10.7 % · 9.3 % · 4.0 %; rocks ≥ 0.5 m ≤ 2.5 · 5.5 ·
  4.5 · 0.8 per 100 m² (033225 · 034082 · 037352 · 054060). Reviewing 100 would tighten to ≤ 3 %. Pitch: "no boulder fields near the stops; the
  walking hazards are polygon troughs and crater walls."

### Thermal inertia (THEMIS, 100 m)

- `pnpm pipe:thermal-inertia` (~4 min), 170–196°E, 43–48°N → `data/processed/thermal-inertia/thermal-inertia.tif` (Int16, nodata −9999, **lon
  0..360 °E**), tiles `public/data/thermal-inertia/` z5–11 (R2: `sites-v2/thermal-inertia`), summary
  `public/data/processed/thermal-inertia-sites.json`.
- Classes (±20 %): < 150 fine dust · 150–400 sand/crusted soil · ≥ 400 firm/rock. Mean within 5 km: ESP_033225 94 (85 % fine dust) · habitat 126 ·
  ESP_034082 186 · ESP_037352 190 · ESP_054060 367. Class robust only for ESP_033225 (dust) and ESP_037352 (sand).
- **Coverage — always state which number:** THEMIS covers **~57 % of our AOI** (57.4 %; the rest is _no data_, not safe ground) but only **47 % of
  Joseph's drive strip**. Per-site coverage within 5 km is 100 %. JSON carries `caveats[]` (coverage, ±20 %, top few cm, 100 m pixels, not ground-truthed).
- In the route cost (Joseph, `64333362` + `fa2b8526`): loose dust (< 150) → rolling resistance 0.30 instead of 0.15 (`GROUND` in `rover-rules.ts`).
- Pitch: nearest site = softest, dustiest ground (battery drain, dust on panels/suits); firmest ground is farthest away.

### Regional slope + geology (drive corridor)

- **Regional slope** (`pnpm pipe:regional-slope`): MOLA/HRSC 200 m → `data/processed/regional-slope/regional-slope.tif` (Int16 tenths °, lon
  0..360 °E), tiles `public/data/regional-slope/` z5–10, summary `public/data/processed/regional-slope.json`. Mean 0.45°; ≥ 1° 8.7 %, ≥ 5° 0.4 %, ≥ 10° 0.04 %, ≥ 20° 0 %; map classes 1/2/5/10/20°.
  Tiles on R2 `sites-v2/regional-slope`; map switch in the Scene panel. Not used by the router (which uses 463 m MOLA) — §7 team item 1.
- **Geology** (`pnpm pipe:geology`): USGS SIM 3292 (1:20M) → `public/data/processed/geology.geojson` + `geology-sites.json`. Habitat + 3 crater sites
  on **Av** (Amazonian volcanic); ESP_054060 on **lHl** (Late Hesperian lowland). Ice-rich mantle isn't mapped at 1:20M. Not on the map yet.

### Staging point (rationale for the §4 rule)

- Every value is the more conservative, more precise choice: shorter walk = less suit oxygen, quicker return to the rover (safe haven).
- **25 m** follows Apollo practice (Apollo 17 Station 7 LRV ~25 m from the boulder; Apollo 15 Central Station 26 m). Desert RATS 2011 reportedly
  kept EVA crews within 25 m of the rover (primary paper not checked).
- **NASA sets only a maximum:** "stay within a one hour walk back to their rover" (EVA-EXP-0042 Rev B §9.6) ≈ 2 km at ~2 km/h. Sim Series 2 chose
  parking per spot (comm, lighting, camera, solar). The only fixed standoff found (500 m) is rover ↔ lander.
- **10° fallback** exists because the 1 m DTM noise + polygon troughs add metre-scale slope: no 40 m square within 2 km of ESP_034082 meets 5°.
- Results (straight-line walks; the app's pathfinder may detour): ESP_033225 0.17 km · ESP_034082 0.19 km (10° fallback) · ESP_037352 0.37 km ·
  ESP_054060 0.06 km. Crater sites park on the flat outside the bowl. Most straight walks still cross > 20° crater walls (ESP_034082 9–13 %).
- Code: `findStagingPoint` returns `{ point, slopeLimitDeg, fallback, roughnessChecked }`; constants `STAGING_MIN_M`, `PARKING_*`, `STAGING_RULE`.
  Roughness is checked once `ROUGHNESS_DATA_ROOT` is set (now → sites-v2).

### Rover range (context for §7 team item 1)

Two pressurized rovers give a "mobile safe haven" that could extend range to **100 km or more**; the rescue rover stays within an **8-hour drive**;
rovers "notionally never travel farther than 100 km" from the ascent vehicle (EVA-EXP-0042 Rev B §4.2.1.3.1, §7.3.2). That is Artemis-era **Moon**
planning, not Apollo (Apollo walk-back limit 7.6 km). Agreed rover range: 100 km caution / 200 km no-go.

### Data quality & processing decisions (HiRISE sites)

- **Slope results** (1 m DTM, metre grid, edges trimmed; limit 20°): ESP_033225 mean 4.3°, **0.1 %** ≥ 20° · ESP_034082 mean 7.3°,
  **1.8 %** · ESP_037352 mean 4.1°, **0.2 %** · ESP_054060 (ridges) mean 5.5°, **0.7 %**. All gentle terrain; hazards are crater walls/ridge flanks.
- **Sizes:** local tiles (imagery + terrain + slope) 71–157 MB/site, **~430 MB total**; slope COGs **277 MB** as Int16 tenths (990 MB as Float32); Mapbox upload GeoTIFFs **274 MB total**
  (JPEG Q75 + mask; RGBA deflate was 1.55 GB, Q85 355 MB; single-band grey saves nothing).

- **Reprojection decision:** everything is stored as **lon/lat on the Mars 2000 sphere** (`+proj=longlat +R=3396190`), east-positive −180..180.
  HiRISE DTMs ship in equirectangular on **local-radius spheres** (3,386,150.7 m / 3,387,887.7 m) with site-specific standard parallels; lat/lon angles
  carry over unchanged between Mars spheres (no datum shift), so we reproject rather than resample heights. Tiles are cut by labelling the Mars lon/lat
  as EPSG:4326 for `gdal2tiles` (it only knows Earth) — correct because Mapbox also treats Mars degrees as Earth degrees.
- **Slope is computed in metres, not degrees:** DTM → local equirectangular metre grid centred on each site (lat_ts = site latitude, Mars 2000 sphere,
  1 m) → `gdaldem slope` → back to the DTM's lon/lat grid. Computing slope on a lon/lat grid would distort x vs y by cos(lat) (~30 % at 45°N).
- **Broken JP2 georeferencing:** RED_A orthos for ESP_034082 and ESP_037352 have a GeoJP2 header with standard parallel 0° → GDAL places them at
  **~84–90°N**. Their projected metre coordinates match the DTM exactly, so the pipeline assigns the **DTM label's CRS** to the ortho.
- **Unreliable DTM edges:** HiRISE DTM borders produce fake ~90° slopes. `-compute_edges` and a footprint cutline did not fix it; the pipeline
  **blanks slope within 10 m of the DTM's no-data area** (`gdal_proximity`). A few isolated 1-px spikes remain → report **percentiles / % ≥ limit**, not max.
- **Display datum shift:** site terrain tiles add the team's `DISPLAY_ELEVATION_OFFSET_M` (+10 km; Mapbox camera can't go below 0) like their other
  terrain sources — **display only**; true heights are in the DTM/COGs. Terrain blends to MOLA 463 m (`/vsicurl/`, ~1 km pad) outside each DTM.
- **Antimeridian:** ESP_054060 is at 172.56°E (positive), the others at −176…−166 → the AOI crosses ±180; MOLA pads are cut per site.
- **Resolution choices:** imagery tiled to z17 (~0.45 m/px; source 0.25 m); terrain mesh to z15 (~1.8 m; DTM 1 m); slope tiles to z16.
- **Terrain switching:** `terrainSourceForView` (teammates' `lib/mars/terrain.ts`) now prefers a site's 1 m terrain when the whole view is inside its
  padded box at zoom ≥ 11 (tested in `lib/mars/terrain.test.ts`).

### Gotchas

- vinext dev server crashes ("Maximum call stack size exceeded", `als-registry.js`) when thousands of files change under `public/` (pipelines,
  broken rebase) → restart `pnpm dev`.
- A half-finished rebase leaves conflict markers in `package.json` → `JSONError … key must be a string`. Finish/abort the rebase.
- The map container CSS forces `position: relative` → size it with `h-full w-full`, not `absolute inset-0`. The map needs absolute tile/GeoJSON
  URLs (prefix `location.origin`).
- **Site terrain drops to MOLA 463 m at steep or zoomed-out tilts** (e.g. ESP_033225 z15/80°, z14/70°, z11.5/60°): `terrainSourceForView` needs
  the whole view inside the site's padded box (`lib/mars/terrain.ts:29-31`). Landing view (z15/65°) is fine. Fix pending M.
- Local `POST /api/copilot/session` → 500 = local D1 not migrated/seeded → `docs/BACKEND.md` "Reproduce locally" (import once only).
- Display terrain tiles are **not** true heights (+10 km `DISPLAY_ELEVATION_OFFSET_M`).
- Mars datasets mix planetocentric/planetographic latitude and east/west longitude — record each file's CRS. Turf/MapLibre distances assume Earth.

### Unverified claims to treat with caution

25 MiB static-asset limit · NASA Trek tile projections. Verified: Mars 2000 radius = 3396190 m in PROJ (`IAU_2015:49900`) · vinext dev serves `public/`.

## 10. Claude roles (advisor personas — NOT team roles)

> These 1/2/3 are perspectives Claude advises Jess from. They are not the team roles A–D/M in §3. To avoid confusion, refer to them as **Advisor 1 (geospatial), Advisor 2 (data scientist / data pipelines & I/O), Advisor 3 (space mission-planning veteran)**.

Respond from these perspectives/expertise: A: You are a geospatial professional (10+ years of experience with GIS, working with agentic workflows and constantly keeping your skills up-to-date since 2024) whom I've hired to complete simpler tasks I want to offload, and can advise me on the best workflows to complete these tasks if I need to be the one doing them. B. A data scientist with 15 years of experience and great enthusiasm about automating data pipelines and aggregating data to extract value, especially in the age of Gen AI. Most of your expertise has been in creating CLEAN data pipelines. 3 years ago, you pivoted your career to education and have been tutoring adults who want to make the career transition to data science, so you know how to tailor individual education plans. C. NASA veteran who's been chief engineer in mission planning for various Apollo and Artemis missions, and has experience from the Moon landing in 1969.

## 11. Completed (log)

**Decisions + setup (Sat Nov 14)**

- ✅ Toolchain, CI, data contracts (`LayerManifest` / `StableLayer`), telemetry units, data home (D1 + static rasters), sourced suit/radiation flight rules.
- ✅ Skeleton app + map verified; pipeline skeleton (GDAL 3.13.3, `pnpm pipe:check`). Mapbox v3 port (Sat ~19:30), later replaced by MapLibre.
- ✅ Science objective: water-ice procurement (ISRU).

**Role B data (Jess)**

- ✅ AOI → 4 HiRISE water-ice sites as POIs (found via ODE REST, 59 DTMs in 160–215°E, 30–65°N); CRS per file in `data/raw/README.md`; `sites` layer in the manifest.
- ✅ Site pipelines (`pipe:sites`, `pipe:slope`) — 0.45 m imagery, 1 m terrain, slope + 20° hazard overlay, attribution; pushed.
- ✅ Hosting on R2: `sites-v1` uploaded and `SITE_DATA_ROOT` set by M (`f9bbf09`, `docs/SITE_STORAGE.md`); `_mapbox.tif` upload files obsolete.
- ✅ Visual check on MapLibre 6.18.0 (Sun ~01:30): all 4 sites pass.
- ✅ Roughness + boulder bounds for all 4 sites; `sites-v2` package built (`34a4626a`; uploaded Sun Nov 15).
- ✅ Thermal inertia pipeline, uploaded to R2; in the route cost (Joseph) and on the map (Scene panel).
- ✅ Overnight run (pushed): references verified (`a1ae6279`), regional slope (`1e9b17ca`), geology (`88026c48`), staging-point pipeline (`cc8b6fcd`, now on the team rule). Report: `docs/agent-briefs/overnight-data-REPORT.md`.
- ✅ Role C brief sent; agreed slope-only cost surface first.

**Team (Sun Nov 15)**

- ✅ sites-v2 uploaded by M; data roots wired; thermal-inertia + roughness + regional slope tiles verified live and regional slope added to the map (Jess).
- ✅ Role A shared by the whole team. MapLibre port (`1bbb6d0`). CI model test fixed (`1e0e423`).
- ✅ 2-leg journeys (`lib/mars/drive-walk.ts`); staging-point rule decided and in code (`d0e24861`); 2 rovers per mission.
- ✅ Rover rules agreed (5° lower slope limit; EVA-EXP-0042 range source added).
- ✅ By teammates: rover energy-cost A* (`5d9c6e84`), soft ground from TI (`fa2b8526`), walk-leg time/consumables (`245aee73`), sources screen
  (`eb50f3fc`), mission summary (`fc249a77`), `/api/verdict`, RAD telemetry, Mars clock.

## 12. References (cite every external source — required for submission)

> Keep this list in sync whenever a dataset, paper or rule source is added. Each map layer also shows its credit in the UI.
> ✓ All former **(verify)** citations were checked against Crossref / publisher pages on Sun Nov 15 (✓ = verified; DOIs added). One open item: the page of the Hassler 2014 dose-rate figure.

### Datasets (NASA and partners)

- **HiRISE imagery + DTMs** (4 water-ice sites): NASA/JPL/University of Arizona. DTMs DTEEC_033225_2250_033146_2250_A01, DTEEC_034082_2260_033014_2260_A01, DTEEC_037352_2245_037418_2245_A01, DTEEC_054060_2265_054126_2265_A01 + RED orthos; sun geometry for rock shadows from each observation's PDS RDR label (e.g. https://hirise.lpl.arizona.edu/PDS/RDR/ESP/ORB_033200_033299/ESP_033225_2250/ESP_033225_2250_RED.LBL). https://www.uahirise.org/dtm/ — found via PDS Geosciences Node ODE REST API (https://oderest.rsl.wustl.edu/). Download URLs: `data/raw/README.md`.
- **THEMIS Thermal Inertia Mosaic, Quantitative, 100 m/px**, tiles 30N120E + 30N180E: USGS Astrogeology / Arizona State University (NASA Mars Odyssey THEMIS). https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30n180e_100mpp (and …_30n120e_100mpp). Credit: NASA/JPL-Caltech/Arizona State University/USGS.
- **MOLA** global elevation (Mars Global Surveyor): NASA/GSFC; and **MOLA/HRSC blended DEM 200 m** (NASA/ESA/DLR/FU Berlin, USGS Astrogeology). Used by teammates' terrain + MOLA pads around sites, and by Role B's **200 m regional slope** for the drive corridor (`pipelines/stable/regional-slope.ts`; file `https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif`).
- **Viking global colour mosaic** (teammates' basemap): USGS/NASA Ames colorized Viking MDIM 2.1. Credit: NASA/Viking; USGS; NASA Ames.
- **CTX global mosaic** (imagery around the habitat, ~5 m): Caltech Murray Lab, served by Esri (https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer). Credit: NASA/JPL/MSSS/The Murray Lab. Murray Lab "grants free use of the V01 version of the mosaic for all purposes" and asks users to cite Dickson et al. 2024 (https://murray-lab.caltech.edu/CTX/). Note: the Esri service labels itself beta01.
- **NASA Ames Mars GCM 2018 global dust storm simulation** (dust playback): https://data.nas.nasa.gov/legacygcm/ — Bertrand et al. 2020.
- **SWIM — Subsurface Water Ice Mapping** (swim.psi.edu down long-term; use the papers + Odyssey neutron-spectrometer maps instead, see §7): Planetary Science Institute / NASA. Illustration: NASA PIA26045 (slides only).
- **Curiosity RAD** Level 2 dose rates, Gale crater: NASA Space Physics Data Facility (SPDF), CDAWeb dataset `MSL_RAD_OBS-L2` (https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/). Acknowledgement: RAD PI D. Hassler, Southwest Research Institute. Instrument: Hassler et al. 2012.
- **Perseverance MEDA** (weather, sol 816) and **MOXIE** (oxygen production), Jezero: NASA PDS Atmospheres Node, bundles `mars2020_meda` and `moxie_bundle` (https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/). Provenance per file: `data/telemetry/sources.json`. (REMS is no longer used.)
- **Geologic Map of Mars** (USGS SIM 3292, 1:20M; geologic units along the drive corridor, `pnpm pipe:geology`): USGS Astrogeology / NASA — Tanaka et al. 2014. https://pubs.usgs.gov/sim/3292/
- **NASA DONKI** space-weather API: https://kauai.ccmc.gsfc.nasa.gov/DONKI/ — the app calls CCMC's DONKI API directly (`https://ccmc.gsfc.nasa.gov/DONKI-API/get/{FLR,SEP,WSAEnlilSimulations}`, no key; `/api/space-weather`, cached 15 min), because api.nasa.gov's flare proxy returned 404 on Sun Nov 15.
- **Mars Climate Database** (if used): LMD/CNES/ESA — Forget et al. 1999.

### Papers

- Allison, M. & McEwen, M. (2000). A post-Pathfinder evaluation of areocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies. _Planetary and Space Science_ 48(2–3), 215–235. doi:10.1016/S0032-0633(99)00092-6 (Mars24 clock) ✓
- Archinal, B. A. et al. (2018). Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015. _Celestial Mechanics and Dynamical Astronomy_ 130(3), 22. doi:10.1007/s10569-017-9805-5 (Mars sphere R = 3,396,190 m — this is the IAU **equatorial** radius; the mean radius is 3,389.5 km. Say "equatorial", not "mean", on slides) ✓
- Arvidson, R. E. et al. (2010). Spirit Mars Rover Mission: Overview and selected results from the northern Home Plate Winter Haven to the side of Scamander crater. _JGR_ 115(E7), E00F03. doi:10.1029/2010JE003633 (Spirit embedded at "Troy" — soft-ground pitch line) ✓
- Bertrand, T., Wilson, R. J., Kahre, M. A. et al. (2020). Simulation of the 2018 Global Dust Storm on Mars Using the NASA Ames Mars GCM: A Multitracer Approach. _JGR: Planets_ 125(7), e2019JE006122. doi:10.1029/2019JE006122 (dust playback) ✓
- Bramson, A. M. et al. (2015). Widespread excess ice in Arcadia Planitia, Mars. _Geophysical Research Letters_ 42, 6566–6574. (terraced craters → buried ice)
- Christensen, P. R. et al. (2004). The Thermal Emission Imaging System (THEMIS) for the Mars 2001 Odyssey Mission. _Space Science Reviews_ 110, 85–130.
- Dickson, J. L., Ehlmann, B. L., Kerber, L. & Fassett, C. I. (2024). The Global Context Camera (CTX) Mosaic of Mars: A Product of Information-Preserving Image Data Processing. _Earth and Space Science_ 11(7), e2024EA003555. doi:10.1029/2024EA003555 ✓
- Fergason, R. L., Christensen, P. R. & Kieffer, H. H. (2006). High-resolution thermal inertia derived from THEMIS: thermal model and applications. _JGR_ 111, E12004. doi:10.1029/2006JE002735
- Forget, F. et al. (1999). Improved general circulation models of the Martian atmosphere from the surface to above 80 km. _JGR_ 104(E10), 24155–24175. doi:10.1029/1999JE001025 (MCD; also cite the MCD version if used) ✓
- Golombek, M. & Rapp, D. (1997). Size-frequency distributions of rocks on Mars and Earth analog sites: implications for future landed missions. _JGR: Planets_ 102(E2), 4117–4129. doi:10.1029/96JE03319 (rock-abundance model F(D) = k·exp(−q·D), q = 1.79 + 0.152/k) ✓ (bibliography via Crossref; the paper itself is paywalled — the q formula is confirmed as quoted from it in Golombek et al. 2012, eq. 1–2)
- Golombek, M., Kipp, D., Warner, N. et al. (2017). Selection of the InSight landing site. _Space Science Reviews_ 211(1–4), 5–95. doi:10.1007/s11214-016-0321-9 (online Dec 2016; 35 authors) (rock abundance < 10 % lander limit; HiRISE rock counts unreliable below ~1.5 m) ✓ bibliography (the < 10 % figure was not re-read in the paywalled text; the ~1.5 m limit is confirmed in Golombek et al. 2012)
- Golombek, M. P., Huertas, A., Marlow, J. et al. (2008). Size-frequency distributions of rocks on the northern plains of Mars with special reference to Phoenix landing surfaces. _JGR: Planets_ 113(E3), E00A09. doi:10.1029/2007JE003065 (shadow-based rock counts on HiRISE, northern plains) ✓
- Golombek, M., Huertas, A., Kipp, D. & Calef, F. (2012). Detection and characterization of rocks and rock size-frequency distributions at the final four Mars Science Laboratory landing sites. _Mars_ 7, 1–22. doi:10.1555/mars.2012.0001 (automated vs manual counts; open access, http://marsjournal.org/contents/2012/0001/) ✓ against the PDF. Note: this DOI is printed on the paper but **does not resolve** at doi.org and is not in Crossref — link the journal URL on slides. The journal's web page drops "final four" from the title and lists a fifth author (C. Molfese); the PDF (cited here) has four.
- Guo, J. et al. (2015). Modeling the variations of dose rate measured by RAD during the first MSL Martian year: 2012–2014. _ApJ_ 810(1), 24. doi:10.1088/0004-637X/810/1/24 (quiet rate varies with air pressure and solar cycle; it gives **no** average dose rate) ✓ title corrected
- Hanley, J. A. & Lippman-Hand, A. (1983). If nothing goes wrong, is everything all right? Interpreting zero numerators. _JAMA_ 249(13), 1743–1745. (rule of three — boulder review bound)
- Hassler, D. M. et al. (2012). The Radiation Assessment Detector (RAD) Investigation. _Space Science Reviews_ 170(1–4), 503–558. doi:10.1007/s11214-012-9913-1 (RAD instrument) ✓
- Hassler, D. M. et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. _Science_ 343(6169), 1244797. doi:10.1126/science.1244797 (quiet-time baseline ≈ 0.21 ± 0.04 mGy/day ≈ 9 µGy/h — figure is in the paper body, not the abstract; secondary summaries agree on 0.210 ± 0.040 mGy/day averaged over ~300 sols near solar maximum (range ~0.18–0.225), but the full text is paywalled and the page/section was **not** pinned (Sun Nov 15 night) — **check the page before quoting the number on a slide**. Sun Nov 15 evening search: the paper describes 0.210 ± 0.040 mGy/day as the **average total GCR dose rate** over ~300 days near solar maximum — not a "quiet-time" value, so say "average" on slides; Guo et al. 2015 is the source for quiet-time variation. A free copy appears to be at the Smithsonian repository (https://repository.si.edu/server/api/core/bitstreams/da15cc33-ad74-4984-871a-5b82a99138e6/content) — not opened yet, page still not pinned)
- Kirk, R. L. et al. (2008). Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images. _JGR_ 113, E00A24. (DTM vertical precision → roughness noise floor)
- Lemmon, M. T. et al. (2022). Dust, sand, and winds within an active Martian storm in Jezero crater. _GRL_ 49(17), e2022GL100126. doi:10.1029/2022GL100126 (one regional storm, 5–11 Jan 2022: peak optical depth ≈ 2. The paper sets no thresholds — our dust cut-offs are team choices informed by it) ✓
- McEwen, A. S. et al. (2007). Mars Reconnaissance Orbiter's High Resolution Imaging Science Experiment (HiRISE). _JGR_ 112, E05S02.
- Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of Mars. _Nature Astronomy_ 5, 230–236. (SWIM)
- Mustard, J. F., Cooper, C. D. & Rifkin, M. K. (2001). Evidence for recent climate change on Mars from the identification of youthful near-surface ground ice. _Nature_ 412(6845), 411–414. doi:10.1038/35086515 (ice-rich mantle with pitted texture — why the sites are rock-poor) ✓
- NASA NSSDC, "The Apollo Lunar Roving Vehicle", https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html (LRV ground clearance 36 cm loaded — rover obstacle analogue)

### Staging-point and rover-range sources (§9)

- NASA (2020). _Exploration EVA System Concept of Operations_, EVA-EXP-0042 Rev B. https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf — §4.2.1.3.1 (walk-back ranges: ~2 km/h, 2 km on foot, 10 km unpressurized rover, 12 km single pressurized rover, 100 km+ with two pressurized rovers; rescue rover within an 8-hour drive), §7.3.2 (rovers within 100 km of the ascent vehicle; 8 h + 1 h contingency consumables ≈ 1 h walk from the rover), §9.6 ("stay within a one hour walk back to their rover"), §9.2 (rescue to safe haven within 60 min). Lunar values; Mars ranges are "forward work".
- Apollo Lunar Surface Journal (NASA History). Apollo 17 Station 7: LRV parked ~25 m ENE of the boulder (https://www.nasa.gov/wp-content/uploads/static/history/alsj/a17/images17.html); Apollo 15: rover 26 m from the D-16 pan spot near Central Station; Final LRV parking places (https://www.nasa.gov/wp-content/uploads/static/history/alsj/alsj-LRVFinalParking.html); Apollo 15 Station 9, TV-coverage parking remark (https://nasa.gov/wp-content/uploads/static/history/alsj/a15/a15.sta9.html).
- NASA (2023). _Sim Series 2: Rover Teleoperations to Support EVA_ (incl. D-RATS 22 findings). NTRS 20230016699. https://ntrs.nasa.gov/api/citations/20230016699/downloads/Sim_Series_2_Rover_Teleops_to_Support_EVA_Rev.pdf (parking chosen per spot for comm relay, lighting, camera, solar; proximity vs distance trade-off; rover 500 m from the lander for engine debris)
- NASA OCHMO-TB-023, _Extraterrestrial Surface Transport Vehicles (Rovers)_. https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-023-extraterrestrial-surface-transport-vehicles-rovers.pdf (Apollo 7.6 km "Walkback Limit")
- Desert RATS 2011: Human and robotic exploration of near-Earth asteroids (Abercromby et al.). https://www.researchgate.net/publication/256935260 — **(verify)** source of the "EVA within 25 m of the SEV" figure; only seen in a search summary. Sun Nov 15 evening: NTRS papers on the 2011 test (e.g. 20120003306, 20130000595) and ESA's write-up did not mention 25 m → cite the Apollo figures instead and drop Desert RATS unless someone finds the page.
- Abercromby, A. F. J. et al. (2012). _Desert Research and Technology Studies (DRATS) 2009_. NASA/TP-2012-217360 (suit-port pressurized rover field test). https://www.lpi.usra.edu/lunar/analogs/blackpoint/pdf/AbercrombyEtAl_DRATS2009_TP-2012-217360.pdf
- Putzig, N. E. & Mellon, M. T. (2007). Apparent thermal inertia and the surface heterogeneity of Mars. _Icarus_ 191, 68–94. (thermal inertia surface classes)
- Seidelmann, P. K. et al. (2002). Report of the IAU/IAG Working Group on Cartographic Coordinates and Rotational Elements of the Planets and Satellites: 2000. _Celestial Mechanics and Dynamical Astronomy_ 82(1), 83–111. doi:10.1023/A:1013939327465 (origin of the "Mars 2000" name — cite only if a slide says "Mars 2000"; its radius table was not checked)
- Smith, D. E. et al. (2001). Mars Orbiter Laser Altimeter: experiment summary after the first year of global mapping of Mars. _JGR_ 106(E10), 23689–23722.
- Tanaka, K. L., Skinner, J. A., Jr., Dohm, J. M., Irwin, R. P., III, Kolb, E. J., Fortezzo, C. M., Platz, T., Michael, G. G. & Hare, T. M. (2014). Geologic Map of Mars. _U.S. Geological Survey Scientific Investigations Map_ 3292, scale 1:20,000,000. doi:10.3133/sim3292 ✓ (Crossref) (geologic units along the drive corridor)
- Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. _JASA_ 22(158), 209–212. (Wilson bound — boulder review)

### Flight-rule sources (agreed by the team, shared role A — full wording in `config.yaml`)

NASA xEVA ConOps (NTRS 20200001071) · NASA EVA-EXP-0042 Rev B · ISS suit timeline (NTRS 20140009556) · NASA field test (NTRS 20080014286) · NASA radiation action levels (NTRS 20230004380) · NASA OCHMO-TB-020 · Posner et al. (NTRS 20250001542).

### Software

GDAL/OGR (gdalwarp, gdaldem, gdal2tiles) · PROJ · MapLibre GL JS (replaced Mapbox GL JS v3) · three.js · Turf.js · geotiff.js · DuckDB · React · vinext · Vite · Hono · Drizzle ORM · Zod · Tailwind CSS · Base UI · lucide-react · vosk-browser + Vosk speech model (wake word) · Cloudflare Workers, D1 and R2. Licences: all npm production dependencies are MIT, ISC, BSD, Apache-2.0, MPL-2.0, BlueOak-1.0.0 or CC-BY-4.0 (`pnpm licenses list --prod`); the project itself is MIT (`LICENSE`).

### Services and AI (disclose in the submission's AI statement)

- **OpenRouter** — language model **openai/gpt-4.1-mini** behind the LARA copilot (set by `DIAGNOSTICS_MODEL` on the server). Explains results; verdicts come from `lib/flight-rules`, never from the model.
- **ElevenLabs** — LARA's voice. **The voice is AI-generated speech**: acknowledge it wherever it is heard (demo video, project page).
- **Anthropic Claude (Claude Code)** — AI coding agent used to write and review code, pipelines and docs; commits carry a `Co-Authored-By` trailer where recorded.

### Fonts

Atkinson Hyperlegible Next · IBM Plex Sans Condensed · JetBrains Mono (all SIL Open Font License, via Google Fonts).
