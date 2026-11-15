# Map expedition

The map's **01 Mission → 02 Where → 03 Check → 04 Run** flow couples a simulated crew's position, suit oxygen, battery and elapsed time. The homebase dashboard remains a read-only archive. [Weather risks](WEATHER_RISKS.md) are explicit dust/cold drills affecting modeled resources only, without historical-date integration or scene effects. No AI call is needed to plan, launch, inject a fault, compare alternatives or produce a report.

## Try the loop

1. Choose a walking mission from the habitat, or a drive + walk mission with a parked rover. Set sampling time in 01 Mission and select the destination in 02 Where.
2. In 03 Check, inspect both the terrain verdict and the simulated resource budget. They are separate checks: enough oxygen does not validate terrain. Select a budget leg to inspect its map geometry. Launch opens a mission manifest for explicit review of the selected route, supplies, reserves and warnings.
3. Launch at 1×, 10× or 60×. The crew spends ten simulated minutes preparing before departure. The bottom display holds controls, supplies, alert counts and predicted return margins. Dragging the map disables crew-follow; **Follow** enables it again.
4. During the outbound walk, open 04 Run and inject **Suit oxygen leak**. The confirmed fault adds 600 g/h to suit demand. On the default drive + walk demonstration, continuing then breaches the modeled oxygen reserve.
5. Compare **Turn back now** with **Cut sampling**. Each gives arrival time, remaining sampling and suit reserve margins. Opening a replan confirmation pauses the clock so those predictions do not drift during review. Confirm, then resume with **Play**. Only the remaining schedule changes; the traveled path and resource history remain intact.
6. After return and the configured shelter recovery period, the bottom simulation controls disappear. A brief completion notice leads to the report automatically, or immediately through **Open report**. Inspect recorded supplies, scenario events, replans and completed sampling against the originally launched goal. **Print** uses the browser's print dialog.

To stop before returning, select **End simulation** in the bottom display and confirm. This freezes the server-owned clock, position and inventories, removes the bottom controls and opens the report. It does not move the crew to shelter or count unfinished sampling as completed. The ended state survives reload; launch a new expedition to run again. Pause remains available for a temporary stop.

Completed and operator-ended reports are saved as immutable, read-only copies in browser IndexedDB (the latest 20). **Mission dashboard → Simulation reports**, also `/mission/reports`, lists them separately from NASA experiments. They survive new plans, resets, reloads and session expiry, but do not sync across devices; clearing site data removes them. Reports contain no session capabilities. The provider saves before replacing a finished run, and surfaces fetch/storage failures with Retry rather than silently losing the report. Print can keep an external copy. No D1 history or new account ownership scheme is introduced.

The long drives between named sites remain planner-only. The animated expedition is the walk from the habitat or from the parked rover, not a multi-sol vehicle journey.

## Ownership and contracts

- `components/expedition/expedition-provider.tsx` owns one capability-authenticated session per browser tab. It resumes it from `sessionStorage` and shares the same access with LARA; there is no second mission clock or inventory owner.
- `components/expedition/route-to-plan.ts` adapts the existing map planner. Outbound and return paths/times are taken separately. Display paths are simplified to the server's 600-point-per-leg limit in Mars metric coordinates; this is not new terrain validation.
- `lib/mission/expedition.ts` derives schedule and supplies from the existing preset and flight rules. `lib/mission/position.ts` interpolates position on a sphere of radius 3,396,190 m. `lib/mission/engine.ts` integrates resource use and reports position at the same mission time.
- `lib/mission/outlook.ts` compares deterministic continuations. Recommendations maximize remaining sampling among options that retain both suit reserves and the EVA time limit. Cutting sampling retains an additional ten-minute walking buffer when possible. If no option retains reserves, the UI says so; it does not invent a feasible return.
- `lib/mission/alerts.ts` derives alerts from the snapshot and matching-revision outlook. Acknowledgment, suppression and inhibition affect this tab's display only, never mission constraints.

| Endpoint                          | Contract                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/expeditions`           | Opens an idle Arcadia preset session, ignoring caller-supplied configuration. Returns a session capability and trace-row count. |
| `POST /api/missions/:id/preview`  | Accepts `{ plan }`; computes a budget without changing the session.                                                             |
| `POST /api/missions/:id/commands` | Existing revision/receipt contract, plus `plan` and `replan` commands.                                                          |
| `GET /api/missions/:id/outlook`   | Current plan, two bounded alternatives, predictions, reasons and recommendation.                                                |
| `GET /api/missions/:id/report`    | Configuration, events, final evaluated state and a bounded sampled history, including phase/event boundaries.                   |

The plan shape is `ExpeditionPlan` in `lib/mission/expedition.ts`. A `plan` command resets time and faults. A `replan` accepts `turn_back` or `cut_sampling`. An `end` command persists clock mode `ended` at the current evaluated time; only `reset` or `plan` can change an ended run. Retrying the original end receipt remains idempotent. Reports expose `ended_by_operator`. Event commands may use `at_s: "now"`, resolved by the server at acceptance. `consumption_change` multiplies the selected inventory's demand by 0.1–5. Other supported events are documented in [BACKEND.md](BACKEND.md).

Admission uses `EXPEDITION_LIMITER` (20 opens per minute per client address), the existing atomic active-session cap and a six-hour expiration. No new database migration or observational import is required. The binding must ship with the code.

## Model boundaries

The baseline two-person suits hold 960 g oxygen and 1412 Wh. Minimum reserves are 60 g and 89 Wh, with an eight-hour EVA limit; whole-unit reserves round upward. The simulator itself admits at most six hours including preparation and recovery. Sampling draws a different activity profile from walking. These are illustrative assumptions, not verified suit performance or physiology.

A parked rover receives no MOXIE production. Its fission assumption covers its hotel load; solar charging is not credited. Habitat production uses archived Jezero sol-816 MOXIE engineering rows, clearly separated from Arcadia's simulated position. Those observations are not relocated weather. If an expedition outlasts the MOXIE archive, it may continue with **no production credited**, with an explicit reason. Internal gaps and invalid samples still stop evaluation.

Leaks stop drawing from suits at shelter in expedition mode. A depleted inventory's shortfall includes undelivered leak demand, so predicted deficits do not flatten at the reserve amount. No movement stop or physiological survival outcome is inferred from an empty inventory.

Reports sample history; the farthest distance is labeled sampled, not an exact geospatial maximum. A reserve breach remains a breach even after later replenishment. The report retains original planned sampling through replans.

The browser polls playing snapshots every second and outlooks every four seconds. Extrapolated position/clock stop after 2.6 seconds without a snapshot; stale supplies carry an age and the return verdict is withheld. Out-of-order snapshots/outlooks are discarded. A lost command response retries the same receipt; a revision conflict requires reviewing and confirming again rather than silently applying to changed state.

## Verification

Run `pnpm fmt:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. The existing packaged HTTP suite now covers expedition admission, preview, time/resource/position coupling, a leak, distinct alternatives, stale revisions, a turn-back and the final report:

```sh
ARES_TEST_RELEASE=nasa-demo-50k-v1 ARES_TEST_BOUNDED=1 python3 scripts/telemetry/e2e.py
```

Use the populated local D1 and matching `MISSION_WRITE_KEY` described in [BACKEND.md](BACKEND.md). Do not run this against production without authorization. Browser checks must also cover mobile layout, reduced motion, disconnect/recovery, fault acknowledgment and report dismissal. Synthetic tests establish software behavior, not NASA data validity or operational safety.

Local verification on 2026-11-15: all five project checks passed (375 Vitest tests and 11 model tests), followed by the full packaged HTTP suite. Chrome on the packaged Worker exercised launch, leak injection, acknowledgment, three distinct outcomes, paused replan review, reduced sampling, disconnect/frozen display/recovery, return report, print layout/control and same-tab resume. Layouts were inspected at 1440×900, 1280×720 and 390×844, including reduced motion. A separate walking run verified a 30-minute sampling budget, habitat readouts and the battery-cell-loss warning. Screenshots are local artifacts under `.cache/verified-*.png`; they are not deployed assets. This is local integration evidence, not production load testing or a formal accessibility certification.
