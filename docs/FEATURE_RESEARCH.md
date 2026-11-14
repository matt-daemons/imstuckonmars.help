# ARES: feature research and prioritization

Research date: 2026-11-14. Scope: recommendations only; no application features implemented.

## 1. Recommended product decision

**Deliver an evidence-backed Jezero sortie planner that answers: "Which scientifically useful destination can this modeled crew visit and return from, given the terrain and declared reserves?"** Integrate into the maps and futuristic dashboard already being developed. Do not build another map, dashboard, globe, or generic Mars chatbot.

The strongest distinction is not more layers. It is a reproducible chain from NASA evidence to a route tradeoff, a resource decision, and a scientific objective, with uncertainty visible at each step.

### Challenge requirements and verification status

The project brief identifies NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map," and asks for a layered view of a location or route using multiple missions and at least three information types. This is the working product requirement, not an independently verified quotation. The official site returned an interstitial; confirm the challenge-specific page and submission rules before finalizing claims.

| Brief requirement        | Proposed evidence of delivery                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Integrated mission data  | Same route and selected stop joined to optical imagery, numeric terrain, geology, and curated rover observations |
| Surface mission planning | Outbound route, science dwell, explicit return route, and modeled reserves                                       |
| Hazard awareness         | Terrain constraints, authored exclusions, missing-data boundaries, and scale limitations                         |
| Geological understanding | Source-cited unit context and observation questions, not just colored polygons                                   |
| Informed decisions       | Compare distance and terrain-aware routes under identical constraints; explain rejected choices                  |
| Multiple missions        | MRO orbital products plus verified Mars 2020 observations; Odyssey thermal context when available                |

Optical imagery, topography, and geology are three distinct information types. Slope, hillshade, and elevation derived from one DEM are not three independent types. CTX and HiRISE are both on MRO and do not establish multiple missions by themselves. A geology map synthesizes several missions, but explicitly associated rover evidence provides a clearer second-mission demonstration than relying on that provenance alone.

All recommended science capabilities remain **conditional on acquisition**: no numeric DEM, geologic geometry, or rover records were found locally. See [DATA_ANALYSIS.md](DATA_ANALYSIS.md) for measured metadata findings and original NASA/USGS sources.

## 2. Existing application capabilities

The inspected checkout is snapshot `b6e0e4c83bde486d724c69b39143695726c64410`. It does not contain the parallel map/dashboard work described by the team. This is a visibility limitation, not evidence that those developers have done no work.

| Component             | Observed implementation                                                            | Status and implication                                                        |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Frontend              | `app/page.tsx` landing page; `app/layout.tsx`; Tailwind theme in `app/globals.css` | Scaffold implemented; integrate with the team's separate map/dashboard branch |
| UI primitives         | `components/ui/button.tsx`, Base UI/shadcn configuration, `lib/utils.ts`           | Button and styling foundation implemented; no mission widgets observed        |
| API                   | `server/api/app.ts` exposes `GET /api/health` and JSON 404                         | Hono routing foundation implemented; scientific endpoints missing             |
| API forwarding        | `app/api/[[...route]]/route.ts` forwards methods to Hono                           | Reuse unchanged; new business routes belong in `server/api/`                  |
| Mapping library       | No mapping, GIS, raster, or terrain dependency in manifest/lockfile                | Choice in parallel work unknown; do not prescribe a replacement               |
| Shared mission state  | No mission types, store, event log, or persistence observed                        | Agree one contract with existing UI owners                                    |
| Scientific processing | None observed; no local datasets                                                   | Acquisition and validation are critical path                                  |
| Simulation and AI     | No model, AI SDK, provider configuration, or tools observed                        | Proposed additions, not existing capabilities                                 |
| Deployment and tests  | vinext/Vite, Cloudflare plugin/Wrangler, Nix, two Hono Vitest cases                | Existing platform is adequate; no new service architecture required           |

Approved foundation: React 19.3.1 in the lockfile, vinext 1.4.5, Vite 8.3.0, Hono 4.13.18, TypeScript, Tailwind/shadcn/Base UI, Vitest, oxfmt/oxlint, Node 24 and pnpm 12 through Nix. No geospatial database, R2/D1 binding, authentication system, or AI service is configured in `wrangler.jsonc`.

## 3. Scientific feasibility taxonomy

| Code | Category                                                        | What may be claimed                                                                         |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| M    | Supported by mission measurements or published science products | Source value/context, with its processing level and uncertainty; still requires acquisition |
| D    | Mathematically derived                                          | Result of a named algorithm on identified input data                                        |
| S    | Assumption-driven simulation                                    | Conditional scenario estimate, never real telemetry or validated physiology                 |
| A    | Additional data required                                        | Not supported by inspected local material; name the missing input                           |
| X    | Not credible in 48 hours at the proposed scope                  | Exclude rather than imply unsupported capability                                            |

These categories can overlap. A route is D+A; its oxygen estimate is S; a DEM is already a published photogrammetric derivation from imagery rather than direct on-the-ground measurement. "Supported" does not mean locally available or operationally certified.

## 4. Major feature specifications

### F1. Terrain and evidence inspector

**Value:** turns a map click into a defensible planning statement and prevents users confusing visual detail with measured terrain detail.

- **Inputs/category:** CTX DEM, matched image metadata, valid-data mask, source manifests; M+D+A.
- **Algorithm:** map-to-native-grid transformation, masked elevation sampling, Horn 3 x 3 gradient, slope bins, and one optional local-relief metric. Display a coverage mask instead of silently filling gaps.
- **Outputs:** source elevation in meters, derived slope in degrees, grid resolution, method, missing-data state, provenance, and approximate geologic context once available.
- **Integration:** existing map hover/click and overlay controls; existing dashboard's selected-location panel. Numeric samples and display overlays share a dataset version.
- **Difficulty:** medium, mainly coordinate registration and missing-data correctness. Validate multiple distributed landmarks before styling.
- **Limits:** 20 m cells smooth small obstacles; regional screening is not safe-footstep detection. Slope-bin thresholds are scenario policy, not NASA astronaut limits.

### F2. Constrained route comparison

**Value:** demonstrates computation that changes a decision: the shortest allowed route can differ from a lower terrain-cost route, with visible reasons.

- **Inputs/category:** valid DEM, derived slopes, start/goal, base, user-authored exclusions, threshold settings; D+A.
- **Algorithm:** 8-connected A* with a binary heap and no diagonal corner cutting. Compare a distance-only graph cost against a nonnegative terrain-weighted cost on the **same blocked-cell mask**. Edge grade uses directed elevation difference; regional slope screening captures cross-slope context.
- **Outputs:** up to two routes, distance, ascent/descent, slope summary, profile, computation resolution, exclusions, and cost breakdown. If paths coincide, say so; do not fabricate alternatives.
- **Integration:** existing waypoint interactions and route layers; dashboard comparison cards and selectable elevation profile. Sampling the profile must use the same grid as search.
- **Difficulty:** medium-high. Use a bounded study area and cancellation; do not search all of Mars.
- **Limits:** "lowest modeled terrain cost" is defensible; "safest route" is not. Cost weights and slope limits are declared settings, not collision probabilities or validated mobility limits.

Suggested cost, with distance `d` in meters:

```text
c(i,j) = d(i,j) * [1 + a*max(grade,0) + b*abs(min(grade,0)) + q*relativeTerrainPenalty]
```

All coefficients and penalties must be nonnegative. Block missing cells and policy violations before cost evaluation. An admissible heuristic is projected straight-line distance when each edge cost is at least its metric distance; otherwise use a documented lower bound or Dijkstra. Never let science rewards create negative route edges. Rank science destinations separately.

### F3. Modeled return reserve and abort decision

**Value:** replaces a misleading circular "range" with terrain-dependent return accounting. A target is useful only if the modeled crew can return with declared reserves.

- **Inputs/category:** routing graph, current simulated position, base, selected return policy, remaining resources, reserve settings; D+S+A.
- **Algorithm:** compute a directed return path. For many positions, use Dijkstra from base on the **reversed directed graph**, so the field represents position-to-base costs rather than base-to-position costs. Evaluate time, oxygen, and energy on the actual return path.
- **Outputs:** return line, modeled arrival resources, limiting resource, continue/return/infeasible/unknown status, and threshold explanation.
- **Integration:** current-position marker and return overlay; dashboard reserve/abort panel. Changing constraints invalidates the old return result.
- **Difficulty:** medium-high because direction, dwell, resource accounting, and stale state matter.
- **Limits:** a return field based on one policy gives a conservative **known-return set**: points whose selected return paths meet all budgets. It is not the complete multi-resource feasible region. A time-minimal path may not minimize oxygen or battery; do not combine independent minima from incompatible paths and call that a feasible return.

The MVP needs an explicit return path at selected checkpoints. A continuously shaded known-return envelope is a high-priority addition, not a prerequisite. Show unknown when a required input is missing; reserve insufficiency is a model result, not a medical emergency diagnosis.

### F4. EVA scenario replay and what-if analysis

**Value:** connects terrain and scientific dwell time to a mission consequence instead of decorative oxygen gauges.

- **Inputs/category:** chosen outbound/return paths, station dwell times, synthetic base/crew, scenario capacities and activity rates; S with D terrain inputs.
- **Algorithm:** deterministic time stepping or segment integration. Terrain-dependent speed controls segment duration; oxygen and battery draw integrate over walking, science dwell, rest, and contingency states. Pause/resume and replay must preserve accumulated state.
- **Outputs:** simulated position, elapsed time, planned/remaining dwell, modeled oxygen kg and energy Wh, reserves, and a comparison after a parameter change.
- **Integration:** drive existing map marker and dashboard values from one shared simulation clock, not independent UI timers. Label all crew readings "simulated."
- **Difficulty:** medium. Prefer transparent piecewise rates to a poorly justified physiological model.
- **Limits:** no astronaut telemetry exists here. NASA's spacesuit overview confirms oxygen, power, cooling, and CO2-removal responsibilities, but does not validate Mars walking rates. Oxygen and battery alone cannot certify EVA feasibility; omit or flag unmodeled CO2 removal, cooling water, thermal stress, fatigue, and suit faults.

Use named scenario parameters, with units, source or `assumed` status, and a model version. A cautious speed scenario can penalize both ascent and steep descent; do not import an Earth hiking equation as a Mars-validated law. Compare nominal and pessimistic assumptions, without assigning unsupported probabilities.

### F5. Science targets with evidence and contact-aware questions

**Value:** explains why the crew should go somewhere and what observation might discriminate between geological interpretations.

- **Inputs/category:** verified SIM 3464 unit geometry/legend, authored target questions, curated Perseverance observations and locations; M+D+A, with authored priorities.
- **Algorithm:** point-in-polygon context, bounded route-to-site costs, and deterministic ranking by user-selected scientific objective and modeled travel/dwell budget. Return top candidates with reasons, not a mysterious discovery score.
- **Outputs:** a small catalog of source-cited targets, unit context, observation question, evidence image, dwell assumption, route cost, and uncertainty notes.
- **Integration:** existing map POIs and dashboard science cards; choosing a target invokes the same route planner. Observation logging records a simulated mission action, not a new NASA observation.
- **Difficulty:** medium, with data curation often more important than code.
- **Limits:** SIM contacts may be offset about 100-200 m. Recommend observing a contact neighborhood or an approach viewpoint, not standing on an exact mapped boundary. Image association requires verified station/camera/time metadata. Do not promise a mineral, water, biosignature, or past-life detection from imagery and topography.

For the MVP, use a few reviewed sites and one selected destination per sortie. Automatic scheduling of many stops is unnecessary to demonstrate scientific merit.

### F6. Reproducible explanations and optional AI copilot

**Value:** makes tradeoffs understandable and auditable without giving a language model authority over scientific arithmetic.

- **Inputs/category:** structured route metrics, resource assessment, scenario parameters, source IDs and reviewed science notes; D+S for facts, AI for language.
- **MVP algorithm:** deterministic reason codes and a concise mission summary. Explain which constraint blocks a route or which objective costs additional return margin.
- **Optional AI behavior:** parse "compare these targets with a larger reserve" into a validated action, ask for confirmation, execute existing deterministic tools, then explain their outputs with source IDs. For a what-if, show the changed parameter and before/after metrics.
- **Tool contracts:** `inspectLocation`, `compareRoutes`, `assessMission`, and `getScienceEvidence`, all bounded to approved dataset/site IDs. With browser-side computation, the client executes validated actions and returns tool results for explanation; the model does not run arbitrary code.
- **Integration:** existing dashboard command/chat surface, if available. Core mission planning works with no AI provider or network.
- **Difficulty:** low-medium for reason codes; medium-high for LLM integration, keys, failure handling, and evaluation.
- **Limits:** never invent NASA thresholds, telemetry, confidence percentages, destinations, or tool results. No autonomous emergency decisions. Emergency output should restate deterministic scenario constraints and require user confirmation, not improvise medical or operational instructions.

## 5. Additional innovations worth considering

| Capability                             | Why it adds value                                                                  | Data, algorithm, and output                                                                              | Feasibility and placement                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Evidence and resolution strip          | Helps judges inspect the full provenance chain rather than trust presentation      | Manifest join: source, instrument, date, pixel support, transformations, assumption flags per result     | M+D; included in F1/F6                                                                                |
| Assumption sensitivity                 | Shows whether a plan depends on optimistic speed or consumption                    | Re-evaluate a fixed mission under nominal and pessimistic parameter sets; show changed limiting resource | S; high priority; scenario range, not statistical confidence                                          |
| Science value per modeled minute       | Makes exploration efficiency explicit                                              | Compare reviewed objectives, route/dwell time, and reserves; authored weights visible                    | D+S; high priority after F5; not a discovery probability                                              |
| Thermal-material context               | Integrates independent Odyssey data and helps compare physically distinct surfaces | Quantitative 100 m THEMIS cutout; site summaries/material contrast with caveats                          | M+D+A; high priority only if data access resolves early                                               |
| Local autonomy / delayed Earth advice  | Demonstrates why a crew needs onboard decision support                             | User-selected communications delay and queued advisory messages; local deterministic planner continues   | S; stretch; no live ephemeris or real link prediction                                                 |
| Terrain-only relay visibility          | Exposes potential terrain obstruction along a route                                | DEM ray casting to an assumed relay/base and antenna heights; visible/blocked/unknown segments           | D+S+A; stretch; not RF reliability or orbital coverage                                                |
| Scenario exclusion and reroute         | Lets judges see a reproducible constraint change                                   | User draws a hypothetical blocked zone; rerun ordinary A*, invalidate previous assessment                | D+S; high priority; no claim of live hazard detection                                                 |
| Observation record and mission receipt | Preserves why a route was chosen and what the synthetic crew did                   | Structured event log and export containing inputs, dataset/model versions, results and citations         | D+S; small summary included in F6; richer log high priority                                           |
| Workload-aware display                 | Reduces interpretation burden during a timed sortie                                | Prioritize limiting reserve, next action and uncertainty; keyboard support and non-color status cues     | Human-factors design recommendation, not a validated astronaut study; integrate in existing dashboard |
| Counterfactual explanation             | Proves that a recommendation follows constraints                                   | Change one constraint and rerun; report why a rejected target becomes feasible in the model              | D+S; optional part of sensitivity, not another AI agent                                               |

Do not implement these as separate platforms. They are small extensions of the same data, planner, scenario, and evidence contracts.

## 6. Prioritization matrix

Hours are **incremental person-hours**, not elapsed time, and assume experienced developers plus approved, obtainable bounded data. They are planning estimates, not measured performance. Core map/dashboard development is excluded. Individual work shares infrastructure; do not sum all optional rows into the MVP budget.

Priority favors scientific relevance and challenge alignment first, then correctness, demonstrated decision value, integration fit, and credible innovation. Complexity is not a reason to accept a scientifically weaker shortcut.

| Feature                                                 | Scientific Value                              | Data Required                                    | Complexity  | Estimated Hours                | Priority          |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | ----------- | ------------------------------ | ----------------- |
| Approved bounded dataset release and provenance         | Essential, foundation for every claim         | DEM, image registration, geology, rover evidence | Medium      | 10-16                          | MVP               |
| F1 terrain inspector and slope/coverage overlay         | High, measured-to-derived chain               | Numeric DEM and mask                             | Medium      | 8-12                           | MVP               |
| F2 distance versus terrain-aware A* and profile         | Very high, decision-changing analysis         | DEM, constraints                                 | Medium-high | 12-18                          | MVP               |
| F3 explicit return path and reserve decision            | Very high, round-trip mission reasoning       | Graph and scenario                               | Medium-high | 8-12                           | MVP               |
| F4 basic deterministic EVA/resource replay              | High educational value, simulated             | Route and declared activity rates                | Medium      | 6-10                           | MVP               |
| F5 reviewed science targets, geology and rover evidence | Very high, purpose beyond navigation          | Geology and verified Mars 2020 records           | Medium      | 8-12                           | MVP               |
| F6 reason codes and versioned mission summary           | High, reproducibility and explanation         | Structured outputs and citations                 | Low-medium  | 4-6                            | MVP               |
| Frozen demo assets and unavailable-data states          | High, reliable and honest evidence            | Approved data subset                             | Low-medium  | 4-6                            | MVP               |
| Continuous known-return envelope                        | High, terrain-dependent range                 | Directed graph and resource policy               | Medium      | 6-10                           | High              |
| Assumption sensitivity and counterfactuals              | High, honest robustness comparison            | Existing model, alternate parameters             | Low-medium  | 3-5                            | High              |
| Quantitative THEMIS material-context join               | Very high, independent mission/measurement    | Approved numeric 100 m cutout                    | Medium-high | 6-10                           | High, data-gated  |
| Validated AI intent and tool-grounded explanations      | High communication value if grounded          | Provider access, deterministic tools             | Medium-high | 8-12                           | High, core-gated  |
| Draw exclusion and ordinary A* reroute                  | High, visible autonomy scenario               | Existing graph, authored mask                    | Low-medium  | 3-5                            | High              |
| Science-efficiency candidate ranking                    | High, objective-aware selection               | Reviewed targets and planner                     | Medium      | 4-6                            | High              |
| Rich observation log and replay export                  | Medium-high, reproducibility                  | Scenario event stream                            | Low-medium  | 3-5                            | High              |
| Terrain-only base/relay visibility                      | Medium-high, another terrain use              | DEM, hypothetical antenna locations              | Medium-high | 8-14                           | Stretch           |
| Simulated communications-delay mode                     | Medium, mission-autonomy narrative            | Declared delay                                   | Low-medium  | 3-5                            | Stretch           |
| Multi-stop science itinerary                            | High but substantial integration              | Site costs, dwell and resources                  | High        | 10-18                          | Stretch           |
| HiRISE local validation                                 | High if matching coverage exists              | Approved DTM/image/confidence cutout             | High        | 8-16                           | Stretch           |
| CRISM/MEDA context                                      | High science, difficult time/quality handling | Calibrated spectra or timed observations         | High        | 12-24                          | Stretch, not core |
| Quantitative Jezero radiation hazard map                | Unsupported by present evidence               | Local field/model, shielding, event inputs       | Very high   | Not credibly estimable in 48 h | Out of scope      |
| Real-time weather prediction or dust detection          | Unsupported by current data                   | Forecast model and timely observations           | Very high   | Beyond 48 h                    | Out of scope      |
| Autonomous driving / footstep certification             | Unsupported at 20 m scale                     | Local perception, mobility validation            | Very high   | Beyond 48 h                    | Out of scope      |
| Full physiological digital twin                         | Unsupported without calibration               | Validated human/suit experiments                 | Very high   | Beyond 48 h                    | Out of scope      |
| Global Mars optimizer or new dashboard/map              | Low incremental challenge value               | Broad datasets or duplicate UI work              | High        | Unbounded / unnecessary        | Out of scope      |

The eight MVP rows total **60-92 person-hours** before shared integration/testing. Add **20-28 person-hours** for interface agreement, deployment, end-to-end verification, and rehearsal: **80-120 person-hours**. Optional AI or thermal ingestion must fit spare capacity, not replace data validation.

## 7. Final scope and cuts

### MVP acceptance

1. One validated Jezero study area; clearly synthetic base and crew.
2. Optical, topographic, and geologic information joined to a route/stop, with verified Mars 2020 evidence and visible provenance. This is a delivery gate, not a claim satisfied today.
3. Two comparable optimization modes, honest no-path outcomes, and an elevation/slope profile.
4. One source-backed science target per sortie, with modeled dwell, outbound and return paths, explicit resource assumptions, and reserves.
5. Deterministic replay and explanation; unavailable inputs produce unknown, not reassuring zeros.
6. One reliable saved scenario and a reproducible mission receipt; no AI key required.

### High-priority additions

First add sensitivity to demonstrate intellectual honesty, then a known-return overlay or hypothetical exclusion reroute. Prefer quantitative THEMIS over extra cosmetic layers if a small validated cutout becomes available. Add the AI copilot only after tools, sources, and failure behavior work. Full AI scope is 8-12 hours; the implementation plan budgets at most 8 spare hours for a reduced explain-only slice, otherwise omit it.

### Stretch goals

Use greedy insertion or small exhaustive ordering over a handful of sites for an itinerary, always rechecking return feasibility; do not introduce a general operations-research service. Terrain line of sight and communications delay can strengthen autonomy storytelling, but their limitations must be obvious. HiRISE, MEDA, and CRISM need product-specific quality work and must not endanger the core.

### Features and claims to avoid

- A colorful "risk probability" without a calibrated hazard model. Call the quantity a relative cost or policy class.
- Quantitative radiation, dust-storm, oxygen-deposit, or chemical-abundance maps inferred from DEM/image appearance.
- Thermal-inertia-to-traction or live-temperature conversion without a validated model.
- Curiosity/Gale measurements presented as Jezero's current conditions.
- A chatbot that invents mission facts, edits reserve thresholds silently, or overrides a no-path result.
- A* route smoothing that cuts through excluded cells; a "return" distance that is merely outbound distance doubled.
- Continuous live astronaut tracking, real NASA telemetry, or operational safety certification.
- Rebuilding functioning maps/dashboard, 3D spectacle without analysis, microservices, Kubernetes, or a geospatial database for one small study area.

## 8. Recommended demonstration scenario

**Narrative: a geologically motivated sortie with an explicit return decision.** Choose actual endpoints only after numeric terrain, geologic geometry, and rover evidence are validated. No route lengths, reserve values, or successful target approaches are claimed by this report.

| Time      | Demonstration                                                         | What judges can verify                                                                                          |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0:00-0:40 | Show the bounded study area and evidence strip                        | Real source IDs, instruments, resolution differences, synthetic base label                                      |
| 0:40-1:20 | Select a reviewed fan/floor or contact-neighborhood objective         | Why the observation matters, geologic source, registration caveat, verified rover image/station association     |
| 1:20-2:10 | Compare distance-only and terrain-aware routes                        | Same start/goal/mask; different costs where terrain warrants it; linked profile                                 |
| 2:10-3:00 | Inspect outbound, science dwell, and return assessment                | Scenario rates, limiting resource, visible reserves, no claim of validated physiology                           |
| 3:00-3:45 | Change to a pessimistic speed scenario or reduce a simulated capacity | Model recalculates; target/dwell is adjusted if the computed budget requires it, not via scripted fake outcomes |
| 3:45-4:30 | Replay or show a hypothetical exclusion reroute                       | Shared clock and consistent route/model versions; warnings remain readable                                      |
| 4:30-5:00 | Show explanation and mission receipt                                  | Which evidence and assumptions caused the decision; AI optional and source-grounded                             |

Include one visible failure case: attempt a route outside valid DEM coverage and show "unknown/no numeric coverage," not a fabricated flat route. If the chosen science target is infeasible, demonstrate selecting a supported nearer target or shortening modeled dwell only when the solver confirms the change works.

## 9. Main risks and decision gates

| Risk                                                      | Decision                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| No local scientific samples                               | First milestone is an approved numeric subset and verified science evidence, not UI claims               |
| Map/dashboard branch contract unknown                     | Agree coordinates, callbacks, state ownership and dataset version at hour 0-2                            |
| Wrong planetary projection or WMTS matrix                 | Validate against labels, capabilities and landmarks before route visualization                           |
| Resource model mistaken for real safety                   | Persistent simulation label, explicit assumptions, no operational certification                          |
| Cloudflare CPU/memory and unknown plan                    | Use bounded browser computation first; benchmark before enabling server-side search                      |
| Missing third information type or second-mission evidence | Escalate early; do not count DEM derivatives as compliance or disguise source gaps                       |
| AI/network reliability                                    | Deterministic planning and frozen data survive without the model; offline/reload behavior must be tested |

Original data sources and limitations are registered in [DATA_ANALYSIS.md, section 9](DATA_ANALYSIS.md#9-source-register). Algorithm names here are implementation recommendations, not NASA-endorsed mission software. Platform constraints are from [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), inspected on the research date. The practical ownership and testing plan follows in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
