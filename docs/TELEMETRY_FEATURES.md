# Telemetry features

## Recommendation

Research snapshot: 2026-11-14. These are proposed integrations, not delivered application features. Preserve the map and dashboard owners' components; agree on their mission-state contract before connecting anything. The preset base is configuration, not a hard-coded Jezero location. See [data evidence](TELEMETRY_ANALYSIS.md), [model equations](SIMULATION_RESEARCH.md), and [service design](TELEMETRY_ARCHITECTURE.md).

Build a credible **historical MOXIE replay with traceable resource accounting**, not a fake live Mars operations center. Put source, time, units and quality beside every number. Label NASA calibrated values, archive-derived quantities, ARES derivatives and assumed simulations distinctly. An archive timestamp should never appear as “live.”

## Five bounded features

### 1. Historical instrument replay

**Priority: first.** Select a MOXIE product/run, play/pause, choose playback speed and seek on a relative-seconds axis. Show archived current-derived oxygen rate, total power, heater temperatures and run states. Keep a visible recorded date and a quality badge. Match calibrated/derived channels exactly by elapsed time and distinguish off/diagnostic zero production from missing data.

Integrate by providing a small telemetry adapter to existing dashboard cards/charts, not replacing dashboard layout. The map may show a source-context badge for Perseverance/Jezero only where provenance supports it; telemetry must not move the simulated crew or invent exact rover coordinates.

**Acceptance:** the sol-60 oxygen integral is approximately 5.3956 g under the documented convention; a diagnostic run displays zero production; sol 901 explicitly has no archived derived oxygen and its elapsed-counter reset is segmented, not sorted away; directory 96 cannot claim verified UTC. Pause and seek update every connected metric consistently. Gaps are visible, not smoothed.

### 2. Run performance and energy comparison

**Priority: second.** Compare complete production runs with active duration, whole-run energy, integrated oxygen, peak and active mean rate. A warmup/production overlay explains why a peak rate is not a sustainable full-run average. Offer specific energy only with named boundaries and a nonzero denominator. The existing dashboard can host a compact comparison panel with drill-through to source/run details.

Display the approximately 122.272 g integrated archive total as an ARES calculation, alongside NASA's separately cited rounded 122 g mission summary. Avoid a purity gauge or a single overall “efficiency” score. A per-run association chart may expose the documented binning and confounding, not a causal environmental model.

**Acceptance:** changing full-run versus active-only view changes the denominator and label; compressor power is not double-counted; zero-output diagnostic runs have undefined Wh/g; no derived output is invented for sol 901.

### 3. Evidence and data-quality inspector

**Priority: alongside replay.** Provide product ID/version, processing level, source link/hash, original field/unit, valid/missing/N/A counts and quality explanations. Distinguish observed range from configured alert policy. Expose conflicting row counts/times and the CS4 unit problem rather than quietly fixing them.

This panel also makes absent capabilities explicit: MEDA is a catalog-only inventory, REMS has no local samples, and RAD is a separate **2012 historical detector-rate** view. RAD B and E use µGy/h, separate detector labels and UTC observations with placeholder QC/location warnings. No RAD map overlay or astronaut dose counter is warranted.

**Acceptance:** a missing weather card says “measurement data not downloaded,” not zero; corrected-CS4 negatives remain inspectable but cannot become verified purity; RAD all-zero coordinates are never mapped; original quality/raw values remain available without being promoted to good measurements.

### 4. Transparent habitat resource sandbox

**Priority: after replay.** Feed a selected complete MOXIE trace into a hypothetical oxygen and battery ledger. Expose initial inventory/capacity, demand, assumed capture/charge/discharge efficiencies, generation/load schedules and explicit reserves. Show cumulative produced/consumed/vented/unmet quantities so conservation is inspectable.

Keep observed instrument power/output in their own cards and simulated habitat/suit inventory in separately badged cards. Do not credit archived oxygen to a fictional tank without an explicit scenario mode and capture assumption. Consumption or production changes produce a new scenario revision with a deterministic explanation. No default human physiological rate or NASA reserve threshold is implied.

**Acceptance:** pause stops simulation consumption, replay speed changes wall-clock playback only, seek/reset reconstructs inventory reproducibly, and depletion reports unmet demand rather than hiding it at zero. A source gap pauses the trace-coupled scenario unless an explicit alternative supply assumption is selected.

### 5. Modeled sortie and return margins

**Priority: conditional on map/route contracts and validated inputs.** Reuse the existing route planner and preset base. Estimate oxygen/energy/time for outbound, dwell and a directed return; display the remaining modeled margins and limiting assumed resource. Compare bounded candidate routes, not an unconstrained AI-generated mission plan.

The result must say “modeled feasible under these assumptions,” “constraint violation,” or “unknown.” Show the reserve policy and revision used. Never say “safe EVA,” invent a path across masked terrain, treat unknown CO2 capacity as unlimited, or extrapolate RAD into a return deadline.

**Acceptance:** a longer/asymmetric return can invalidate an apparently feasible outbound leg; stale route/resource revisions are rejected; a changed base recomputes return cost; no path or missing required inputs cannot produce a green feasibility state. The dashboard and map reference the same authoritative mission revision.

## Dashboard metric contract

Observed ranges below describe this download only. They are **not warning limits, physical design limits, live conditions or suitability thresholds**. Cadence is source cadence, independent of the proposed approximately 1 Hz UI stream. Retain each value's source timestamp, age and validity; do not forward-fill across gaps without an explicit display-only stale label.

| Metric                                        | Source and provenance                                          | Unit; source cadence                | Locally observed range                   | UI caveat / dependency                                                              |
| --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Oxygen production rate                        | MOXIE derived `F_O2_I_G_HR`; archive current-derived           | g/h; 1 s within run                 | 0-12.116                                 | Not independently measured flow; active mean 6.0465 g/h; sol 901 unavailable        |
| Cumulative oxygen                             | ARES sum of archived rate                                      | g; updates on supported 1 s samples | 0-122.272 across selected acquired runs  | Explicit integration/run boundary, not tank inventory                               |
| Total instrument power                        | MOXIE derived `P_TOT_W`; archive electrical derivative         | W; 1 s                              | 11.819-375.620                           | Main + SOXE, compressor already included; not habitat load                          |
| Instrument energy                             | MOXIE `E_TOT_W_HR` plus separately labeled ARES reconstruction | Wh; 1 s                             | Sum of final run values 11,348.795281 Wh | Run-scoped reset; reconstruction discrepancy up to about 0.105 Wh                   |
| Stack temperatures                            | MOXIE calibrated `TT`, `TB`                                    | °C; 1 s                             | TT 10.392-861.55; TB 16.163-858.94       | Internal heater carriers, not weather or crew temperature                           |
| Top/bottom current                            | MOXIE calibrated `IT`, `IB`                                    | A; 1 s                              | IT 0.0087447-4.0225; IB 0.010202-4.0954  | Oxygen derivative shares these inputs                                               |
| Main bus voltage                              | MOXIE calibrated `V28VM`                                       | V; 1 s                              | 28.054-32.559                            | Not battery SOC or portable power                                                   |
| Filter-exit pressure                          | MOXIE calibrated `P1_cal`                                      | bar; 1 s                            | 0.005940-0.0096549                       | Internal inlet location, not an ambient MEDA pressure card                          |
| Cathode pressure                              | MOXIE calibrated `P4_cal`                                      | bar; 1 s                            | 0.005746-0.817810                        | Instrument pressure, not habitat pressure                                           |
| Inlet mass flow estimate                      | MOXIE derived `F_S_P4_G_HR`                                    | g/h; 1 s                            | 0-87.614                                 | P4-derived engineering model; do not substitute aliased flowmeter field             |
| Compressor volumetric efficiency              | MOXIE derived `ETA_SC_V`                                       | dimensionless; 1 s where applicable | 0.94389-0.94400                          | Equation-derived; 67.161% N/A; not overall production efficiency                    |
| Fault/state                                   | MOXIE calibrated/raw mode, enable and fault fields             | enum/count; 1 s                     | Sol 901 has 14 nonzero fault-count rows  | Decode using documented code definitions; do not call a code a diagnosed cause      |
| Corrected CS4 / oxygen purity                 | CS4 numeric archive inspection only                            | Conflicting definitions; 1 s        | Numeric -51.153 to 1164.1; 9,243 blanks  | Withhold verified purity; unresolved calibration/unit issues; negatives not clamped |
| Ambient temperature, pressure, wind, RH, dust | MEDA actual measurements **not local**                         | Unknown for local samples           | Unavailable                              | Catalog references are not values; acquire labels and measurements first            |
| Gale environmental metrics                    | REMS measurements **not local**                                | Unknown                             | Unavailable                              | Bundle XML alone; different site/mission                                            |
| Historical detector rate B                    | RAD RDR scalar; archive dosimetry                              | µGy/h; 14 irregular starts          | 7.25298-9.86733                          | 2012 data, silicon response; QC/location placeholders; no astronaut risk            |
| Historical detector rate E                    | RAD RDR scalar; archive dosimetry                              | µGy/h; same 14 starts               | 7.05845-8.93606                          | Plastic scintillator; do not average with B or map to Jezero                        |
| Oxygen remaining / reserve margin             | Assumed tank/crew ledger, ARES model                           | kg or g; simulation steps           | No observed range                        | Requires explicit initial stock, demand, capture, losses, reserve                   |
| Battery energy / SOC                          | Assumed battery ledger, ARES model                             | Wh / %; simulation steps            | No observed range                        | Requires capacity, efficiency, load, generation, power limits and reserve           |
| Habitat pressure / pO2                        | Assumed mixed-gas ideal-gas model                              | Pa; simulation steps                | No observed range                        | Requires volume, temperature and gas inventories; not a safety gauge                |
| EVA time / return margin                      | ARES route/resource derivative using assumptions               | s, kg, Wh; revision/event-driven    | No observed range                        | Requires preset base, directed valid route, dwell and all modeled constraints       |

Per-metric payload minimum: stable metric ID; nullable value; unit; provenance class; processing level; source product/run; elapsed time and nullable UTC; validity/reason; quality warnings; scenario/model revision where applicable. A missing or inapplicable value is `null` with a reason, never a fake zero. Finite invalid raw values may appear only in an explicitly marked inspection view.

## Delivery gates

1. Agree with map/dashboard owners on adapter shape and the single mission-state owner. No replacement UI or second competing resource store.
2. Implement ingestion/replay and quality rendering before assumptions. Verify complete-run arithmetic against the analysis tables and retain discrepancies.
3. Add deterministic oxygen/energy ledgers only with visible scenario inputs and conservation tests. Resource alarms are configured scenario-policy violations, not physiological warnings.
4. Integrate route margins only after Mars coordinates, terrain masks, directed routes and revision checks pass the existing geospatial plan. Route unknowns must survive into the UI.
5. Consider AI only as a cited, read-only explainer after the deterministic tools work. No autonomous reserve changes or medical/safety decisions.

Deferred: live weather, verified oxygen purity, weather-trained production forecasts, full habitat control, human radiation exposure, validated suit physiology and operational survival guidance. The telemetry downloads do not support these claims. This research does not independently verify the official NASA Space Apps challenge-specific rubric or compliance.
