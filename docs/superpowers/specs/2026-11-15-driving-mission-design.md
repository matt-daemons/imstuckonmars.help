# Driving mission (rover): design

Date: 15 November 2026. Size: a project (three tasks). Builds on the A* route planner and the route panel polish.

## Why

The team switched the main scenario from walking to driving: the water-ice sites are 93–468 km from the habitat, and the risk the team wants to show is the battery running low on bad terrain. The user asked to keep walking and add driving as a choice, with limits taken from what NASA recommends.

## What the research found

Sourced report (about 250 numbers, nearly all confirmed against the source): `docs/research/rover/rover_guidelines_research.md`; proposed rule table: `docs/research/rover/proposed_rover_rules.md`. The short version:

- NASA's Mars plans use a small pressurized rover: 2 crew inside (4 in an emergency), two rovers travel together, trips of 1–2 weeks within about 100 km of base (DRA 5.0; Exploration Zone studies).
- One 200 kWh charge (NASA Mars Architecture Team rover, 2022) covers roughly 30 km out and back. Multi-sol trips recharge on the way: about 14 km/sol with solar, 46 km/sol with deployed fission power (Rucker 2015).
- No NASA concept reaches beyond about 200 km. No NASA battery-reserve rule or measured Mars rolling resistance exists; those values are labelled assumptions.
- On 463 m MOLA terrain, slopes read about 6° low, so the slope limits drop to 5° caution / 10° no-go (assumption).

## Approaches

| Approach                                                                       | Trade-off                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A. One charge, no stops                                                        | Simple and honest, but every site is NO-GO, so the demo only explains why                                           |
| **B. Multi-sol trip with a Solar / Fission power choice (picked by the user)** | Matches NASA's own trip concept; nearest site GO with fission and NO-GO with solar; far sites NO-GO with the reason |

## Design

- **Mode switch** at the top of the route panel: Walking / Driving. Walking is unchanged.
- **Driving terrain:** a 463 m strip cut from the USGS/NASA MOLA global mosaic by a TypeScript pipeline (HTTP range requests, no GDAL), 42.5–48.5° N and 171–196° E across the ±180° line, stored as Int16 in `public/data/processed/rover/`. Longitudes inside the strip run 171–196 (east-positive, continuous); points west of 0 are shifted by +360 before lookup.
- **A\* in driving mode minimizes energy**, not distance: the same A\* with a step-cost function. Step energy (Wh) = traction `m·g·max(0, k·Crr·cosθ + sinθ)·d / η / 3600` plus life support `P_hotel × time`, speed `8 − 0.175·|θ°|` km/h. Downhill returns nothing. The heuristic is straight-line metres × life-support energy per metre at top speed, which never overestimates.
- **Trip check (Plan B):** out and back are both planned. Odometer = path length × 1.3. Sols = odometer ÷ progress rate (solar 14, fission 46 km/sol). The trip is split into sol-sized pieces; the hardest piece's nominal energy (plus 12.3 h of overnight life support for solar) gives the battery left after that day and the drive-back reserve (energy above the 20 % floor ÷ bad-terrain energy per km).
- **Rover rules** (new `lib/flight-rules/rover-rules.ts`, each with its source and `applies_to`): slope 5° / 10° on coarse terrain; battery left after the hardest day 30 % / 20 %; drive-back reserve 20 km / 10 km; straight-line range with two rovers 100 km / 200 km; trip length 7 / 14 sols. The verdict reads like the walking one.
- **Panel in driving mode:** destination picker (the four HiRISE sites), Power: Fission / Solar (Fission default, NASA's DRA 5.0 baseline), verdict first, readouts (one way, round trip, sols, battery after the hardest day, drive-back reserve, steepest slope), caveats behind "Assumptions and data", "Not checked: radiation, dust, daylight, rocks." visible.

## Calls made by the builder (not decided by the team)

- Fission is the default power source; Solar is the comparison.
- Overnight life support is drawn from the battery only with solar (12.3 h, half a sol); with fission, deployed power is assumed to cover it.
- The rover rules are a proposal from Role C's research, labelled as such; Role A owns flight rules and may change any value. They are kept out of `config.yaml` for now.
- No-go zones are shared between walking and driving.
- The terrain strip ships as a static file in the repo (about 5 MB) because GDAL is broken on this machine and R2 uploads belong to M.
- If planning on the full 463 m strip takes more than about 2 s per leg in the browser, the strip is downsampled to 926 m.

## Expected results (for checking, not promises)

| Site                   | Straight line | Fission                                | Solar                 |
| ---------------------- | ------------- | -------------------------------------- | --------------------- |
| ESP_033225             | 93 km         | GO (about 6 sols)                      | NO-GO (about 18 sols) |
| ESP_034082             | 194 km        | CAUTION (beyond 100 km; about 12 sols) | NO-GO                 |
| ESP_037352, ESP_054060 | 424, 468 km   | NO-GO (beyond 200 km)                  | NO-GO                 |

## Out of scope

Recharge stops as map points, rock cover, cross-slope, sun and dust timing, the full mission timeline, CTX-resolution terrain.
