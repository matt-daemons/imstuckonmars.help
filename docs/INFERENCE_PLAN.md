# LARA inference plan: weather, radiation, resources, and verdicts

Status: proposal, Sat Nov 14, 2026. The team has not implemented any part of this file yet.

Scope: the forecasts, verdicts, and LARA answers that sit on top of the simulation. POIs and route planning belong to another team member. This plan only defines what it needs from the route.

"Inference" here means two things:

1. **Deterministic prediction.** Code and threshold rules compute every number and a confidence level. No trained model, per CLAUDE.md §2.
2. **LLM explanation.** LARA calls read-only tools and explains their output in speech. LARA never computes or invents a number.

## 1. Goal

A crew member can ask LARA these questions and get a sourced answer with a confidence level:

- "What is the weather now, and in two hours?"
- "What is the radiation level? Will it change?"
- "How long until sunset?"
- "Are we GO for this walk? What limits us?"
- "How much oxygen and battery do I have? When do I hit reserve?"
- "Can I still make it back to base?"

The demo moment from CLAUDE.md §5 must work end to end:

1. The crew starts a nominal walk.
2. A solar flare raises the solar alert to watch.
3. The verdict changes from GO to CAUTION. LARA announces the rule that fired: "stay within 1 hour of base".
4. A solar particle event (SEP) starts. The dose rate rises above 18 µGy/h, and the dose-rate rule also fires.
5. The UI and LARA show the return path and the time to shelter.

## 2. Decisions taken

| Question        | Decision                                      | Result for this plan                                                                    |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| SEP source      | Scripted scenario event, labelled simulated   | New event types. The dose rate is the archived RAD baseline plus a scripted excess.     |
| Weather basis   | More MEDA sols around sol 816                 | Offline climatology per local time, shipped as a small JSON file. No new D1 rows.       |
| Dust opacity    | Scenario setting, labelled assumption         | `dust_opacity` in the mission config, plus a `dust_change` event for a storm what-if.   |
| Plan location   | This file                                     |                                                                                         |
| Wind            | Not available                                 | The MEDA wind sensor has no product after sol 313 (docs/BACKEND.md). LARA says so.      |
| Forecast method | Rules with a stated confidence (CLAUDE.md §2) | Every forecast returns `method`, `confidence`, and `confidence_rule`, like projections. |

## 3. Rules every part of this plan follows

1. **Only ingested data.** A forecast at time t reads data and events at or before t. It never reads a scripted event that is still in the future. `lib/copilot/projection.ts` already follows this rule. Tests must check it.
2. **Every value carries its provenance.** Use one of three labels: archived NASA data, ARES derivative (math on that data), or simulation assumption.
3. **Every forecast carries a confidence and the rule that set it.**
4. **Missing is `null` with a reason.** Never zero.
5. **LARA speaks only numbers that a tool returned.** Section 6, W8 adds a check in code.
6. **Pure functions in `lib/`, composition in `server/`.** The forecast code takes plain inputs and has no database access. Unit tests run without D1.

## 4. Findings that shape the plan

These come from the code and data in the repo on Nov 14.

1. **The base is morning while Jezero is night.** The sol-816 MOXIE run covers 2023-06-06 15:19 to 18:43 UTC. At Jezero that is 00:31 to 03:49 LMST (sun down). At the Arcadia base (−176.05°E, 45.97°N) it is 07:37 to 10:55 LMST. The sun is 35° to 66° up, and sunset is 9 to 12 hours away. Ls is 74° (northern late spring). Source: `lib/mars-time/mars-clock.ts`.
2. **The weather proxy uses the wrong clock.** `get_status` reads the MEDA sample at the same UTC as the MOXIE row. That gives Jezero night temperatures for a base in the morning. A weather proxy must be aligned by the base's local solar time, because the daily cycle follows the Sun. W4 fixes this.
3. **The mission base is at Jezero.** `lib/mission/demo-preset.json` sets the base to 18.44°N, 77.45°E. The map uses the Arcadia site. Every sun and weather calculation needs the Arcadia coordinates.
4. **The simulation can run for at most about 3.4 hours.** The engine stops with `source_unavailable` when the MOXIE trace ends (12,233 one-second rows). The demo walk (50 min) fits. A 6-hour walk from the flight rules does not fit. W6 lists the options.
5. **D1 has a row cap.** The production release has a cap of 50,000 rows and uses 43,613. Raw MEDA samples for more sols do not fit. The climatology must ship as a precomputed file.
6. **The radiation baseline is quiet.** Curiosity RAD detector E (tissue-equivalent) has a mean of 8.075 µGy/h for the window. The SD is 0.115 µGy/h, and there is no SEP (docs/TELEMETRY_ANALYSIS.md). The dose-rate rule sets caution at 18 and no-go at 90 µGy/h.
7. **A solar alert alone gives CAUTION.** `evaluateEva()` returns CAUTION at alert `watch` ("stay within 1 hour of base") and NO-GO at `warning`. So the verdict flips at the flare, before the dose rate rises.
8. **LARA already announces new findings.** `components/copilot/use-lara.ts` polls the snapshot and asks LARA to speak each new code in `state.reasons`. New reason codes get spoken alerts with no extra UI work.
9. **Existing pieces that nothing calls yet:** `readMarsClock()` (sun and sunset), `solarAlertLevel()` (alert level from flare and particle data), and `evaluateEva()` (GO, CAUTION, or NO-GO). This plan connects all three.

## 5. Architecture

```text
inputs at mission time t                 pure functions (lib/inference/)        consumers
------------------------                 ------------------------------        ---------
MOXIE row utc_ms ----------------------> sun.ts        sunAt(t, base)          snapshot.inference
base coordinates (config) -------------^                                       GET /api/missions/:id/outlook
MEDA climatology JSON (offline) -------> weather.ts    weatherAt / forecast    LARA tools
RAD observations (D1) -----------------> radiation.ts  doseAt / forecast       verdict banner (UI)
scenario events up to t ---------------^               alertAt                 spoken alerts (reason codes)
dust_opacity + dust_change events -----> dust.ts       dustAt / forecast
route summary (route team) ------------> live.ts       liveConditions(t)
                                         outlook.ts    verdictAt, outlook(hours)
                                           (calls evaluateEva from lib/flight-rules)
```

`server/mission/service.ts` calls `liveConditions` and `verdictAt` once per snapshot. It adds the result as `snapshot.inference`. LARA tools and the UI read the same object, so the banner and LARA cannot disagree.

## 6. Workstreams

Each workstream lists the files it touches. When another team member owns a file, the owner's name follows it, from `git log`.

### W1. Sun and daylight

Why: sunset feeds the daylight flight rule. Sun elevation is also the easiest high-confidence forecast, because it is ephemeris math.

Method:

- Mission UTC at the cursor is `observed_sample.utc_ms` from the MOXIE row.
- Call `readMarsClock(utc, base, epoch)` with the base coordinates from the config.
- The sol epoch is the Perseverance landing (2021-02-18 20:55 UTC). The sol numbers then match the MEDA sol numbers. Label this as a convention.
- A forecast at t + h is the same call at a later UTC.

Output:

```ts
{
  utc: string;
  base_lmst: string;
  sol: number;
  sun_elevation_deg: number;
  sun_azimuth_deg: number;
  minutes_until_sunset: number | null;
  solar_longitude_deg: number;
  method: "Mars24 (Allison and McEwen 2000)";
  confidence: "high";
}
```

Files: new `lib/inference/sun.ts` and test. Reads `lib/mars-time/mars-clock.ts` (Joseph) without changes.

Tests: the output matches `readMarsClock` at the base. A forecast with h = 0 equals the current value.

### W2. Environment scenario events

Why: the scripted SEP and the dust what-if need a place in the event history. The engine then replays them with the same seek, revision, and command rules as the other events.

New event types in `ScenarioEvent`:

| Type                   | Fields                                                       | Meaning                                                             |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `dust_change`          | `value` (optical depth, tau)                                 | Dust opacity changes to `value` at `at_s`.                          |
| `solar_flare`          | `flare_class` (for example `"X1.2"`)                         | A flare occurs. Feeds `strongest_flare_24h` in `solarAlertLevel()`. |
| `solar_particle_event` | `peak_ugy_h`, `rise_s`, `decay_s`, `above_100_mev` (boolean) | An SEP starts at `at_s`. Shape is in W3.                            |

The engine (`evaluateMission`) stores these events in `applied_event_ids` and has no other effect. The inference functions read them.

New config field: `dust_opacity` (initial tau). Default 0.4, labelled "assumption: clear sky is about 0.3 to 0.5", from the dust rule source in `lib/flight-rules/rules.ts`.

Files: `lib/mission/types.ts`, `lib/mission/validation.ts` (Essam), plus tests in `lib/mission/engine.test.ts`.

Tests: each new event parses and rejects bad input. A mission with these events gives the same resource results as a mission without them.

### W3. Radiation now and forecast

**Dose rate now.**

```text
dose(t) = archived_E(t) + sep_excess(t)

sep_excess(t) for one SEP with onset t0:
  0                                              if t < t0
  (peak - baseline) * (t - t0) / rise_s          if t0 <= t < t0 + rise_s
  (peak - baseline) * exp(-(t - t0 - rise_s) / decay_s)   after that
```

- `archived_E` is the RAD detector E rate at mission UTC (existing `radiationContext`), converted from µGy/day to µGy/h.
- `baseline` is the trailing 3-hour mean of unflagged E before t0.
- The output keeps the two parts apart: `{ archived_ugy_h, simulated_sep_excess_ugy_h, total_ugy_h }`.
- Default demo SEP: `peak_ugy_h = 24`. This is the September 2017 event at Gale, already cited in the dose-rate rule. It passes caution (18) and stays below no-go (90).

**Solar alert level now.** Call `solarAlertLevel()` with:

- `strongest_flare_24h`: the strongest `solar_flare` event in the last 24 h of mission time.
- `particle_event_above_10_mev`: true while an SEP excess is above 10 % of its peak.
- `particle_event_above_100_mev`: the `above_100_mev` field of an active SEP.
- `hours_until_storm_reaches_mars`: null. No CME events in the MVP.

**Forecast.** The forecast never reads future events (rule 1 in section 3).

| Condition at t             | Nominal at t + h            | Range                                                                          | Confidence                        |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| Alert none, no active SEP  | Trailing 3 h mean of E      | Mean ± 2 SD                                                                    | High for h ≤ 6, medium for h ≤ 24 |
| Alert watch, no active SEP | Trailing 3 h mean of E      | Low: mean − 2 SD. High: `null`, reason "an SEP can start without more warning" | Low                               |
| SEP active                 | Current total (persistence) | Low: baseline. High: `null`, same reason                                       | Low                               |

The response also cites the scale of past events: about 24 µGy/h (September 2017) and about 309 µGy/h (May 2024). Both values are in the dose-rate rule source.

**Time to shelter.** The radiation rule source gives two limits. On alert, stay within 1 hour of the lander. End the walk and reach shelter within 2 hours. Time to shelter is the duration of the return route from the current position. The route team supplies it (section 7). Until then, it is the sum of the remaining `return` schedule entries, labelled "from the planned schedule, not a route".

Files: new `lib/inference/radiation.ts` and test. `server/telemetry/radiation.ts` (Essam) stays unchanged. The server composes the two.

Tests:

- A quiet mission gives `total = archived` and alert `none`.
- With a demo SEP, the total crosses 18 at the expected time.
- A forecast at t gives the same result with and without a future SEP event.
- A flagged RAD observation gives `null`, never zero.

### W4. Weather climatology and forecast

**Data acquisition.**

- Extend `scripts/telemetry/acquire.py` (Essam) to download MEDA calibrated ATS and derived PS for sols 810 to 822. The PDS path is the one already used for sol 816 (`sol_0780_0899`).
- Check each label the same way `check_meda` does now.
- Check the download size first. Large downloads need approval (docs/TELEMETRY_ANALYSIS.md).

**Climatology build.** A new offline script, `scripts/telemetry/meda_climatology.py`, does this:

1. For each sol, put each sample in a 1-hour LTST bin (24 bins). Use the `LTST` column of the MEDA file. MEDA samples only the first 16 minutes of most hours, so smaller bins are empty. On sol 816, hour 11 has no samples. Interpolate between bin centres, and give a missing bin `null`.
2. Air temperature per sample is the mean of the valid ATS sensors, the same fields that `ATS_FIELDS` uses in the tools.
3. For each sol and bin, compute the mean temperature (K) and the mean pressure (Pa).
4. Across sols, compute for each bin: mean, SD, minimum, maximum, and `n_sols`. Leave out a bin that has fewer than 3 sols.
5. Write `lib/inference/fixtures/meda-climatology-sol0810-0822.json`. It is a few kilobytes and holds provenance: product LIDs, SHA-256 values, sols, and the Ls range.

The file ships with the app. It adds no D1 rows (finding 5).

**Weather now.** Use the sol-816 bin value at the base's local true solar time (LTST). It is a real measurement, at Jezero, at the same local time as the base. The base is 106.6° east of Jezero, so its clock runs 7.100 Mars hours ahead. Jezero reaches the same local time 7.295 Earth hours later. This replaces the UTC-aligned value in `get_status` (finding 2).

**Forecast.**

```text
anomaly     = now - clim_mean(bin(t))
nominal(h)  = clim_mean(bin(t + h)) + anomaly * exp(-h / tau)     tau = 3 h (assumption)
range(h)    = nominal(h) ± 2 * clim_sd(bin(t + h))
```

| Confidence | Rule                                     |
| ---------- | ---------------------------------------- |
| High       | `n_sols ≥ 7` in the target bin and h ≤ 3 |
| Medium     | `n_sols ≥ 3` and h ≤ 12                  |
| Low        | Otherwise                                |

**Labels that every weather answer carries.**

- "Measured at Jezero crater (18°N). The base is at 46°N. No adjustment for latitude."
- "Pressure is not adjusted for the elevation difference." See open decision 2.
- Wind: `null`, reason "MEDA wind sensor has no product after sol 313".

Files: `scripts/telemetry/acquire.py` (Essam), new `scripts/telemetry/meda_climatology.py` and its test, new `lib/inference/weather.ts` and test.

Tests:

- A flat climatology with zero anomaly gives a flat forecast.
- The anomaly decays toward the climatology.
- A missing bin gives `null` with a reason.
- Bins wrap at midnight (hour 23 to hour 0).
- At 2023-06-06 15:19:16 UTC, the base LMST is 07:36:55. Jezero reaches 07:36:55 at 22:36:59 UTC (computed with `readMarsClock`).

### W5. Live conditions, verdict, and outlook

**Live conditions.** `liveConditions(t)` returns the live-feed format from CLAUDE.md §4:

```ts
{ timestamp, radiation_dose_rate, solar_alert_level, dust_opacity, temp, wind: null, sun_elevation,
  provenance: { radiation, dust, temp, sun } }
```

**Verdict now.** `verdictAt(t)` builds the `EvaPlan` for `evaluateEva()`:

- `route`: `est_time_min`, `max_slope`, and `farthest_from_base_km` from the route team. Without a route, the verdict is `unknown` with reason "no route selected". It never defaults to GO.
- `live`: from `liveConditions(t)`.
- `minutes_until_sunset`: from W1.

The banner format follows CLAUDE.md §3: status, limiting constraint, margin, and time to shelter.

**Outlook.** `outlook(t, hours)` runs the W1, W3, and W4 forecasts for each hour and calls `evaluateEva()` on each. It returns the agreed format:

```ts
{ hours: Array<{ hour: number; dust: number; radiation: number | null; temp_k: number | null;
                 verdict: "GO" | "CAUTION" | "NO_GO" | "UNKNOWN"; confidence: Confidence }>,
  explanation: string[] }   // deterministic reason sentences from evaluateEva
```

A `null` forecast value makes that hour's verdict `UNKNOWN`. It never turns into GO.

**New reason codes** in `snapshot.inference.reasons`, so LARA announces them (finding 7):

`solar_alert_watch`, `solar_alert_warning`, `radiation_caution`, `radiation_no_go`, `dust_caution`, `dust_no_go`, `daylight_margin`, `verdict_caution`, `verdict_no_go`.

Files: new `lib/inference/live.ts`, `lib/inference/outlook.ts`, and tests. `server/mission/service.ts` (Essam) adds `snapshot.inference`. `server/api/missions.ts` (Essam) adds `GET /api/missions/:id/outlook?hours=`. `components/copilot/use-lara.ts` (Tai) also watches `inference.reasons`.

Tests: the demo flare flips `verdictAt` from GO to CAUTION, with `limiting_factor = "radiation"`. The SEP adds a `dose_rate` reason when the rate crosses 18. No route gives `unknown`. The outlook has one entry per hour.

### W6. Resource consumption

The resource engine already works. These items close the gaps that the demo or the walk length expose.

| Item                          | Change                                                                                                                                                   | Why                                                                        | Owner                                            | Priority |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| 6a. Base location             | Set the preset base to the Arcadia site. Add `proxy_sites: { weather: "Jezero", radiation: "Gale" }` to the config.                                      | Finding 3. The sun and weather math need the actual base.                  | Essam (preset row in D1 and `demo-preset.json`)  | P0       |
| 6b. Early return              | New command `begin_return` at time t. It ends the current activity and inserts the return legs (from the route team, or the planned `return` entries).   | The demo needs "turn back now" after CAUTION. The schedule is fixed today. | Essam (`command` in `server/mission/service.ts`) | P1       |
| 6c. Return margin tool        | LARA tool that calls the existing `assessReturn` with the route team's return route at t.                                                                | Answers "can I make it back?".                                             | Tai                                              | P1       |
| 6d. End-of-trace policy       | Config `after_trace: "stop" \| "production_off"`. `production_off` continues with zero MOXIE oxygen and zero instrument power, labelled. Default `stop`. | Finding 4. A walk longer than about 3.4 h stops the simulation.            | Essam (`evaluateMission`)                        | P2       |
| 6e. Workload-based oxygen use | Optional per-leg oxygen rate from walking speed and grade. See below.                                                                                    | Today each activity has one fixed rate. Uphill and downhill cost the same. | Essam + route team                               | P2       |

**6e method (proposal, check before use).** Leave the constant activity profiles as the default. As an option, compute a per-leg rate:

```text
O2_g_per_h = M_W * 3600 / E_O2 * rho_O2
  E_O2   ≈ 20.1 kJ per litre of O2 (energy equivalent of oxygen, mixed diet)   CHECK
  rho_O2 = 1.429 g/L at STP
  so O2_g_per_h ≈ 0.256 * M_W

M_W from the Pandolf load-carriage equation, with the body-weight terms scaled by 0.38 g   CHECK
```

Pandolf is an Earth walking equation. Its scaling to Mars gravity is an assumption with no validation. Label it in the UI. The route team must add `distance_m` and `mean_grade_deg` to each leg (section 7).

Tests for 6b and 6d go in `lib/mission/engine.test.ts`. They must keep the existing conservation checks green.

### W7. LARA tools, prompt, and alerts

**New tools** in `server/copilot/tools.ts` (Tai). All are read-only and bound to the replay cursor, like the current tools.

| Tool                 | Arguments             | Returns                                                                                 |
| -------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `sun_status`         | none                  | W1 output                                                                               |
| `weather_forecast`   | `hours_ahead` 0 to 12 | W4 now and forecast, with labels                                                        |
| `radiation_forecast` | `hours_ahead` 0 to 24 | W3 now and forecast. Replaces the forecast part of `radiation_status`.                  |
| `space_weather`      | none                  | Alert level, the flare and SEP events so far, and "scripted simulation" label           |
| `eva_verdict`        | none                  | W5 verdict: status, limiting factor, margin, time to shelter, reasons with rule sources |
| `outlook`            | `hours` 1 to 12       | W5 outlook                                                                              |
| `return_margin`      | none                  | W6 item 6c                                                                              |

`get_status` keeps its shape. Its weather part changes to the W4 value at base LMST.

Tool descriptions use the STE style already used in `tools.ts`: one meaning per word, short sentences. The model picks tools from these descriptions, so ambiguity there causes wrong tool calls.

**System prompt changes** in `server/copilot/llm.ts` (Tai):

- Remove "Dust and wind are not available". Replace it with: "Dust opacity is a scenario setting, not a measurement. Wind is not available."
- Add: "Solar flares and particle events in this mission are scripted. They are not actual space weather."
- Add: "Weather values come from Jezero at the same local time as the base. Say this once when it matters."
- Add: "For a forecast, give the nominal value, the range when it matters, and the confidence. If the high end is unknown, say that the rate can rise without warning."
- Add: "For a verdict, name the rule that fired and the margin."

**Alerts.** Send a detail string with each new reason code, for example `{ code: "verdict_caution", detail: "dose rate 19.2 µGy/h, caution at 18" }`. The `/ask` schema already accepts `alert.detail`. LARA then speaks the number from the detail and does not need a tool call first. This keeps the alert fast.

A flare adds `solar_alert_watch` and `verdict_caution` in the same snapshot. `use-lara.ts` speaks one new code per poll, so LARA would speak twice. Give verdict codes priority, and put the alert in the verdict's detail string.

### W8. Answer checks and evaluation

These are the AI-specific quality steps. They protect the Validity criterion.

1. **Number check (code).** After LARA replies, extract each number from the text. Each one must match a number in this turn's tool outputs, after the same rounding. Mission clock values in the question also count. If a number does not match, ask the model once to fix the answer. If it still fails, speak the deterministic fallback from `explain_findings`. File: `server/copilot/llm.ts`.
2. **Banned-word check (code).** The prompt bans "safe", "unsafe", "dangerous", "healthy", and "fine" about any value. Check the reply text and fix it the same way as the number check.
3. **Evaluation set (manual, before the demo).** `server/copilot/evals/questions.json` holds about 20 questions. Each has the expected tool calls and the facts the answer must contain. The questions run against a fixed mission at fixed `at_s` values: before the flare, during the watch, and after CAUTION. A script `pnpm eval:lara` reports tool-choice accuracy, number matches, banned words, and sentence count. It calls the real provider, so it does not run in CI.
4. **CI tests (mock provider).** Extend `server/copilot/llm.test.ts`: tool routing, the number check, and the banned-word check, with a fake model.

## 7. What we need from other team members

**Route team (POIs and routing).**

- `RouteResult` for the selected route: `distance_km`, `est_time_min`, `max_slope`, `farthest_from_base_km`, geometry, and `legs[]`.
- Each leg: `activity`, `duration_s`. For 6e, also `distance_m` and `mean_grade_deg`.
- A return route from any point on the route at time t, in the existing `ReturnRoute` format (`lib/mission/types.ts`). This gives time to shelter and the return margin.
- Until these exist, the plan uses the preset schedule and placeholder route values, all labelled.

**Essam (mission engine, service, telemetry scripts).** Agree on W2 (event types and `dust_opacity`) and W5 (`snapshot.inference` and the outlook endpoint). Also agree on W6 items 6a, 6b, and 6d. W4 needs the acquisition change.

**Joseph (flight rules and Mars clock).** This plan reads `FLIGHT_RULES`, `evaluateEva`, `solarAlertLevel`, and `readMarsClock` without changes. Check that the reason codes in W5 match the rule names.

**M (UI).** The verdict banner reads `snapshot.inference.verdict`. An optional outlook strip reads `/outlook`. The UI shows the provenance labels next to each value.

## 8. Demo scenario

Times are mission seconds in the existing preset schedule (travel 600 to 1800, science 1800 to 2400, return 2400 to 3600). The base local time at the start is about 07:37 LMST.

| Mission time  | Event                                                        | Expected result                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0             | Mission starts at base                                       | Verdict GO. Sun 35° up. Dose rate about 8 µGy/h.                                                                                                                                    |
| 600           | Walk starts                                                  | LARA can answer weather, sun, and resource questions.                                                                                                                               |
| 900           | `solar_flare`, class X1.0                                    | Alert `watch`. Verdict CAUTION, limiting factor `radiation` ("stay within 1 hour of base"). LARA announces it with the time to shelter. Radiation forecast confidence drops to low. |
| after CAUTION | Crew sends `begin_return` (6b)                               | Return legs start. Return margin and time to shelter show in the UI.                                                                                                                |
| 1500          | `solar_particle_event`, peak 24 µGy/h, rise 600 s, decay 3 h | Dose rate starts to rise.                                                                                                                                                           |
| about 1875    | Dose rate crosses 18 µGy/h                                   | The dose-rate rule also fires. LARA announces the rate and the caution limit.                                                                                                       |

At playback speed 10×, CAUTION comes 1.5 minutes into the demo. The dose crossing comes after about 3 minutes.

If the crew does not turn back, the walk continues under CAUTION. To show NO-GO, set `above_100_mev: true` on the SEP. The alert then goes to `warning`.

The SEP numbers and the flare class are demo values. Change them in the scenario preset, not in code.

## 9. Order of work

Estimates are rough and assume AI-assisted work. Feature freeze is about 6 hours before the deadline (CLAUDE.md §8).

| Priority                   | Work                                                                                                                                                                                   | Estimate  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **P0: demo moment**        | W1 sun, W2 events, W3 radiation, W5 verdict without outlook, W6 item 6a base location, W7 tools `sun_status`, `radiation_forecast`, `space_weather`, `eva_verdict`, prompt, and alerts | about 7 h |
| **P1: weather and return** | W4 weather (acquisition, climatology, forecast, `weather_forecast`), W5 outlook, W6 items 6b and 6c                                                                                    | about 6 h |
| **P2: quality and depth**  | W8 checks and evals, W6 items 6d and 6e                                                                                                                                                | about 4 h |

P0 is demo-ready without the route team. It uses placeholder route values, labelled.

## 10. Open decisions

Each item has a default. The default applies if nobody objects.

1. **Weather now.** Default: the sol-816 measurement at the base's LMST. Other option: keep the UTC-aligned sample, labelled "Jezero now".
2. **Pressure adjustment for elevation.** Default: none, labelled. Other option: scale with `p = p_J * exp(-(z_base - z_J) / H)`, with both elevations from MOLA and H about 11 km (assumption).
3. **Demo SEP size.** Default: 24 µGy/h peak (CAUTION). Other option: a May 2024 size event (about 309 µGy/h) to show NO-GO.
4. **Script language for the climatology.** Default: Python, next to `acquire.py` and `prepare.py`. CLAUDE.md says pipelines are TypeScript, but the telemetry scripts already use Python.
5. **Sol epoch.** Default: Perseverance landing, so sols match the MEDA files. Other option: a mission epoch for the base.
6. **Where `inference` lives in the API.** Default: a field on the snapshot plus the outlook endpoint. Other option: only the endpoint, which keeps snapshots smaller.

## 11. Out of scope

- Trained or learned forecast models. CLAUDE.md §2 rules them out.
- Live DONKI data. The scenario scripts the flare and the SEP. A DONKI replay is a stretch goal.
- Crew dose equivalent, dose-to-risk conversion, and shielding. RAD gives absorbed dose rate in a detector only.
- Wind, CO2 removal, suit cooling, and thermal models.
- RAG. The `flight_rule` tool already returns each rule's source. CLAUDE.md §2 allows RAG only to explain verdicts.

## 12. Values to check before use

| Value                                             | Used in          | Status                              |
| ------------------------------------------------- | ---------------- | ----------------------------------- |
| Energy equivalent of oxygen, about 20.1 kJ/L      | W6 item 6e       | Not checked against a source        |
| Pandolf equation coefficients and gravity scaling | W6 item 6e       | Not checked against a source        |
| `tau = 3 h` anomaly decay                         | W4               | Team assumption                     |
| SEP `rise_s` and `decay_s` defaults               | W3, demo         | Demo values, not fitted to an event |
| Typical SEP length at Mars (hours to days)        | W3 forecast text | Not checked against a source        |
| Perseverance landing time 2021-02-18 20:55 UTC    | W1               | Check against the Mars clock tests  |
