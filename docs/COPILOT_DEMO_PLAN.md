# LARA copilot: in-scope demo work plan (v2)

Status: revised after four reviews, Sat Nov 14, 2026, 23:30. Owner: tai-shis (LARA copilot).

This plan covers only the work that the LARA copilot owner can do alone. It is the executable subset of [INFERENCE_PLAN.md](INFERENCE_PLAN.md). Section 7 lists the work that needs another team member, with a message to send to each one.

## 0. What changed from v1

Four reviewers checked v1 for demo value, scope, time, and technical correctness. They ran the real engine, clock, and verdict code on the sol-816 data. These are the changes:

| v1                                                          | v2                                                                                                    | Reason                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path B was a suit oxygen leak                               | Path B is a **suit battery module failure**                                                           | The leak needed 11 to 28 times the crew's breathing rate to cross reserve. The battery failure gives a forecast and then a confirmation (section 2). |
| Bare GO from `evaluateEva` with `max_slope: 0` and dust 0.4 | **"No checked rule fails"**, with slope and dust listed as not checked, plus engine resource findings | A made-up slope and dust value fed a GO. The verdict also stayed GO while the suit was below reserve.                                                |
| New verdict endpoint                                        | **No new endpoint.** One pure function, used by the tool and the panel                                | Less code. One place computes the verdict.                                                                                                           |
| Weather at the base's local time (T5)                       | **Held for the team's proxy decision.** Only today's misleading label is fixed.                       | AGENTS.md:43 and BACKEND.md:122 forbid it as written.                                                                                                |
| Answer number checker                                       | **Banned words and "at least one tool call" only**                                                    | The number checker would reject 20 to 40 % of honest spoken answers.                                                                                 |
| Alerts went through the model                               | **Fixed sentences from the numbers, spoken at once**                                                  | Works when the model is slow or down.                                                                                                                |
| Panel theme fix first                                       | **Verdict, activity, and quick questions first**                                                      | Judges see these. Judges do not see corner radii.                                                                                                    |
| Play 10×                                                    | **Play 20×**                                                                                          | At 10×, the first alert came after 5.6 min.                                                                                                          |
| T8 doc corrections, T9 eval script                          | Cut. A 6-question rehearsal list instead.                                                             | No demo value before freeze.                                                                                                                         |
| 11.5 h of work                                              | About 8 h to the cut line                                                                             | The reviewed estimate for v1 was 14 h.                                                                                                               |

## 1. Scope and time

**In scope** means one of these:

- A file that only tai-shis has committed to: `server/api/copilot.ts`, `server/copilot/*`, `components/copilot/*`, `lib/copilot/*`.
- A new file under `lib/inference/`.
- `docs/INFERENCE_PLAN.md` and this file.

`scripts/telemetry/` belongs to Essam, so this plan adds no file there. The plan calls other people's functions (`createSession`, `sessionFor`, `command`, `evaluateMission`, `evaluateEva`, `readMarsClock`) and does not edit them.

**One blocker for pushing.** `lib/inference/local-time.ts` uses `ltst`, which exists only as an uncommitted edit in Joseph's `lib/mars-time/mars-clock.ts`. Nothing under `lib/inference/` can be pushed until Joseph approves that edit. Until then, new code must use only fields that exist at HEAD (`lmst`, `sun_elevation`, `minutes_until_sunset`).

| Item                                 | Value             | Status                                                                                           |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------ |
| Now                                  | Sat Nov 14, 23:30 | Measured                                                                                         |
| Submission deadline                  | Sun Nov 15, 23:59 | **ASSUMPTION. Confirm it before sleeping.**                                                      |
| Demo format                          | Unknown           | **Confirm it.** A reviewer recalls a 30-second video or 7 slides limit. Nobody has checked this. |
| Cut line (bug fixes only after this) | Sun 15:30         | From the time review                                                                             |
| Feature freeze                       | Sun 18:00         | CLAUDE.md §8                                                                                     |
| Backup demo recording                | By Sun 14:00      | From the demo review                                                                             |

Measured overhead: the full pre-push check takes about 25 s. CI and deploy take about 2 to 2.5 min. Each browser and voice check takes 10 to 15 min.

## 2. The demo

### Path B: suit battery module failure (in scope, the main demo)

The event type `battery_failure` already exists. It lowers a battery's capacity. The engine already adds the reason code `eva_battery_below_reserve` when the suit battery falls below its 150 Wh reserve. The forecast tools already exist.

Event: `{ id: "demo-suit-battery", at_s: 1800, type: "battery_failure", target: "eva", value: 220 }`.

Numbers from the real engine with `demo-preset.json` (checked twice, Nov 14):

| Mission time | Wall clock at 20× from 60 s | What happens                                                                                           | Suit battery |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| 60 s         | 0 s                         | Demo starts at base. Dose rate valid from 52 s.                                                        | 1,000 Wh     |
| 600 s        | 27 s                        | Walk starts                                                                                            |              |
| 1,799 s      | 87 s                        | End of travel                                                                                          | 941.2 Wh     |
| 1,800 s      | 87 s                        | **Module fails at the science stop.** LARA announces it at once.                                       | 219.9 Wh     |
| 1,810 s      | 88 s                        | `time_to_reserve` forecasts the reserve crossing at **3,108 s (mission minute 52)**, medium confidence |              |
| 2,400 s      | 117 s                       | Return starts                                                                                          | 184.7 Wh     |
| 3,108 s      | 152 s                       | **Crossing confirmed.** `eva_battery_below_reserve`. LARA announces it.                                | 150.0 Wh     |
| 3,600 s      | 177 s                       | Back at base. 24 Wh below reserve.                                                                     | 125.9 Wh     |

No other reason code fires. Base oxygen and base battery stay above their reserves.

The story: "A battery module failed at the science stop. LARA forecast that the suit would cross its reserve 8 minutes before reaching base. The crew walked back at once. The forecast was right." This matches the CLAUDE.md idea of a forecast with a stated confidence.

### Path A: SEP flip (add-on, needs Essam's event types)

1. A scripted `solar_flare` raises the alert to watch. `evaluateEva` returns CAUTION (rule "radiation", "stay within 1 hour of base").
2. A scripted SEP raises the dose rate above 18 µGy/h. The dose-rate rule also fires.

The local RAD data is quiet (7.8 to 8.5 µGy/h), so the flip cannot happen without the scripted events. **Decision point at Sun 11:30:** if Essam's change has not landed, choose between a slide and the in-scope fallback in section 7 (a scripted SEP profile in the copilot layer, labelled).

## 3. Facts this plan depends on

All of these were checked against code or data on Nov 14.

1. `POST /api/copilot/session` (`server/api/copilot.ts:72-86`, tai-shis) creates the demo mission from the D1 preset. The client reads `id` and `token` from the response (`use-lara.ts:71-74`).
2. `createSession` returns `{ id, token, revision, expires_ms, config, clock, provenance }`. `command()` needs the full session row, so call `sessionFor(db, id, "Bearer " + token)` before each command (`server/mission/service.ts:62, 188-196, 265`).
3. Events must be added while the clock is before their `at_s` (`past_event`, `service.ts:379`). `seek` sets the clock to paused (`:339-343`).
4. `parseConfig` keeps only known fields. The preset base id is `"hypothetical-base"`. `assessReturn` rejects a route whose `base_id` differs, so keep that id and change only the coordinates.
5. The habitat in `stops.geojson` is at (−176.05, 45.97). At the start of the run, the base reads LMST 07:36:55 with the Sun 35.3° up and sunset 746 min away. The sol (816) is a Perseverance mission sol.
6. The RAD observation that covers 0 to 52 s is flagged, so the dose rate is null until then.
7. `evaluateEva` has no rule that reads suit oxygen or battery. With the schedule's route values (50 min, 0.67 km), slope 0, dust 0.4, dose 8, and no alert, it returns GO.
8. `use-lara.ts` speaks only the first new code per poll and marks the rest seen (`:166-185`). `ask` returns at once when busy (`:133`). A code that fails to send is lost, because `seenReasons` updates first.
9. `busy` is a ref, so an effect does not re-run when it changes. `ask` closes over `turns`.
10. The panel formats mission time as h:mm (`lara-panel.tsx:27-30`) and hardcodes 10× (`:117`). The clock accepts speeds up to 100.
11. Vitest runs in node, with no jsdom. React logic must live in pure functions to be tested.
12. Today's weather comes from Jezero at the same SCLK second. At the base's morning, that is Jezero at night (about 00:39 to 03:58 LTST), presented as current weather. It is the most misleading label in LARA today.

## 4. Tasks, in order

Each task lists: goal, files, steps, tests, the check in the running app, estimate, and the cut line.

### T1. Demo session: base coordinates, start time, battery event, 20× (P0, 2 h)

**Goal.** The demo mission sits at the Arcadia habitat, starts when the dose rate is valid, carries the Path B event, and plays at 20×.

**Files.** New `server/copilot/demo-mission.ts` and test. Edit `server/api/copilot.ts` and `components/copilot/lara-panel.tsx`.

**Steps.**

1. `ARCADIA_HABITAT = { latitude_deg: 45.97, longitude_deg: -176.05 }`, with a comment that it must match the habitat in `stops.geojson`.
2. `demoMissionConfig(preset)` copies the preset and replaces only `base.latitude_deg` and `base.longitude_deg`. It keeps `base.id`.
3. `DEMO_START_S = 60` and `DEMO_EVENTS = [the Path B event]`.
4. In `POST /session`:
   1. `createSession(db, release, demoMissionConfig(preset))`.
   2. For each event: `sessionFor(db, id, "Bearer " + token)`, then `command(db, session, { command_id: crypto.randomUUID(), expected_revision: session.revision, type: "event", event })`.
   3. The same for `{ type: "seek", at_s: DEMO_START_S }`.
   4. Return the `createSession` result unchanged, so the client still gets `id` and `token`.
5. In `lara-panel.tsx`, change the play button from 10× to 20× (`DEMO_SPEED = 20`).
6. Show mission time as m:ss, so it moves every second at 20×.

**Tests.** Use synthetic MOXIE samples, as `engine.test.ts:23` does. The suit battery does not depend on MOXIE.

- `demoMissionConfig` changes only the base coordinates, and the result passes `parseConfig`.
- With `DEMO_EVENTS`: no reason code before 3,108 s. `eva_battery_below_reserve` from 3,108 s. None of the base codes fire.
- `projectResources` at 1,810 s forecasts the suit battery crossing at 3,108 ± 5 s.

**Check in the app.** `pnpm dev`. The panel shows 1:00. Press Play 20×. At about 87 s, the battery drops to about 220 Wh. At about 152 s, LARA announces the reserve crossing.

**Measure.** The time `POST /session` takes, because each command reloads the trace. If it is over 3 s, note it in section 8.

**Cut line.** Keep steps 1 to 4. Drop step 6.

### T2. Alerts that are never lost and do not need the model (P0, 1.5 h)

**Goal.** Each new event and reason code is shown and spoken once, in order, within about 1 second, even when LARA is busy or the model is down.

**Files.** New `lib/copilot/alerts.ts` and test. Edit `components/copilot/use-lara.ts` and `components/copilot/lara-panel.tsx`.

**Steps.**

1. Pure functions in `lib/copilot/alerts.ts`:
   - `newAlerts(previous, snapshot)` returns new items from `state.applied_event_ids` and `state.reasons`, compared with the previous poll. On the first poll it returns nothing, as today.
   - `alertSentence(item, snapshot)` returns a fixed English sentence with numbers. Examples:
     - Event `demo-suit-battery`: "Suit battery module failure. Capacity is now 220 watt-hours. Ask me when you will reach reserve."
     - Code `eva_battery_below_reserve`: "Suit battery is below its reserve: 149 watt-hours, reserve 150."
     - Unknown code: a readable version of the code, with no numbers.
   - `alertLabel(item)` returns a short title for the transcript ("Suit battery failure"), in place of the raw code.
2. In `use-lara.ts`:
   - Keep a queue ref. Each poll appends `newAlerts(...)`.
   - `drain()` checks `busy.current` first. If idle, it takes the head of the queue, checks that the item is still current in the latest snapshot, adds an alert turn with `alertLabel` and `alertSentence`, and speaks the sentence. It calls no model.
   - Call `drain()` after each poll and when a question finishes.
   - Keep `askRef.current = ask`, so `drain` never uses a stale `ask`.
3. If ElevenLabs fails, speak the sentence with the browser's `speechSynthesis`, and show no error banner for that case.
4. In `lara-panel.tsx`, style alert turns differently from questions (a left border in the warning colour, no rounded corners).

**Tests.** `newAlerts`: nothing on the first poll, two items in order when two appear at once, an item again only after it left and came back. `alertSentence`: numbers for each known item, and no numbers for unknown codes.

**Check in the app.** Ask a question at about 85 s, so LARA is busy at 87 s. The failure alert plays after the answer. Turn off the network for the model (wrong `DIAGNOSTICS_API_KEY` in `.dev.vars`). Alerts still play.

**Cut line.** Keep steps 1 and 2. Drop 3 and 4.

### T3. Sun and local time tool (P0, 1 h)

**Goal.** LARA answers "What time is it at base?", "How high is the Sun?", and "When is sunset?".

**Files.** Edit `server/copilot/tools.ts` and `server/copilot/llm.ts`.

**Steps.**

1. Tool `sun_status`, no arguments. It reads `utc_ms` from the current MOXIE sample and `latitude_deg` and `longitude_deg` from `config.base`. It calls `readMarsClock` directly, with `PERSEVERANCE_LANDING_UTC` as the epoch. No wrapper module.
2. Map the fields: `sun_elevation` to `sun_elevation_deg`, and so on. `minutes_until_sunset` can be null. If `utc_ms` is null, return `status: "unavailable"`.
3. Labels in the output: "Computed with Mars24. Sunset is geometric, with no terrain horizon. The sol counts from Perseverance's landing. The mission clock replays 2023 archive time."
4. Use only HEAD fields until Joseph approves `ltst`. Then add `ltst`.
5. One prompt line: "For time of day, Sun position, or sunset, call sun_status."

`PERSEVERANCE_LANDING_UTC` lives in `lib/inference/local-time.ts`, which is blocked. Until Joseph approves, define the constant in `server/copilot/tools.ts` and move it later.

**Tests.** At 2023-06-06T15:19:16Z at the habitat: LMST 07:36:55, elevation 35.34 ± 0.05°, sunset 746 ± 1 min.

**Check in the app.** Ask "When is sunset?". LARA answers about 12 hours and names the method.

### T4. Verdict tool and verdict function (P0, 1.5 h)

**Goal.** LARA states what the flight rules say, which rules it could not check, and whether the resource model reports a reserve problem. All of this comes from one pure function.

**Files.** New `lib/inference/verdict.ts` and test. Edit `server/copilot/tools.ts` and `server/copilot/llm.ts`.

**Steps.**

1. `verdictFromSnapshot(snapshot)`, a pure function with no I/O. The panel can call it too.
   - Route values from the schedule: `est_time_min` is the sum of the non-base entries. `farthest_from_base_km` is outbound travel time × 2 km/h. Label it "from the planned schedule at the walk-back pace of 2 km/h, not from a route".
   - `radiation_dose_rate`: RAD detector E ÷ 24, or null.
   - `solar_alert_level`: `"none"`, labelled "no space-weather events in this scenario".
   - `minutes_until_sunset`: from `readMarsClock`, minus the remaining planned walk time.
   - Slope and dust have no source. Do not invent values. Pass neutral values to `evaluateEva` only to run the other checks. Put both in `not_checked`, and remove any finding from those two rules.
2. Output:
   - `flight_rules`: `{ status: "no_checked_rule_fails" | "CAUTION" | "NO_GO" | "unknown", limiting_factor, reasons, not_checked: ["slope", "dust"], sources }`. `unknown` when the dose rate is null.
   - `resources`: the engine reason codes that start with `eva_` or `base_`, with their numbers.
   - `summary`: one sentence. Examples: "No checked flight rule fails. Slope and dust are not checked." or "No checked flight rule fails, but the suit battery is below its reserve."
3. Tool `eva_verdict` returns that object.
4. Prompt: "For go or no-go questions, call eva_verdict. Never say GO on its own. Name the rules that were not checked and any resource finding."

**Tests.** The preset gives 50 min and 0.67 km. A null dose gives `unknown`. Dose 20 gives CAUTION with `dose_rate`. Farthest 5.44 km gives NO_GO with `walk_back`. A snapshot with `eva_battery_below_reserve` puts it in `resources` and in `summary`.

**Check in the app.** Ask "Are we go?" at 1:00 and after 3,108 s. The second answer mentions the suit battery.

### T5. Panel: verdict, activity, and quick questions (P0, 1 h)

**Goal.** Judges can see the state of the walk without reading the transcript.

**Files.** `components/copilot/lara-panel.tsx`, `components/copilot/use-lara.ts` (snapshot type only).

**Steps.**

1. Add three readouts: **Activity** (base, travel, science, return), **Flight rules** (from `verdictFromSnapshot`, with "slope and dust not checked" as a note), and **Base time** (LMST from `readMarsClock` in the browser).
2. Add four quick-question buttons: "Are we go?", "When do I hit reserve?", "Can I make it back?", and "When is sunset?". Each calls `ask` with the same text.
3. Extend the `MissionSnapshot` type in `use-lara.ts` with the fields these need (`observed.moxie.utc_ms`, `config.base`, `config.schedule`, `state.applied_event_ids`).
4. Last, the theme rule: remove `rounded-*` and `shadow-lg` (about 10 min).

**Cut line.** Keep steps 1 and 2.

### T6. Weather label fix (P1, 0.5 h)

**Goal.** Stop presenting Jezero night temperatures as current weather at the base. Make no proxy decision.

**Files.** `server/copilot/tools.ts`, `server/copilot/llm.ts`.

**Steps.**

1. In `environmentSummary`, add Jezero's local time to the output (from `readMarsClock` at `JEZERO_MEDA_SITE`). Label: "Measured at Jezero crater at the same moment. It is HH:MM local time there. This is not weather at the base."
2. Replace "no data" wording for `sampling_gap` with "MEDA was not sampling at this moment."
3. In the prompt, replace "used as a proxy for the base" with "measured at Jezero crater, not at the base", and replace "Dust and wind are not available" with "Dust is not measured. Wind is not available, because the MEDA wind sensor has no data after sol 313."

If the team approves the labelled proxy, the full weather task from v1 returns as T9.

### T7. Answer checks, small (P1, 0.5 h)

**Files.** New `server/copilot/answer-check.ts` and test. Edit `server/copilot/llm.ts`.

**Steps.**

1. `bannedWords(answer)` with whole-word matching for "safe", "unsafe", "dangerous", and "healthy". For "fine", allow "fine-grained" and "fine dust".
2. If the answer to a question used no tool at all, and it contains a digit, send one correction ("Call a tool before stating numbers.").
3. On a second failure, return a fixed fallback: "I could not check that against the mission data. Please ask again."

Number matching is out. It stays a stretch goal, as log-only.

### T8. Rehearsal list (P1, 0.25 h)

Six questions, written in section 6, tried at 1:00, 1,810 s, and 3,200 s before recording. Note which answers are wrong and fix the tool descriptions.

### T9. Weather at the base's local time (only if the team approves the proxy)

The v1 T5, with these corrections from the reviews:

- Bin in TypeScript under `lib/inference/` with a vitest test, not in Python. CI runs no Python.
- Bin centres are uneven: about hh:17 in the 16-minute hours, hh:30 in the full hours 13 to 18, and about hh:34 in hours 2, 12, 20, and 22.
- Filter pressure outside 500 to 1,200 Pa. Two rows are 999,999,999 Pa.
- Give `nearest_bin_offset_min`. Flag `interpolated_across_gap` when the bracketing centres are more than 1.5 h apart, as in the gap from 10:17 to 12:34 LTST.
- Confidence is always low (one sol).

## 5. Schedule

| Time               | Work                                                                   | Done when                                                          |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Sat 23:30 to 23:45 | Send the section 7 messages. Confirm the deadline and the demo format. | Messages sent                                                      |
| 23:45 to 01:30     | T1                                                                     | Path B plays at 20× in local dev. **Hard stop 01:30.**             |
| 01:30 to 08:30     | Sleep                                                                  |                                                                    |
| 08:30 to 10:00     | T2                                                                     | Alerts play with the model off                                     |
| 10:00 to 11:30     | T3, T4                                                                 | "When is sunset?" and "Are we go?" answered correctly              |
| 11:30              | **Path A decision**                                                    | Essam's event types landed or not                                  |
| 11:30 to 12:30     | T5                                                                     | Panel shows activity, flight rules, base time, and quick questions |
| 12:30 to 13:00     | Rebase, push, and check in production                                  | Deployed                                                           |
| 13:00 to 14:00     | T6, T7, T8. **Record a backup demo video.**                            | Backup video exists                                                |
| 14:00 to 15:30     | Path A if it landed, or T9 if the proxy was approved, or polish        |                                                                    |
| **15:30**          | **Cut line. Bug fixes only.**                                          |                                                                    |
| 15:30 to 18:00     | Rehearse, record the final clip, and give M the script                 |                                                                    |

Drop order, if the plan runs late: T8, T7, T6, T5 step 4, T2 steps 3 and 4, T5 step 2.

Before each task: `git pull --rebase`. Essam changed `service.ts` and `validation.ts` on Nov 14, and other people push often. Before each push: `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Commit style: `area(type): Summary`. Deploy the demo build before 15:30, because a deploy-pause switch now exists in CI.

## 6. Rehearsal questions

1. "When is sunset?" at 1:00. Expect about 12 h, Mars24, geometric.
2. "Are we go?" at 1:00. Expect "no checked flight rule fails", slope and dust not checked.
3. "What is the radiation level?" at 1:00. Expect about 8 µGy/h, Gale, absorbed dose rate, below the 18 µGy/h caution threshold.
4. "When do I hit reserve?" at 1,810 s. Expect the suit battery at about mission minute 52, medium confidence.
5. "Can I make it back?" at 1,810 s. Expect the margin from the projection, a shortfall of about 24 Wh at base.
6. "Are we go?" at 3,200 s. Expect the suit battery below reserve in the summary.

## 7. Requests to other team members

Send these first. Path A needs the first one.

**To Essam (mission engine).** "Can you add three event types to `ScenarioEvent` and `parseEvent`: `solar_flare { flare_class: string }`, `solar_particle_event { peak_ugy_h, rise_s, decay_s, above_100_mev }`, and `dust_change { value }`? The engine needs no logic for them. Also, LARA's demo session now overrides your preset's base coordinates to the Arcadia habitat (the id stays `hypothetical-base`). Is that OK?"

**To Joseph (flight rules and Mars clock).**

1. "I added `ltst` to `readMarsClock` (two lines, uncommitted). It matches MEDA's LTST column within 1 second on sol 816. Can you review it tonight? My `lib/inference/` code cannot be pushed without it."
2. "`evaluateEva` has no rule for suit consumables. In our demo, the suit battery falls below reserve, but the verdict stays GO. Can we add a rule, for example 'suit oxygen or battery below reserve: NO-GO, return now', citing the engine's reserve?"
3. "A solar alert at watch gives CAUTION on its own. Is that what you intend for the demo?"

**To the route team.** "The placeholder science stop is 5.44 km from base. The 2 km walk-back rule makes that NO-GO, but `route.geojson` says GO. The preset walk covers about 0.67 km. Can the demo target be within 2 km? LARA needs `est_time_min`, `max_slope`, and `farthest_from_base_km`."

**To M (map and UI).** "Can the map move a crew marker along `route.geojson` by the mission's activity and time, and colour the route by verdict? Please keep the illustrative dust-storm button out of the demo, because LARA cannot see it."

**To Jess (CLAUDE.md, shared types).** "The telemetry table lists MEDA wind and dust, which we do not have, and pressure in mbar, which is pascal. Can `Verdict` get `UNKNOWN`?"

**To the team (decision).** "AGENTS.md says never attach Jezero weather or Gale radiation to a base. CLAUDE.md §4 allows a labelled proxy. Which rule wins? Until we decide, LARA labels them as measured at Jezero and Gale, not at the base."

**In-scope Path A fallback (decide at 11:30).** If Essam's change has not landed, a scripted SEP profile in `server/copilot/demo-mission.ts` can feed the dose rate in `verdictFromSnapshot`. It would flip the verdict to CAUTION with no engine change. It is synthetic data in place of a measurement, so it needs the same team decision as the proxy, and it must show as "scripted" in the panel.

## 8. Risks

| Risk                                                            | Effect                            | Mitigation                                                                                  |
| --------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| Joseph does not approve `ltst`                                  | `lib/inference/` cannot be pushed | T3 and T4 use HEAD fields only. Keep `local-time.ts` uncommitted.                           |
| Essam's events do not land                                      | No SEP flip                       | Path B is the demo. Decide at 11:30.                                                        |
| The model is slow or down during the demo                       | No answers to questions           | Alerts need no model (T2). Quick-question buttons make retries easy. Backup video by 14:00. |
| ElevenLabs fails                                                | No voice                          | `speechSynthesis` fallback (T2 step 3)                                                      |
| The wake word model (41 MB) does not load on venue Wi-Fi        | No "Hey LARA"                     | Use push-to-talk or the quick-question buttons                                              |
| `POST /session` is slow, because each command reloads the trace | Slow page load                    | Measure in T1                                                                               |
| The map shows a 5.44 km route tagged GO                         | Judges see a contradiction        | Route team request. Do not record until it is fixed.                                        |
| Teammates change `service.ts`                                   | T1 breaks                         | Rebase before each task                                                                     |
| Deadline earlier than assumed                                   | Later blocks lost                 | P0 first, a cut line in each task                                                           |

## 9. Out of this plan

- Everything in INFERENCE_PLAN.md that needs `lib/mission/`, `server/mission/`, `lib/mars/types.ts`, `lib/flight-rules/`, or `scripts/telemetry/`.
- Radiation forecasts, the outlook endpoint, workload-based oxygen use, and the end-of-trace policy.
- The crew marker and the verdict banner in the map UI (M).
- Corrections to INFERENCE_PLAN.md. They wait until after the hackathon.
