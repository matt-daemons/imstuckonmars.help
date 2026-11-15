# Project Context: LARA — Mars EVA Planning Tool (NASA Space Apps Challenge 2026)

_Last updated: Sun Nov 15, 2026 — mobility reopened: drive **and** walk (with Role C); M porting Mapbox → MapLibre (hackathon day 2). Team of 5. Hackathon runs Nov 14–15, 2026._

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
> | **C — Routing & mission planning** | TBD | Picks science stops (sample/data collection sites); cost surface → least-cost **rover** route base → site; drive time; **battery / return-to-base margin**. Builds on B and D. Rover energy figures are labelled assumptions (or simulated). |
> | **D — Live data + forecast (space weather/radiation console)** | TBD | Replays archived live data as a "live" feed; same-day forecast as threshold rules with confidence; RAG explanation (stretch/might drop). |
> | ⭐ **M — UI + story/pitch** | **M** | Map UI, layer panel, timeline, verdict banner, demo script, video, slides. |

### Notes from expert review (sanity check, not official NASA guidance)

- Split mirrors real NASA functions: ground data systems (A), geospatial team (B), traverse planning (C), space weather/radiation console — SRAG at JSC (D), crew displays (M).
- **Verdict banner should read like a flight rule:** status · limiting constraint · margin · time to shelter.
- **Return margin = remaining rover battery (and crew consumables) − energy/time to drive home at a degraded pace** — not just distance. Apollo limited rover range by walk-back distance assuming rover failure; at 93–468 km that's impossible, so state the rover-failure assumption (pressurized rover / rescue) explicitly.
- _(Superseded by the rover-only decision, kept for context:)_ Apollo walking data is lunar (1/6 g, different suit); Mars gravity is ~0.38 g, so any walking/driving figures from the Moon are assumptions.
- Mars crews operate autonomously (4–24 min one-way light delay). Line-of-sight/comm = one pitch sentence or a simple viewshed back to habitat, not a full category.
- Data caveats: Curiosity's RAD (radiation) + REMS (weather) are co-located at **Gale crater**. REMS does **not** measure dust opacity directly (that comes from imaging). NASA DONKI space-weather alerts are Earth-centric — must reason about Mars's position relative to each event.

## 4. Key decisions log

| Question                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data output formats     | **Stable layers:** Cloud-Optimized GeoTIFF rasters on a common grid; GeoJSON for stops/features. **Live feed:** JSON, 1 snapshot per update, e.g. `{timestamp, radiation_dose_rate, solar_alert_level, dust_opacity, temp, wind, sun_elevation}`. **Route output:** GeoJSON line + `{distance_km, est_time_min, max_slope, verdict: GO/CAUTION/NO_GO, limiting_factor, reasons[]}`. **Forecast output:** `[{hour, dust, radiation, verdict}]` + `explanation`. |
| UI theme                | _The Martian_-inspired (original design — no copyrighted assets/logos)                                                                                                                                                                                                                                                                                                                                                                                         |
| Landing & base location | **Arcadia Planitia** (plains) — **final**. Chosen because it's a much more favorable base location (smooth terrain, good access to subsurface water ice, sunlight for power), **despite sparse surface data** (no rover has operated there). Landing and base in the same general area, with distance between them for landing safety.                                                                                                                         |
| Live data for Arcadia   | Use Gale (Curiosity: REMS weather, RAD radiation) and/or Jezero (Perseverance: MEDA) data as a **clearly labeled proxy feed**, optionally adjusted with Mars Climate Database values for Arcadia. Orbital imagery (HiRISE/CTX) replaces rover imagery.                                                                                                                                                                                                         |
| Product name            | **LARA** (only name — the assessment engine is part of LARA, not a separate "ARES")                                                                                                                                                                                                                                                                                                                                                                            |
| Map library             | **⚠ Switching to MapLibre GL JS (M is porting, Sun Nov 15, due to an unexpected ruling).** Previously **Mapbox GL JS v3** (decided by Jess, Sat 16:45, after a side-by-side spike vs MapLibre). Why: 3D terrain + built-in fog/particle effects (dust storm) + native 3D model layer for the base. Costs: needs a public `pk.` token (free tier, billed per map load), proprietary licence. Same Earth-radius caveats as MapLibre.                             |
| Toolchain               | No jj; Nix optional; Node 24 + pnpm; TypeScript pipelines + GDAL CLI; Mapbox GL v3. (team, Sat Nov 14)                                                                                                                                                                                                                                                                                                                                                         |
| Data home               | Telemetry in **D1** (teammate's backend). Static map rasters/tiles in `public/data/`. (team, Sat Nov 14)                                                                                                                                                                                                                                                                                                                                                       |
| Mapbox account          | Owned by **M**; public token in `NEXT_PUBLIC_MAPBOX_TOKEN`. (team, Sat Nov 14)                                                                                                                                                                                                                                                                                                                                                                                 |

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
| Science problem | **Water-ice procurement (ISRU)** — decided by Jess, Sat ~20:00. POIs = terraced craters (evidence of thick buried ice in Arcadia, Bramson et al. 2015, GRL) that we route to for mission planning, weighing terrain, weather and rover battery. |
| Mobility (traverse mode) | **Updated Sun Nov 15 (Jess + Role C): support BOTH driving and walking (EVA).** Still being confirmed: (a) 2-leg journeys (drive + walk) vs (b) one mode per journey, with walking/EVA allowed only for short distances. No new POI is being added — the 4 sites stay. _Superseded earlier decision:_ **Rover drives only — no walking portion** (team meeting, Sun Nov 15). Why: POIs are 93–468 km from the base. Rover + walk (2 legs) was too complex (different risks and datasets per leg). Walking-only would mean moving the base next to one POI (proof of concept only). Driving wins because (1) **battery running low on bad terrain** is a real risk, which gives the slope/terrain model its value; (2) we can use **all 4 sites**, not a POC; (3) battery data is easy to add or simulate (label it simulated). Pitch line for spacesuit mobility: crew stay in the pressurized rover; suited sampling at the stop is out of scope. |
| Flight rules / assumptions | **Sourced values by team role A** (`config.yaml` ↔ `lib/flight-rules/rules.ts`, kept in sync by `lib/flight-rules/config.test.ts`): slope 20° (NASA lunar suit limit), suit 8 h + 30 min reserve, radiation 18 / 90 µGy/h (ASSUMPTION from Curiosity RAD quiet rate), walk-back ≤ 2 km. NASA has no published Mars limits — Moon/ISS values are labelled assumptions. **⚠ With drive + walk, keep the suit/walk rules (20° suit slope, 8 h suit, walk-back 2 km) for EVA legs and ADD rover rules** (rover slope limit, range/battery + reserve, drive hours per sol) — owner A. |

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

## 7. Open questions / known inconsistencies to resolve

1. ~~**Science objective**~~ ✅ water-ice procurement (ISRU) — see §4.
2. **HiRISE DTM coverage in Arcadia Planitia:** check which DTMs exist, then pick an AOI that fits.
3. **Proxy-data framing:** decide exactly how the UI labels Gale/Jezero data as a proxy for Arcadia (and whether to adjust with Mars Climate Database values).
4. **Fill in flight rules:** suit/walk rules stay (EVA legs) + **rover rules** (slope limit, range/battery reserve, drive hours per sol); radiation thresholds done.
5. **Journey structure (Role C + team):** 2-leg drive+walk journeys, or one mode per journey with EVA only for short distances? Define "short" (walk-back ≤ 2 km rule is the candidate).
6. **MapLibre port (M):** Mapbox-only features we used (3D terrain fog, `three` model layer, attribution control, `NEXT_PUBLIC_MAPBOX_TOKEN`) need MapLibre equivalents; site tile URLs/XYZ should carry over unchanged.
7. **Role A owner** and owners for C and D: confirm names.

## 8. Working agreements

- Don't change the data format without telling everyone; update the sample files the same hour.
- Build the demo path first: one location, one route, one live event, one verdict.
- Every layer shows its NASA source (supports Validity criterion).
- Hourly 5-minute check-in: done / blocked.
- Freeze features ~6 hours before the deadline; then integrate, test, record.

## 9. Claude roles (advisor personas — NOT team roles)

> These 1/2/3 are perspectives Claude advises Jess from. They are not the team roles A–D/M in §3. To avoid confusion, refer to them as **Advisor 1 (geospatial), Advisor 2 (data scientist / data pipelines & I/O), Advisor 3 (space mission-planning veteran)**.

Respond from these perspectives/expertise: A: You are a geospatial professional (10+ years of experience with GIS, working with agentic workflows and constantly keeping your skills up-to-date since 2024) whom I've hired to complete simpler tasks I want to offload, and can advise me on the best workflows to complete these tasks if I need to be the one doing them. B. A data scientist with 15 years of experience and great enthusiasm about automating data pipelines and aggregating data to extract value, especially in the age of Gen AI. Most of your expertise has been in creating CLEAN data pipelines. 3 years ago, you pivoted your career to education and have been tutoring adults who want to make the career transition to data science, so you know how to tailor individual education plans. C. NASA veteran who's been chief engineer in mission planning for various Apollo and Artemis missions, and has experience from the Moon landing in 1969.

## 10. References (cite every external source — required for submission)

> Keep this list in sync whenever a dataset, paper or rule source is added. Each map layer also shows its credit in the UI.
> ⚠ Citation details marked **(verify)** were written from memory. Check the DOI/pages before they go on slides.

### Datasets (NASA and partners)

- **HiRISE imagery + DTMs** (4 water-ice sites): NASA/JPL/University of Arizona. DTMs DTEEC_033225_2250_033146_2250_A01, DTEEC_034082_2260_033014_2260_A01, DTEEC_037352_2245_037418_2245_A01, DTEEC_054060_2265_054126_2265_A01 + RED orthos. https://www.uahirise.org/dtm/ — found via PDS Geosciences Node ODE REST API (https://oderest.rsl.wustl.edu/). Download URLs: `data/raw/README.md`.
- **THEMIS Thermal Inertia Mosaic, Quantitative, 100 m/px**, tiles 30N120E + 30N180E: USGS Astrogeology / Arizona State University (NASA Mars Odyssey THEMIS). https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30n180e_100mpp (and …_30n120e_100mpp). Credit: NASA/JPL-Caltech/Arizona State University/USGS.
- **MOLA** global elevation (Mars Global Surveyor): NASA/GSFC; and **MOLA/HRSC blended DEM 200 m** (NASA/ESA/DLR/FU Berlin, USGS Astrogeology). Used by teammates' terrain + MOLA pads around sites.
- **Viking global colour mosaic** (teammates' basemap): NASA/JPL/USGS.
- **SWIM — Subsurface Water Ice Mapping** (planned, swim.psi.edu down): Planetary Science Institute / NASA. Illustration: NASA PIA26045 (slides only).
- **Curiosity RAD** (radiation) and **REMS** (weather), Gale crater; **Perseverance MEDA** (weather) and **MOXIE**, Jezero: NASA PDS (teammates' telemetry — owners add exact PDS bundle IDs).
- **NASA DONKI** space-weather API: https://kauai.ccmc.gsfc.nasa.gov/DONKI/ (via api.nasa.gov).
- **Mars Climate Database** (if used): LMD/CNES/ESA — Forget et al. 1999.

### Papers

- Allison, M. & McEwen, M. (2000). A post-Pathfinder evaluation of areocentric solar coordinates… _Planetary and Space Science_ 48, 215–235. (Mars24 clock) **(verify)**
- Archinal, B. A. et al. (2018). Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015. _Celestial Mechanics and Dynamical Astronomy_ 130:22. (Mars 2000 sphere, R = 3,396,190 m) **(verify)**
- Arvidson, R. E. et al. (2010). Spirit Mars Rover Mission: overview and selected results from the northern Home Plate Winter Haven to the side of Scamander crater. _JGR_ 115, E00F03. (Spirit embedded at "Troy" — soft-ground pitch line) **(verify)**
- Bramson, A. M. et al. (2015). Widespread excess ice in Arcadia Planitia, Mars. _Geophysical Research Letters_ 42, 6566–6574. (terraced craters → buried ice)
- Christensen, P. R. et al. (2004). The Thermal Emission Imaging System (THEMIS) for the Mars 2001 Odyssey Mission. _Space Science Reviews_ 110, 85–130.
- Fergason, R. L., Christensen, P. R. & Kieffer, H. H. (2006). High-resolution thermal inertia derived from THEMIS: thermal model and applications. _JGR_ 111, E12004. doi:10.1029/2006JE002735
- Forget, F. et al. (1999). Improved general circulation models of the Martian atmosphere from the surface to above 80 km. _JGR_ 104(E10), 24155–24175. (MCD) **(verify)**
- Guo, J. et al. (2015). Variations of dose rate observed by MSL/RAD in the first 300 sols on the surface of Mars. _ApJ_ 810, 24. (radiation threshold basis — via role A) **(verify)**
- Kirk, R. L. et al. (2008). Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images. _JGR_ 113, E00A24.
- Lemmon, M. T. et al. (2022). Dust, sand, and winds within an active Martian storm in Jezero crater. _GRL_ 49. (dust thresholds — via role A) **(verify)**
- McEwen, A. S. et al. (2007). Mars Reconnaissance Orbiter's High Resolution Imaging Science Experiment (HiRISE). _JGR_ 112, E05S02.
- Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of Mars. _Nature Astronomy_ 5, 230–236. (SWIM)
- Putzig, N. E. & Mellon, M. T. (2007). Apparent thermal inertia and the surface heterogeneity of Mars. _Icarus_ 191, 68–94. (thermal inertia surface classes)
- Smith, D. E. et al. (2001). Mars Orbiter Laser Altimeter: experiment summary after the first year of global mapping of Mars. _JGR_ 106(E10), 23689–23722.

### Flight-rule sources (owned by team role A — full wording in `config.yaml`)

NASA xEVA ConOps (NTRS 20200001071) · NASA EVA-EXP-0042 Rev B · ISS suit timeline (NTRS 20140009556) · NASA field test (NTRS 20080014286) · NASA radiation action levels (NTRS 20230004380) · NASA OCHMO-TB-020 · Posner et al. (NTRS 20250001542).

### Software

GDAL/OGR (gdalwarp, gdaldem, gdal2tiles) · PROJ · Mapbox GL JS v3 → MapLibre GL JS (porting) · three.js · Turf.js · geotiff.js · DuckDB.

# Project Handoff/Next Steps as of 14:32 on 14 November 2026

## ▶ Handoff — start here (Jess / team role B, as of Sun Nov 15, 2026)

**Where things stand**

- Role B work so far = **4 HiRISE water-ice sites** (science objective: water-ice procurement / ISRU) as POIs on the team's Mapbox globe map:
  0.45 m imagery, 1 m 3D terrain, slope + 20° hazard overlay, NASA/JPL/University of Arizona attribution. Details: Steps 2–3 and
  "Data quality & processing decisions" below.
- **Local `main` is ahead of GitHub (sites work) — push it.** CI's `scripts/models/models.test.mjs` fails on `origin/main` too (teammates' model
  byte-compare), not from our changes.
- **Hosting:** M uploads `data/map-assets/sites-v1/` (from `pnpm sites:package`) to R2 and **sets `SITE_DATA_ROOT`** in
  `lib/mars/map-data.ts` himself. ✅ **Done (Sun Nov 15):** M uploaded `sites-v1` to R2 and set `SITE_DATA_ROOT`.
- **Role C** has the brief (below) and agreed a **slope-only cost surface first**; slope COGs are in `sites-v1/slope/` (Int16, value/10 = °).
- **Mobility (Sun Nov 15, with Role C): driving AND walking** — see §4 "Mobility" (2-leg vs one-mode-per-journey still open). No new POI.
- **Map library: M is replacing Mapbox with MapLibre** (unexpected ruling). Re-check site layers (imagery/terrain/slope, attribution, terrain switching) after the port.

**Thermal inertia ✅ (Sun Nov 15):** `pnpm pipe:thermal-inertia` (`pipelines/stable/thermal-inertia.ts`, ~4 min) reads THEMIS quantitative TI
(100 m) over HTTP for 170–196°E, 43–48°N. Outputs: `data/processed/thermal-inertia/thermal-inertia.tif` (Int16 TI, nodata −9999, **lon 0..360 °E**
because the AOI crosses ±180; ~57 % of the box has THEMIS data, gaps are mosaic holes), overlay tiles `public/data/thermal-inertia/` z5–11
(both gitignored, ~70 MB; ✅ **uploaded to R2** — Jess, Sun Nov 15), committed summary `public/data/processed/thermal-inertia-sites.json`.
Classes (indicative, ±20 %): < 150 fine dust/loose fines · 150–400 sand/crusted soil · ≥ 400 firm/rock. Mean within 5 km:
**ESP_033225 94 (85 % fine dust)** · habitat 126 · ESP_034082 186 · ESP_037352 190 · **ESP_054060 367 (12 % firm/rock)**.
**Always present with the uncertainty:** the run prints and the JSON stores AOI coverage (**57.4 %** — say "~57 %", the rest is _no data_,
not safe ground), per-site `coverage_percent` (100 % within 5 km of every site), `mean_range` (±20 %) and `class_robust`. The class is
**not robust** for the habitat, ESP_034082 and ESP_054060 (±20 % crosses a break) — only ESP_033225 (dust) and ESP_037352 (sand) are firm calls.
JSON also carries `caveats[]` (incomplete coverage, ±20 %, top few cm only, 100 m pixels, not ground-truthed) for the UI/slides.
Pitch: nearest site = softest, dustiest ground (battery drain, dust on panels/suits); firmest ground is farthest away.
Not yet wired into the map (wait for M's MapLibre port) or into C's cost surface.

**Next step for Role B:** **SWIM** (still down, HTTP 523) → wire TI into map (show coverage + caveats) → geology. Roughness / rock abundance: **another agent is on it** (see "Future data layers").

**How to run (from repo root, Node 24 via fnm, GDAL via brew)**

- `pnpm dev` → http://localhost:5173 (needs `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`). **Restart it after running any tile pipeline.**
- Site pipeline: `pnpm pipe:sites [dtm]` → `pnpm pipe:slope <dtm>` → `pnpm sites:package`. Raw inputs (1.8 GB) in `data/raw/hirise/`
  (URLs in `data/raw/README.md`); intermediates in `data/interim/hirise/<dtm>/` (keep `dem.tif`, `ortho.tif`, `*.vrt`, `slope-deg.tif`,
  `mola-pad.tif`, `footprint.geojson`, `dtm-srs.wkt`; the rest is regenerable scratch).
- Checks before pushing: `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

**Key files (Role B)**

- Pipelines: `pipelines/stable/hirise-sites.ts`, `pipelines/stable/slope.ts`, `pipelines/lib/xyz.ts`, `pipelines/package-sites-release.ts`,
  `pipelines/sites-release.json`.
- Map: `components/map/scene.ts` (`addSites`, `setSlopeVisible`, terrain switching), `components/map/scene-panel.tsx` (site list, slope switch),
  `components/map/mars-map.tsx` (sites.geojson, labels, click-to-fly, attribution control), `lib/mars/terrain.ts` (`terrainSourceForView` + sites),
  `lib/mars/map-data.ts` (`SITE_DATA_ROOT`).
- Data: `public/data/processed/sites.geojson` (committed), `public/data/processed/manifest.json` (`sites` layer).

**Working preferences (Jess):** work directly on `main`, no feature branches; ask before pushing; explain jargon in plain language.

## Toolchain (team-agreed Sat Nov 14)

- **No jj.** Plain Git + GitHub. Small commits, message style `area(type): Summary`. Jess works **directly on `main`** (no feature branches).
  Every push to `main` runs CI (`.github/workflows/ci.yml`: frozen install → `fmt:check` → `lint` → `typecheck` → `test` → `build` → deploy).
- **Nix is optional.** Use the Nix dev shell if you have it; otherwise plain **Node.js 24 + pnpm via Corepack** (`corepack enable`) works fine.
  CI no longer uses Nix. Where `AGENTS.md` and this file disagree on tooling, this section wins.
- **Scripts:** `pnpm install` · `pnpm dev` · `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
  Pre-push check = `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (same as CI).
- **Pipelines: TypeScript** run with Node 24 (`node pipelines/…/x.ts`), shelling out to the **GDAL CLI** (`brew install gdal`) for raster work.
  Deps: `zod`, `yaml`, `geotiff`, `@turf/turf`, `@duckdb/node-api`, `execa`, `pngjs`. `pnpm pipe:check` verifies GDAL + the Mars 2000 sphere.
  Pipelines run locally, never in the Workers runtime.
- **Map: Mapbox GL JS v3** (+ `three` for 3D models). Token: `NEXT_PUBLIC_MAPBOX_TOKEN` (public `pk.` token, **owned by M**), inlined at build time.
  Local: put it in `.env.local` (gitignored) and restart `pnpm dev`. Deploy: the CI build step needs the same variable (M to add as a GitHub secret/var).

## Current state (as of Sun Nov 15, 2026)

- **Map (team):** Mapbox v3 **globe** view, Viking global colour, MOLA global/regional + MOLA/HRSC 200 m terrain near the habitat, served from
  **R2** (`tiles.imstuckonmars.help`, `lib/mars/map-data.ts`); terrain is display-shifted +10 km (`DISPLAY_ELEVATION_OFFSET_M`). Sourced flight
  rules, `/api/verdict`, RAD telemetry, Mars clock are in (teammates).
- **Water-ice sites (Jess, Step 2–3):** 4 HiRISE POIs + footprints (`public/data/processed/sites.geojson`), 0.45 m imagery, 1 m terrain and slope
  overlay per site, wired into the teammates' map (`addSites` in `components/map/scene.ts`, Scene panel site list + "Slope hazard" switch,
  attribution control credits **NASA/JPL/University of Arizona**). Site tiles are **local only** (gitignored) until hosted (2f).
- Local `main` is ahead of GitHub (sites integration, upload-file naming, Q75 compression) — **not pushed yet**.
- **CI:** `scripts/models/models.test.mjs` (teammates' 3D model byte-compare) **fails on clean `origin/main` too** — not from the sites work.
- **Habitat vs sites distance (⚠ open):** habitat (−176.05°E, 45.97°N) → ESP_033225 **93 km**, ESP_034082 **194 km**, ESP_037352 **424 km**,
  ESP_054060 **468 km** (great-circle, Mars 2000 sphere). No site is reachable on foot → **team decided rover drives only** (§4 "Mobility").
- **Gotchas:**
  - vinext dev server crashes ("Maximum call stack size exceeded", `als-registry.js`) when thousands of files change under `public/` (e.g. while
    `pnpm pipe:sites` / `pipe:slope` run, or during a broken rebase) → restart `pnpm dev`. The vite watch-ignore for `public/data/sites` doesn't prevent it.
  - A half-finished rebase leaves conflict markers in `package.json` → the app fails with `JSONError … key must be a string`. Finish/abort the rebase.
  - `mapbox-gl.css` forces `position: relative` on the container → size it with `h-full w-full`, not `absolute inset-0`.
  - Mapbox needs absolute tile/GeoJSON URLs (we prefix `location.origin`).
  - Display terrain tiles are **not** true heights (+10 km offset) — read elevations from the DTM / COGs.

## Architecture (summary)

TypeScript pipelines (Node + GDAL CLI) → static rasters/GeoJSON in `public/data/` ; telemetry → **D1** (teammate's backend, `/api/telemetry`, `/api/missions`).
Mapbox GL JS v3 in the vinext app reads `manifest.json`; Hono `/api/*` serves `/live`, `/route`, `/verdict`.
Each raster = COG (true values) + coloured PNG/WebP preview with 4 corners, or XYZ tiles for terrain. Mapbox measures with
Earth's radius (~1.88× Mars) — compute distances in pipeline/routing code, no built-in scale bar.

## Step-by-step plan (∥ = can run in parallel)

### Step 0 — decisions ✅ (team, Sat Nov 14)

- ~~0a. Toolchain + CI~~ ✅ No jj; Nix optional (pnpm works without it); TypeScript pipelines; **Mapbox instead of MapLibre**. CI is pnpm-based now.
- ~~0b. Data contracts~~ ✅ `LayerManifest` / `StableLayer` fields approved as proposed. Telemetry units = §4 "Telemetry units" table.
  Anything not in that table stays a **PLACEHOLDER** (labelled in `lib/mars/types.ts`): `sol`, `lmst`, `solar_alert_level`, `sun_elevation`.
  Longitude convention (store −180..180, display 0–360 °E) — not raised; current code does this.
- ~~0c. Schemas~~ ✅ **Someone else owns the schemas** — don't build `schemas/` here.
- ~~0d. Flight-rule values~~ ✅ **replaced by team role A with sourced values** (see §4) (earlier PLACEHOLDER defaults are gone).
- ~~0e. Data home~~ ✅ **Telemetry data lives in D1**; usage is fine. Static map rasters/tiles stay in `public/data/`.
- ~~0f. Mapbox account + token~~ ✅ **M owns the account**; public token shared with Jess, kept in `NEXT_PUBLIC_MAPBOX_TOKEN`.

### Step 1 — Skeleton + Mapbox ✅ DONE

- ~~1a–1g~~ ✅ install, build, tests, map verified in browser, pipeline skeleton (GDAL 3.13.3, `pnpm pipe:check`).
- ~~1h. Port to Mapbox v3~~ ✅ (Sat ~19:30) — see Current state. Needs `NEXT_PUBLIC_MAPBOX_TOKEN` locally and in the CI build.

### Step 2 — AOI → 4 HiRISE water-ice sites (team role B / Jess, with Advisor A) ✅

- ~~2a. Pick AOI~~ ✅ **All 4 shortlisted DTMs are POIs** (MVP: craters/ridges we route to for water-ice procurement). Found via ODE REST
  (160–215°E, 30–65°N → 59 HiRISE DTMs). The team **habitat stays at −176.05°E, 45.97°N** (teammates' HAB terrain); sites are POIs.
  | DTM                                                                                                                                                 | HiRISE obs      | POI (lon −180..180, lat)         | Type                                                                     | POI provenance                                         |
  | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
  | DTEEC_033225_2250_033146_2250_A01                                                                                                                   | ESP_033225_2250 | −176.33383, 44.41589 (183.666°E) | Possible terraced crater, ~130 m, 12 m deep                              | Picked by Claude from the ortho; **confirmed by Jess** |
  | DTEEC_034082_2260_033014_2260_A01                                                                                                                   | ESP_034082_2260 | −171.38243, 45.64829 (188.618°E) | Possible terraced bullseye crater, bowl ~28 m deep                       | Circled by Jess; DTM-refined (moved 35 m)              |
  | DTEEC_037352_2245_037418_2245_A01                                                                                                                   | ESP_037352_2245 | −166.14298, 44.39035 (193.857°E) | Terraced bullseye crater (confirmed), bowl ~41 m deep, flat surroundings | Circled by Jess; DTM-refined (moved 85 m)              |
  | DTEEC_054060_2265_054126_2265_A01                                                                                                                   | ESP_054060_2265 | 172.56388, 46.07022              | **Ridges** (not a crater) — worth exploring for ice                      | DTM centre                                             |
  | POI refinement: circle position → lon/lat via the ortho footprint extremes (±~50 m), then centroid of the lowest 30 % of relief within 250 m on the |
  | 1 m DTM (the crater bowl). Logged in `pipelines/stable/hirise-sites.ts` (`poi`, `poiNote`) and `sites.geojson` (`position_note`).                   |
- ~~2b. CRS per file~~ ✅ `data/raw/README.md` (HiRISE section).
- ~~2c. Data home~~ ✅ 0e.
- ~~2d. Manifest~~ ✅ `sites` vector layer added to the teammates' manifest; their AOI, base, stops and route kept.
- 2e. ✅ **Pipelines:** `pnpm pipe:sites [dtm]` (`pipelines/stable/hirise-sites.ts`, ~2 min/site; `REBUILD_IMAGERY=1` to re-cut imagery) then
  `pnpm pipe:slope <dtm>` (`pipelines/stable/slope.ts`, ~20 s/site). Shared tile helpers: `pipelines/lib/xyz.ts`. Raw inputs ~1.8 GB (gitignored).
  Outputs (all **gitignored**, local only until hosted): `public/data/sites/<dtm>/{imagery,terrain,slope}/`, `data/processed/sites/<dtm>/slope.tif` (COG),
  `data/interim/hirise/<dtm>/<HiRISE ID>_mapbox.tif` (upload file, named per site so Mapbox tilesets are distinguishable). Committed: `public/data/processed/sites.geojson` (POIs + footprints).
- 2f. **Hosting → M's R2 (M's call, Sun Nov 15; replaces the Mapbox-tileset plan).** `pnpm sites:package` gathers everything into
  `data/map-assets/sites-v1/` (722 MB, ~23.5k files, gitignored): `sites/<dtm>/{imagery,terrain,slope}/` tiles, `slope/<HiRISE ID>_slope.tif`
  routing COGs, `sites.geojson`, `catalog.json`. M uploads with `MAP_RELEASE_CONFIG=pipelines/sites-release.json pnpm maps:upload`
  (his uploader; immutable prefix `sites-v1` in bucket `ares-mars-data`). Then set `SITE_DATA_ROOT` in `lib/mars/map-data.ts` to
  `https://tiles.imstuckonmars.help/sites-v1` — until then the map reads local tiles. The `<HiRISE ID>_mapbox.tif` files are obsolete.
- 2h. **SWIM ice layer (Step 4a) — queued.** swim.psi.edu (SWIM4MIM products: combined ice-consistency GeoTIFF, 0–1 m / 1–5 m / >5 m,
  ~3 km/px, simple cylindrical 0–360°E, −60..60°N, nodata −30, values −1..+1) was **down (HTTP 523)** on Sun Nov 15; retry. Context: Morgan et al.
  2021 (Nature Astronomy) — Arcadia plains match the most criteria for accessible ice.
- 2g. OPEN (polish) HiRISE RED is greyscale; optional tint. z18 (0.22 m) possible at ~4× tiles.

### Step 3 — First real layers (team role B)

- 3a. ✅ **Slope + hazard classes for all 4 sites** — results in "Data quality & processing decisions" below. Overlay: yellow 10–15°, orange 15°–limit,
  red ≥ limit (`config.yaml` `slope_max_deg` = 20°, NASA lunar suit limit assumed for Mars); "Slope hazard" switch in the Scene panel. Hillshade: teammates' terrain stack.
- 3b. Check: eyeball HiRISE imagery vs terrain vs slope alignment in the browser (same lon/lat grid by construction; not yet visually confirmed).
- 3c. ✅ Sources: `sites` layer in the layer panel + compact Mapbox attribution control credits **NASA/JPL/University of Arizona** on every site source.

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

### Role C (routing) brief — data available now (Sun Nov 15)

- **POIs:** `public/data/processed/sites.geojson` — per site a `poi` point (crater bowl centre, DTM-refined; ridges site = DTM centre) and a
  `footprint` polygon; props `id` (DTM), `hirise_id`, `title`, `site_kind`, `bbox`, `terrain_bbox`, `position_note`, `url`, `attribution`.
- **Slope:** `data/processed/sites/<dtm>/slope.tif` (on R2: `sites-v1/slope/<HiRISE ID>_slope.tif`) — COG, **Int16 tenths of a degree**
  (value / 10 = degrees; scale metadata 0.1), lon/lat Mars 2000 sphere, ~1 m grid, nodata −9999
  (incl. a 10 m trimmed DTM edge). Computed on a local metre grid. % ≥ 20°: 0.1 / 1.8 / 0.2 / 0.7 %. Shared via R2 (`sites-v1`) or `pnpm pipe:slope`.
- **Elevation (true, m):** `data/interim/hirise/<dtm>/dem.tif` — 1 m DTM, lon/lat Mars 2000, nodata −32768. MOLA 463 m around it.
- **Hazard threshold + resources:** `config.yaml` / `lib/flight-rules/rules.ts` — currently suit/walk values (slope ≤ 20°, suit 8 h, 30 min reserve,
  walk-back ≤ 2 km) + radiation 18 / 90 µGy/h. **Rover rules pending from A** (rover-only decision).
- **Conventions:** lon −180..180 east-positive in files (ESP_054060 is at +172.56, the rest negative — **AOI crosses ±180**); distances with
  Mars radius 3,396,190 m, never Mapbox/Turf defaults (Earth); don't read heights from display tiles (+10 km).
- **Known limits:** DTMs cover ~6 × 6–13 km each; no rock abundance, roughness, soil strength or dust data yet; slope from 1 m DTM misses
  sub-metre rocks (visible only in the 0.25 m imagery).
- ~~Open question for C + A~~ **Decided: rover drives only.** Routing = regional base → site (MOLA/HRSC) + final approach on the 1 m slope COGs;
  cost = slope → battery energy (rover-only decision).

### Future data layers (horizon, not built yet)

- **SWIM ice consistency** (Step 4a, queued; swim.psi.edu down 523 on Sun Nov 15) — regional ~3 km/px evidence for buried ice.
- **THEMIS thermal inertia** — loose dust/sand vs firm/rocky ground (trafficability, route cost). **Higher priority now:** soft ground drains rover battery.
- **Dust-raising potential / dust cover** — e.g. TES dust cover index + thermal inertia + wind; feeds the dust-storm verdicts and suit/visor wear.
- **Geology** — USGS geologic map units around the sites (Role B scope).
- **Surface roughness / rock abundance** — from the 1 m DTM (roughness) and HiRISE boulder counts; rover trafficability beyond slope.
- **Illumination / shadows** — sun position (teammates' Mars clock) + DTM horizon → shadowed terrain and timing of EVAs.
- **CRISM** where covered (hydrated/ice-related minerals); **line-of-sight to habitat** (one-sentence comms story or simple viewshed).
- **Upgrades:** imagery to z18 (0.22 m, ~4× tiles); tinted HiRISE RED.

### Next steps (Jess, Sun Nov 15)

1. **Push** local `main` (4 sites commits) — CI will still fail on the teammates' model test until they fix it; tell them.
2. **M hosts site data on R2 instead of Mapbox** — send/upload `data/map-assets/sites-v1/`; ask M to confirm the public URL
   (`https://tiles.imstuckonmars.help/sites-v1/...`) → set `SITE_DATA_ROOT`. The `_mapbox.tif` files he received can be ignored.
3. ~~Ask the R2 owner~~ → M (same person, item 2).
4. ~~Raise the habitat↔site distance~~ ✅ **Decided: rover drives only** (§4 "Mobility"). Role B follow-up: regional slope (MOLA/HRSC) for base → site
   routing, and THEMIS thermal inertia moves up (soft ground = battery drain).
5. ~~Brief C~~ ✅ sent. **Agreed: slope-only cost surface first**; add hazard mask / roughness / thermal inertia later.
6. **SWIM** (4a): swim.psi.edu still down. NASA's "SWIM map shows subsurface water ice on Mars" (PIA26045) is a **PNG illustration**,
   not georeferenced data (and its ammos.nasa.gov/marswatermaps link 404s) → story/slide use only, not a map layer. Then THEMIS thermal inertia.
7. **3b visual check** in the browser: imagery vs relief vs slope alignment at each crater rim.
8. Before freeze: replace placeholder `stops.geojson` / `route.geojson` (teammates') with C's real routes; keep every layer's source visible.

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
