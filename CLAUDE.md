# Project Context: LARA — Mars EVA Planning Tool (NASA Space Apps Challenge 2026)

_Last updated: Sat Nov 14, 2026 13:35 (hackathon day 1). Team of 5. Hackathon runs Nov 14–15, 2026._

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
  1. **Stable data** (updated ~weekly): terrain/DEM, slope, geology/hazard maps, shadows (sun position + terrain — predictable, so it's *stable*, not live), ice.
  2. **Live data** (sensors): radiation/space weather, dust, weather.
- **Level 2 — Short-term (same-day) prediction:** forecast is computed with **code/threshold rules with a stated confidence level, not a model**. **if RAG is used at all, it's only to explain verdicts** (retrieving flight rules, rover reports), citing which rule fired.

## 3. Team roles
> **Naming note:** Roles **A–D and M** in this table are *human team members*. They are unrelated to the **Claude advisor personas** in §9, which reuse the letters A/B/C. When a request says "Role A/B/C" in the context of asking Claude for advice, it means the §9 personas; when it refers to team ownership of work, it means this table. Jess = team role **B** (stable data).
| Role | Owner | Scope |
|---|---|---|
| **A — Flight rules, GO/NO-GO, integration** | TBD | Owns the flight rules/assumptions sheet; every GO/NO-GO cites it. Owns integration: common time base, file names, CRS, `config.yaml`, `schemas/`, `validate.py`. The GO/NO-GO logic and flight rules are the critical decisions NASA would want from the data. |
| **B — Stable data (geospatial/mapping)** | **Jess** | Terrain (DEM), slope, roughness, hazard masks, shadows (sun + terrain), geology. Reproject → clip → snap to common grid → clean → derive → export. |
| **C — Routing & mission planning** | TBD | Picks science stops (sample/data collection sites); cost surface → least-cost route; walk time; **walk-back margin**. Builds on B and D. Uses Apollo lunar walking data with labeled assumptions. |
| **D — Live data + forecast (space weather/radiation console)** | TBD | Replays archived live data as a "live" feed; same-day forecast as threshold rules with confidence; RAG explanation (stretch/might drop). |
| ⭐ **M — UI + story/pitch** | **M** | Map UI, layer panel, timeline, verdict banner, demo script, video, slides. |

### Notes from expert review (Claude role-playing a NASA EVA/flight-ops professional — sanity check, not official NASA guidance)
- Split mirrors real NASA functions: ground data systems (A), geospatial team (B), traverse planning (C), space weather/radiation console — SRAG at JSC (D), crew displays (M).
- **Verdict banner should read like a flight rule:** status · limiting constraint · margin · time to shelter.
- **Walk-back margin = remaining suit consumables (O₂, CO₂ scrubbing, power, cooling) − return time at a degraded pace** — not just distance. Apollo planned walk-back assuming rover failure.
- **Apollo walking data is lunar (1/6 g, different suit). Mars gravity is ~0.38 g**, so metabolic cost and pace differ — label as an assumption.
- Mars crews operate autonomously (4–24 min one-way light delay). Line-of-sight/comm = one pitch sentence or a simple viewshed back to habitat, not a full category.
- Data caveats: Curiosity's RAD (radiation) + REMS (weather) are co-located at **Gale crater**. REMS does **not** measure dust opacity directly (that comes from imaging). NASA DONKI space-weather alerts are Earth-centric — must reason about Mars's position relative to each event.

## 4. Key decisions log
| Question | Decision |
|---|---|
| Data output formats | **Stable layers:** Cloud-Optimized GeoTIFF rasters on a common grid; GeoJSON for stops/features. **Live feed:** JSON, 1 snapshot per update, e.g. `{timestamp, radiation_dose_rate, solar_alert_level, dust_opacity, temp, wind, sun_elevation}`. **Route output:** GeoJSON line + `{distance_km, est_time_min, max_slope, verdict: GO/CAUTION/NO_GO, limiting_factor, reasons[]}`. **Forecast output:** `[{hour, dust, radiation, verdict}]` + `explanation`. |
| UI theme | *The Martian*-inspired (original design — no copyrighted assets/logos) |
| Landing & base location | **Arcadia Planitia** (plains) — **final**. Chosen because it's a much more favorable base location (smooth terrain, good access to subsurface water ice, sunlight for power), **despite sparse surface data** (no rover has operated there). Landing and base in the same general area, with distance between them for landing safety. |
| Live data for Arcadia | Use Gale (Curiosity: REMS weather, RAD radiation) and/or Jezero (Perseverance: MEDA) data as a **clearly labeled proxy feed**, optionally adjusted with Mars Climate Database values for Arcadia. Orbital imagery (HiRISE/CTX) replaces rover imagery. |
| Product name | **LARA** (only name — the assessment engine is part of LARA, not a separate "ARES") |
| Science problem | **OPEN** — do we need one, or is it just routing/forecasting? (Expert view: yes — without science stops, the route only avoids hazards and has no purpose. Plan stops → route → timeline → walk-back check.) |
| Flight rules / assumptions | Slope limit: **20°** (from Artemis lunar planning — label as assumption for Mars). Suit supply budget: **TBD**. Radiation thresholds: **TBD**. Walk-back rule: **TBD**. |

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
  stable/     # dem.py, slope.py, hazards.py, geology.py, shadows.py
  live/       # rems.py, rad.py, donki.py, replay.py
schemas/      # Pydantic models of the data formats + validate.py
config.yaml   # AOI, CRS, resolution, thresholds — no hardcoding
```
- **Stable pipeline:** download → reproject to a **local metric CRS on the Mars 2000 sphere** (e.g. equirectangular centered on AOI) → clip to AOI + ~200 m buffer → snap all layers to the same grid → clean (explicit no-data, fill small DEM holes, meters) → derive slope/roughness/hazards/shadows → export COG + GeoJSON. Tools: GDAL/rasterio, geopandas, numpy/richdem.
- **Live pipeline:** ingest to tidy long table → **UTC master clock + sol + LMST** (Mars24-based library) → convert units, flag outliers, fill short gaps with `quality_flag` → resample (e.g. 15 min) → Parquet `timestamp_utc, sol, lmst, variable, value, unit, source, quality_flag` → `replay.py` emits live-snapshot JSON. Tools: pandas/polars, DuckDB, requests.
- **Handoff rule:** run `validate.py` before handing off; passing = ready.
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
> These A/B/C are perspectives Claude advises Jess from. They are not the team roles A–D/M in §3. To avoid confusion, refer to them as **Advisor A (geospatial), Advisor B (data scientist / data pipelines & I/O), Advisor C (NASA mission-planning veteran)**.

Respond from these perspectives/expertise: A: You are a geospatial professional (10+ years of experience with GIS, working with agentic workflows and constantly keeping your skills up-to-date since 2024) whom I've hired to complete simpler tasks I want to offload, and can advise me on the best workflows to complete these tasks if I need to be the one doing them. B. A data scientist with 15 years of experience and great enthusiasm about automating data pipelines and aggregating data to extract value, especially in the age of Gen AI. Most of your expertise has been in creating CLEAN data pipelines. 3 years ago, you pivoted your career to education and have been tutoring adults who want to make the career transition to data science, so you know how to tailor individual education plans. C. NASA veteran who's been chief engineer in mission planning for various Apollo and Artemis missions, and has experience from the Moon landing in 1969.