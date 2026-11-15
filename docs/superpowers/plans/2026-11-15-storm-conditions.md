# Storms in the route check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The walk's verdict (and so the strip and step ③) includes dust, radiation, solar-alert and daylight rules, fed by real data where the app has it and by a labelled storm drill.

**Architecture:** A pure `evaluateWithConditions` in `lib/flight-rules/evaluate.ts` runs the existing route checks plus each storm check whose input is known, and lists the unknown ones. A small `ConditionsProvider` gathers the real values (Mars clock, LARA's radiation, the dust frame at the habitat) and the drill overrides; the strip and step ③ use one pure merge to get the final walk or trip verdict.

**Tech Stack:** React 19.3, TypeScript, coss/Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-storm-conditions-design.md`

## Global Constraints

- No change to rule values in `rules.ts` / `config.yaml`, to route maths, to the backend (`server/`, `lib/mission/`), or to coss files (`components/ui/`). No new dependencies.
- Storms apply to the walk only; the pressurized rover is shelter.
- A missing or stale value is "Not checked: <factor> (<reason>)", never GO.
- Every drill value is labelled "Drill, not real data" in its reason; the strip shows a DRILL tag while any drill value is set; the drill is off by default.
- Dust from the simulation is labelled "NASA Ames 2018 storm simulation"; radiation is labelled "Curiosity RAD at Gale, proxy for Arcadia".
- `AGENTS.md` and `.agents/skills/operational-ui-standards/SKILL.md` are binding. Karpathy guidelines; readable code; no AI/Claude credit anywhere.

## Review Focus

1. LARA unavailable or not answering → radiation "Not checked (LARA unavailable / not answering)", verdict not improved by it.
2. It is night at Arcadia now → daylight NO-GO with a reason naming the local time; the drill start time can move the walk into daylight.
3. Dust simulation hidden or not loaded → dust "Not checked (load the dust simulation)"; no stale τ from an old frame.
4. Drive + walk with a solar warning → trip NO-GO, limiting factor radiation, time to shelter = the walk back to the rover.
5. Drill cleared → every drill reason and the DRILL tag disappear at once.

---

### Task 1: Storm checks with unknown inputs (pure)

**Files:** modify `lib/flight-rules/evaluate.ts`; test `lib/flight-rules/evaluate.test.ts`.

```ts
export type StormFactor = "radiation" | "dose_rate" | "dust" | "daylight";
export interface KnownConditions {
  solar_alert_level: SolarAlertLevel | null;
  radiation_dose_rate: number | null; // µGy/h
  dust_opacity: number | null;
  minutes_until_sunset: number | null;
}
export function evaluateWithConditions(
  route: EvaPlan["route"],
  known: KnownConditions,
): EvaVerdict & { not_checked: StormFactor[] };
```

- [ ] Tests first: all four null → same verdict as `evaluateRoute(route)` and `not_checked` = all four; solar `"warning"` → NO_GO, limiting `"radiation"`; dust 2.5 → NO_GO `"dust"`; dust 1.5 → CAUTION; all known and benign → equals `evaluateEva` on the same values; `minutes_until_sunset` −30 → daylight NO_GO. Reuse the existing private check functions; do not change their logic.
- [ ] Implement, run `vitest run lib/flight-rules`, commit `flight-rules(feat): Check storms only when their data is known`.

### Task 2: Conditions, drill and the walk / trip verdict in the UI

**Files:** create `components/route/conditions.ts` (+ `conditions.test.ts`), `components/route/conditions-provider.tsx`, `components/route/steps/storm-drill.tsx`; modify `components/route/verdict-strip.tsx`, `components/route/strip-fields.ts`, `components/route/steps/check-step.tsx`, `components/map/route-result.tsx` and `components/map/journey-result.tsx` (the static "Not checked: radiation, dust, daylight." becomes the dynamic list), `components/map/dust-playback.tsx` (publish the habitat's τ while dust is shown, `null` otherwise — keep the edit small), `components/copilot/use-lara.ts` (read-side only: time of the last successful poll), `components/map/mars-map.tsx` (mount the provider inside `LaraProvider` and around the sidebar and strip).

```ts
// conditions.ts
export type ConditionSource = "real" | "simulation" | "drill";
export interface Conditions extends KnownConditions {
  sources: Partial<Record<StormFactor, ConditionSource>>;
  reasons_unknown: Partial<Record<StormFactor, string>>;
}
export interface Drill {
  solar_alert_level: SolarAlertLevel | null;
  dust_opacity: number | null;
  start_local_hour: number | null;
}
export function mergeConditions(
  real: Conditions,
  drill: Drill,
  sunsetAtHour: (hour: number) => number | null,
): Conditions;
export function walkWithStorms(
  route: EvaPlan["route"],
  conditions: Conditions,
): EvaVerdict & { not_checked: StormFactor[] };
export function tripWithStorms(plan: DriveWalkPlan, conditions: Conditions): TripVerdict; // worse of the drive verdict and walkWithStorms(plan.walk.route)
```

- [ ] Tests first (`conditions.test.ts`): a drill value wins over a real one and marks its source `"drill"`; clearing the drill restores the real value; a drill reason contains "Drill, not real data"; `tripWithStorms` with a solar warning → NO_GO limiting `"radiation"` even when the drive is GO; null dust → `not_checked` includes `"dust"` with the reason text.
- [ ] Real sources in `ConditionsProvider`: daylight from `readMarsClock(new Date(), habitat, <landing date constant>)` refreshed once a minute; radiation = `snapshot.observed.radiation.observation.dose_rate_e_ugy_day / 24` from `useLaraContext()`, unknown when LARA is not ready or its last successful poll is older than three poll intervals; dust from DustPlayback's published value. Drill state lives here too.
- [ ] Strip and step ③ use `walkWithStorms` / `tripWithStorms`; margin for a storm limit: dust (value vs limit), dose rate (value vs limit), daylight (minutes to spare); solar alert has no numeric margin (show the level). Time to shelter stays the walk back (habitat, or rover in drive + walk). DRILL tag in the strip while any drill value is set; LARA's clock shows "LARA not answering" when stale.
- [ ] Storm drill (closed by default) in step ③: solar alert none/watch/warning, dust opacity (off or a number), start time (off or a local solar hour). Coss components only.
- [ ] Full check line; browser check of the Review Focus items at 1440 × 900; commit `route-ui(feat): Storms and a storm drill in the route check`.
