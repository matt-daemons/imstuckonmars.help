# Storms in the route check: design

Date: 15 November 2026. Size: a small change. Approach picked by the user: **real data + drill**.

## Why

Step 03 and the verdict strip say "Not checked: radiation, dust, daylight". The team's demo moment is a solar alert arriving mid-trip and the verdict flipping to CAUTION with a time to shelter. Storms cannot be routed around (a regional dust storm is bigger than the whole trip area, and a solar storm hits the whole surface), so they belong in the go / no-go decision, not in the path.

## Approaches

| Approach                             | Trade-off                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Real data + storm drill (picked)** | Real values where the app has them; a labelled drill guarantees the demo moment                                 |
| Real data only                       | Honest, but solar alerts stay unchecked and the flip depends on the replay                                      |
| Real data + live NASA DONKI alerts   | Most real, but slower: alerts are measured at Earth, need Mars-position logic, and the free key is rate-limited |

## Design

- **Conditions** feed the existing flight rules (`lib/flight-rules/rules.ts`, the checks in `evaluate.ts`) for the **walk** only. The pressurized rover is shelter, so a drive is not checked against storms.
- **Sources:**
  - **Daylight:** `readMarsClock` at the habitat gives minutes until sunset for a walk starting now (real Mars time). The drill can set a start time instead.
  - **Radiation:** dose rate from LARA's mission snapshot (`observed.radiation.observation.dose_rate_e_ugy_day ÷ 24`). This is Curiosity RAD at Gale, a labelled proxy for Arcadia.
  - **Dust:** while the NASA Ames 2018 storm simulation is loaded and shown, its current dust optical depth at the habitat, labelled "simulation".
  - **Solar alert:** no feed. Drill only.
- **Stale is unknown too:** when LARA stops answering (no successful poll for a while), its radiation value counts as unknown and the strip marks LARA's clock as not answering (final-review finding M-3).
- **Unknown is never fine:** each storm check runs only when its value is known. Otherwise the result says "Not checked: …" with the reason (e.g. "load the dust simulation", "LARA unavailable", "no solar-alert feed").
- **Storm drill:** a closed section in step 03. It can set a solar alert (none / watch / warning), a dust opacity, and a start time (local solar time at the habitat). Every drill value is labelled "Drill, not real data" in the reasons, and the strip shows a DRILL tag while any drill value is set. It is off by default.
- **Output:** the walk verdict (walking mission) and the trip verdict (worst of drive and walk) include storm findings. The strip and step 03 show them with the existing limiting factor, margin and time to shelter. When a storm finding limits, time to shelter is the walk back to shelter (the habitat, or the rover in drive + walk).

## Non-goals and anti-goals

- No routing around storms, no rover dust derating, no DONKI fetch, no backend changes, no change to rule values.
- Anti-goal: a drill or simulated value that could be mistaken for real data. Anti-goal: treating a missing value as GO.

## Left to the builder

Where the conditions live (a small context next to the route plan is expected), how the dust frame value at the habitat is read from the dust playback, the drill controls' exact form, and the copy.
