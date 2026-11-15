# Route panel polish: design

Date: 14 November 2026. Size: a project (three tasks). Follows `2026-11-14-astar-routing-design.md`.

## Why

The route panel works, but it was built without the repo's own UI rules (`AGENTS.md` makes `.agents/skills/operational-ui-standards` binding for all UI) and it carries more text than an operator needs. The user asked for every installed frontend skill to be read against it, for the applicable ones to be applied, and for unnecessary text to be removed.

## Approaches

| Approach                                                                 | Trade-off                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Fix the five real defects only                                           | Fast; leaves the squeezed layout, the wall of caveats and the low-contrast map colours |
| **Build all 17 changes plus the one motion change (picked by the user)** | About three tasks of work; the panel file is split into three so each stays readable   |
| Redesign all four map panels together                                    | Out of scope; the sibling panels belong to the UI owner                                |

## How the skills were used

Two read-only agents read all 36 installed frontend skills in full against the panel code and the repo's design system. The full reasoning, skill by skill, is in the sections below (taken from their reports). In short:

- **Applied:** impeccable, accessibility, and the repo's `operational-ui-standards`.
- **Applied in part:** emil-design-eng, frontend-design, ui-polish, unslop, redesign-existing-projects, apple-design, best-practices, web-quality-audit, shadcn, react-best-practices, animate, find-animation-opportunities, review-animations, improve-animations, animation-performance, animation-vocabulary.
- **Not applied:** landing-page, hero, SEO, theme, canvas and GSAP skills (no fit for a small console panel, or they need new dependencies). web-design-guidelines keeps its rules behind a URL that was not fetched.

## Decisions

Decided by the user:

- Build all of it.
- Remove unnecessary text.

Calls made by the builder (not decided by the team):

- **"A\*" and the search count are kept, inside the disclosure**, as one line: `Search: A*, {n} cells searched.` The skills say to delete them as implementation detail; A\* is the team's class project and part of the pitch, so it stays one click away. The title becomes "Route".
- **The panel code is split into three files** so each stays readable: `route-layers.ts` (map sources, layer specs, GeoJSON builders), `route-result.tsx` (verdict, readouts, error messages) and `route-planner.tsx` (state, effects, controls). The split is a pure move, done first.
- **A crosshair cursor shows while a mode is armed**, and the error alert shakes once when a route is rejected (reusing the app's existing toast-error animation, off under reduced motion). Both came from the motion review as cheap feedback.
- **Honesty outranks brevity:** the Earth-hiking-model note and "Not checked: radiation, dust, daylight." stay visible; the elevation source, the slope rule and the route-rule scope move behind "Assumptions and data", one click away. Nothing is deleted except "Cells searched" from the main view and "(A\*)" from the title.
- **Sibling panels are not touched.** Two app-wide issues found on the way are flagged, not fixed: label text below 16 px on every map panel, and `shadow-lg` on panels that the rules say should be flat.

## Hard constraints

- `AGENTS.md` and `.agents/skills/operational-ui-standards/SKILL.md` are binding. Use coss components from `components/ui/` unmodified; no shadcn registry components; no new dependencies.
- Colours come from theme tokens in `app/globals.css`.
- Flight-rule limits and reason sentences come from `lib/flight-rules/`; the panel never retypes a limit.
- Anything invented stays labelled "(placeholder)".

---

# Detailed changes (from the design, polish and accessibility review)

Section numbers below are the review's own; "change N" in the plan refers to these.

## 2. Changes, ranked

Ranked by value, most valuable first. "Lines" means the net change in `route-planner.tsx` unless stated.

### 1. `must`: mode buttons become a `ToggleGroup`, and a second click cancels

- **What:** replace the three `modeButton(...)` calls with:
  ```tsx
  <ToggleGroup
    aria-label="Place on map"
    variant="outline"
    size="sm"
    value={mode ? [mode] : []}
    onValueChange={(v) => chooseMode(v[0] ?? null)}
  >
    <ToggleGroupItem value="start">Set start</ToggleGroupItem>
    <ToggleGroupItem value="end">Set end</ToggleGroupItem>
    <ToggleGroupItem value="zone">Draw no-go zone</ToggleGroupItem>
  </ToggleGroup>
  ```
  Base UI sets `aria-pressed` and `data-pressed`. `globals.css` already gives `[data-slot="toggle"][data-pressed]` the solid primary fill, so the pressed state matches the theme with no new CSS. Clicking the pressed item empties the value, which cancels the mode. Delete the `modeButton` helper. Give Finish zone and Clear zones `size="sm"` so the whole row is the same height (Toggle `sm` and Button `sm` are both `sm:h-7`). The three labels fit in 256 px in the condensed face.
- **From:** accessibility 4.1.2 (name, role, value: the state is not exposed today); repo M-4 (show the current mode) and C-7; impeccable operate.md ("same form-control vocabulary"; the toggle-group is the system's control for mutually exclusive state).
- **Cost:** about −4 lines, one import. Low risk.

### 2. `must`: a half-drawn zone never outlives drawing mode, and Escape cancels

- **What:** add one handler and use it everywhere the mode changes:
  ```tsx
  function chooseMode(next: Mode) {
    if (next !== "zone") setDraft([]);
    setMode(next);
  }
  ```
  While `mode` is set, a `keydown` listener on `window` treats `Escape` as `chooseMode(null)`. Clean it up in the same effect.
- **From:** react-best-practices `rerender-move-effect-to-event` (do this in the handler, not an effect); impeccable harden ("after each interruption the next tap works"); apple-design §16 wayfinding ("how do I get out? never trap the user"); repo M-4.
- **Cost:** about 8 lines. Low risk.

### 3. `must`: double-click while drawing no longer zooms or adds two corners

- **What:** in the map effect, while `mode === "zone"`, call `map.doubleClickZoom.disable()` and re-enable it in cleanup. Add a `dblclick` handler that calls `finishZone()`. The click handler skips a corner identical to the last one, because the two clicks of a double-click land on the same point. Write the click and dblclick handlers with `useEffectEvent`, so they read the current `mode` and `draft` and register once per map. That also removes the "re-registered whenever the mode changes" workaround.
- **From:** apple-design §10 (double-tap detection only where double-tap exists, and here it now means "finish"); impeccable harden (interrupted gestures); react-best-practices `advanced-event-handler-refs` / `useEffectEvent`.
- **Cost:** about 10 lines. Medium risk: `finishZone` must read the current draft, which `useEffectEvent` handles. Test that finishing with fewer than 3 corners still drops the draft.

### 4. `must`: the verdict becomes an `Alert`, and failures go in the same place

- **What:** at the top of `RouteResult`, before the readouts:
  - Change `VERDICT_STYLES` to `{ variant: "success" | "warning" | "error", Icon, label }`, with `CircleCheckIcon` / `TriangleAlertIcon` / `CircleXIcon`. These are the icons `/design-system#alert-levels` assigns.
  - Render `<Alert variant={v.variant} role="status"><v.Icon aria-hidden /><AlertTitle>Route check: {v.label}</AlertTitle><AlertDescription>{reasons…}<p>Not checked: radiation, dust, daylight.</p></AlertDescription></Alert>`.
  - Render the four `STATUS_MESSAGES` and `loadFailed` as `<Alert variant="error" role="status">` in the same slot. Loading stays a plain muted `<p role="status">`.
  - Drop `role="status"` from the wrapper `div`, so only the verdict or error is announced and the readouts are not re-read on every recompute.
- **Why it fixes things:** the `globals.css` status-alert rules colour `alert-title` with `--destructive-foreground` (8.76:1) instead of `text-destructive` (5.62:1 over bright terrain, below K-5's 6:1). The icon gives each level a cue beyond colour. Putting the decision first matches the CLAUDE.md note that the verdict should "read like a flight rule". `role="status"` overrides the component's default `role="alert"`, which would interrupt on every map click.
- **From:** repo K-5, AL-1, K-4, A-6, S-1 (one designated location for status); accessibility 1.4.3 and 4.1.3; impeccable clarify (one fact first, then context); shadcn (an `Alert` for error states instead of placeholder text).
- **Cost:** about +12 lines, imports from `@/components/ui/alert` and lucide. Low risk. Reasons stay verbatim from `evaluateRoute`.

### 5. `must`: start, end and corners can be placed by keyboard

- **What:** while a mode is active, a `keydown` listener on `map.getCanvas()` (Mapbox makes the canvas focusable, and arrow keys pan it) treats `Enter` as a click at `map.getCenter()`, using the same `useEffectEvent` handler as change 3. Show the keys in the mode hint (change 9): `<Kbd>Enter</Kbd> map centre` and `<Kbd>Esc</Kbd> cancel`.
- **From:** accessibility 2.1.1 (placing a point does not depend on the path of the pointer, so WCAG's exception does not apply); repo A-1.
- **Cost:** about 8 lines. Medium risk: the user cannot see the map centre. A later CSS crosshair (pure CSS, no dependency) would fix that, but it is not required for operability.

### 6. `should`: move the panel to the top, left of the Scene panel, on wide screens

- **What:** change the `aside` classes to
  `right-4 bottom-12 max-h-[calc(100svh-31rem)] lg:top-4 lg:right-80 lg:bottom-auto lg:max-h-[calc(100svh-2rem)] overflow-y-auto`
  (`right-80` is 20rem). Below `lg` it keeps today's placement, which is on screen. See section 4.
- **From:** repo L-6 and L-9 (the result must not be squeezed away); impeccable layout (structure must survive the extremes); apple-design §16 familiarity (controls stay in the same place).
- **Cost:** one line. Low risk.

### 7. `should`: cut and shorten the text, and put caveats behind one disclosure

- **What:** apply the section 3 plan. Add `<Collapsible>` with `CollapsibleTrigger render={<Button variant="ghost" size="xs" />}` labelled "Assumptions and data", with a `ChevronDownIcon`. Its `CollapsiblePanel` holds the three secondary caveats as `text-xs text-muted-foreground`. The trigger gets `aria-expanded` from Base UI. Default closed.
- **From:** impeccable distill (progressive disclosure, remove redundancy, remove debug output); polish ("remove debug output"); repo L-1 ("move the rest one level down, don't just shrink it"); frontend-design (each written element does one job).
- **Cost:** about −6 lines. Low risk. The honesty constraints are kept: see section 3.

### 8. `should`: readouts become a `<dl>` in the data face, and the limiting value is marked

- **What:** a two-column `dl` (`grid grid-cols-2 gap-x-4 gap-y-2`) with a local `Readout` that copies the LARA panel's classes: `dt text-xs text-muted-foreground`, `dd font-mono text-sm tabular-nums`, and an optional note `dd text-xs text-muted-foreground`. Rows: Distance one way, Out-and-back time (with the Tobler note), Steepest slope, Farthest from start. Mark only the readout that `check.limiting_factor` names (`slope` → Steepest slope, `walk_back` → Farthest from start, `suit_supply` → time) with `text-destructive-foreground` (NO-GO) or `text-warning-foreground` (CAUTION), plus `<ArrowUpIcon aria-label="Above limit" />`, the pattern in `/design-system#data-states`. This reads the verdict from `lib/flight-rules`, so no limit is copied.
- **From:** repo T-2 (numbers in mono), D-2 (out-of-limit values marked), L-11 (same look as the LARA readouts); best-practices and redesign-existing-projects (semantic HTML); unslop (one number format, tabular).
- **Cost:** about +12 lines. Low risk.

### 9. `should`: show Finish zone only while drawing, and add a mode hint

- **What:** Finish zone renders only when `mode === "zone"`, as `variant="default"`, disabled until `draft.length >= 3`, with the label `Finish zone ({draft.length}/3)` until there are 3 corners. While a mode is active, show one `<p aria-live="polite" className="text-xs text-muted-foreground">`: "Click the map to set the start." / "…to set the end." / "Click the map to add corners." followed by the Kbd hints from change 5. It disappears when the mode ends.
- **From:** impeccable distill (fewer competing actions); web-quality-audit ("no misleading buttons"); repo C-5 (feedback on activation) and M-4.
- **Cost:** about +6 lines. Low risk.

### 10. `should`: error messages say what to do

- **What:** `STATUS_MESSAGES` is panel-owned, so it can be rewritten. Build the slope figure from `MAX_SLOPE_DEG`, which is read from `FLIGHT_RULES`, never typed in.
  - `outside_grid`: "Start or end is outside the elevation grid. Pick a point inside it."
  - `start_blocked`: "Start is on ground steeper than {MAX_SLOPE_DEG}° or in a no-go zone. Set the start somewhere else."
  - `goal_blocked`: "End is on ground steeper than {MAX_SLOPE_DEG}° or in a no-go zone. Set the end somewhere else."
  - `no_path`: "No route avoids ground steeper than {MAX_SLOPE_DEG}° and the no-go zones. Move the end or clear a zone."
  - `loadFailed`: "Elevation grid did not load, so no route can be planned. Reload the page to retry."
  - "Wall" is code jargon. It goes from the UI in favour of "ground steeper than 20°" (T-5: one term).
- **From:** repo S-2 (the design system's own example is a route error); impeccable clarify; frontend-design ("errors… are never vague about what happened").
- **Cost:** 4 string edits plus `MAX_SLOPE_DEG` interpolation. Low risk.

### 11. `should`: map colours come from theme tokens, with a dark border that reads over bright terrain

- **What:** turn `LAYERS` into `layers(token)`, built inside the `[map]` effect with `const css = getComputedStyle(document.documentElement); const token = (n: string) => css.getPropertyValue(n).trim();`. Custom properties resolve their `var()` references, so `--primary` returns `#33d6d9`.
  - Outbound route: `line-color: token("--primary")`, `line-width: 3`, `line-border-width: 1.5`, `line-border-color: token("--background")`.
  - Return leg: `line-color: token("--foreground")` (dashed as now, 3.16:1 already).
  - Zone fill and outline, draft line and draft corners: `token("--destructive")`. Give the outline and draft line `line-border-width: 1`, `line-border-color: token("--background")`.
  - Leave the start and end dot colours (`#7dd3fc` / `#fde68a`) alone. They deliberately match the `stops` layer in `mars-map.tsx`.
- **From:** accessibility 1.4.11 (graphics need 3:1: cyan measures 1.85:1 and red 1.0:1 on bright terrain); shadcn ("avoid ad-hoc hex values; use tokens"); repo K-1/K-3 (meaningful colour comes from the colour table); unslop (semantic colours carry meaning only).
- **Cost:** about 8 lines changed. Medium risk: verify `line-border-*` renders on the globe projection. If it does not, add one casing line layer under `planned-route` instead.

### 12. `should`: one-row map legend

- **What:** under the readouts, one `flex gap-3 text-xs text-muted-foreground` row with three inline swatches drawn as `span`s with borders, no SVG drawing: a solid cyan bar "Out", a dashed light bar "Back", a red square "No-go zone". Mark the swatches `aria-hidden`. The words carry the meaning.
- **From:** repo G-4 ("multiple types use distinct line styles, named in a legend"); frontend-design ("visual structure is information").
- **Cost:** about 8 lines. Low risk. This adds three words. See section 5.

### 13. `should`: confirm Clear zones, because it can turn a NO-GO into a GO

- **What:** Clear zones becomes `variant="destructive-outline"`, disabled when `zones.length === 0`, and opens `<AlertDialog>` with `<AlertDialogPopup data-hazard>` titled "Clear {n} no-go zones?". The description reads "Routes will no longer avoid them. This includes the example zone." The buttons are `AlertDialogClose` "Cancel" (ghost) and "Clear zones" (destructive), following the `/design-system#alert-dialog` demo.
- **From:** repo C-1 and C-3 (hazard tape on confirmations of dangerous actions); shadcn (`AlertDialog` for destructive actions); apple-design §16 agency (confirm only when really destructive, which this is: it changes the safety verdict).
- **Cost:** about +18 lines. Low risk.

### 14. `should`: name the landmark

- **What:** `<aside aria-labelledby="route-title">` with `id="route-title"` on the `h2`, or `aria-label="Route planner"`, as `lara-panel.tsx` does. There are four `aside`s on the page. Change `space-y-3` to `flex flex-col gap-3` while editing the class string.
- **From:** accessibility (landmark regions, 1.3.1); impeccable layout ("use `gap` for sibling rhythm").
- **Cost:** 1 line. No risk.

### 15. `nice`: start and end differ by more than colour

- **What:** in `route-ends`, use `circle-radius: ["match", ["get", "end"], "start", 5, 7]`, or give the end a hollow ring (`circle-color` = background, `circle-stroke-color` = `#fde68a`). The legend from change 12 can name them if wanted.
- **From:** repo K-4; accessibility 1.4.1.
- **Cost:** 1 to 2 lines.

### 16. `nice`: give the route colour a row in the colour table

- **What:** in `app/design-system/_demos/operational.tsx` `colorTable`, add `{ token: "primary", meaning: "Chrome accent; planned route line on the map" }` and `destructive` → "…, no-go zones on the map".
- **From:** repo K-3; `AGENTS.md` ("when you add… a token… add it there too").
- **Cost:** 2 lines in the design-system demo.

### 17. `nice`: group the spacing

- **What:** with `gap-3` between groups (controls, result, zones and legend, disclosure), use `gap-1` inside a group. Do not add separators: proximity does the job.
- **From:** unslop spacing pass ("space inside a group is smaller than between groups"); impeccable layout.
- **Cost:** class edits only.

Motion is out of scope here. `survey-motion.md` in this folder covers it, and the only item there is the optional ±3 px shake on the failure line, which would now sit on the error `Alert`.

---

## 3. Text plan

Disclosure label: **"Assumptions and data"** (a `CollapsibleTrigger`, closed by default). It matches the project's own term "flight rules / assumptions sheet". The trigger says what is inside, and the inside is one click away.

| #   | Current text                                                                                                | Action                               | New text / where                                                                                        | Reason                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Route (A*)`                                                                                                | shorten                              | `Route`                                                                                                 | "A*" is the implementation, not the task (frontend-design: name things by what users understand). L-5's unique title is kept.                     |
| 2   | `Set start`                                                                                                 | keep as is                           | ToggleGroupItem                                                                                         | Verb plus object, distinct (C-6).                                                                                                                 |
| 3   | `Set end`                                                                                                   | keep as is                           | ToggleGroupItem                                                                                         | Same.                                                                                                                                             |
| 4   | `Draw no-go zone`                                                                                           | keep as is                           | ToggleGroupItem                                                                                         | Same term as the zone list and the map (T-5).                                                                                                     |
| 5   | `Finish zone`                                                                                               | keep, shown only while drawing       | `Finish zone (2/3)` until 3 corners, then `Finish zone`                                                 | The button no longer appears when it does nothing.                                                                                                |
| 6   | `Clear zones`                                                                                               | keep as is                           | destructive-outline, opens a confirmation                                                               | Label is fine. The risk is handled in change 13.                                                                                                  |
| 7   | `No-go zones: Example boulder field (placeholder)`                                                          | keep as is                           | under the readouts                                                                                      | The "(placeholder)" label is an honesty constraint.                                                                                               |
| 8   | `Distance one way: 5.90 km`                                                                                 | keep (label and value split)         | `dt` "Distance one way", `dd` mono "5.90 km"                                                            | Same words, now a readout. Keep 2 dp to match the flight-rule reason.                                                                             |
| 9   | `Out-and-back time: 234 min`                                                                                | keep (split)                         | `dt` "Out-and-back time", `dd` mono "234 min"                                                           | Same unit as the suit-time reason (D-4).                                                                                                          |
| 10  | `Tobler hiking model (Earth, off-path), not a suited Mars walk`                                             | shorten, stays visible               | note under the time: `Tobler off-path hiking (Earth), not a suited Mars walk`                           | Honesty: the model stays named and identified as Earth, right next to the number it qualifies. 10 characters shorter.                             |
| 11  | `Steepest slope: 0.5°`                                                                                      | keep (split)                         | readout                                                                                                 | Needed for the slope rule.                                                                                                                        |
| 12  | `Cells searched: 4016`                                                                                      | delete                               | none                                                                                                    | Debug only (impeccable polish: "remove debug output"). Says nothing to the operator.                                                              |
| 13  | `Farthest from start: 5.44 km`                                                                              | keep (split)                         | readout, marked when `limiting_factor === "walk_back"`                                                  | On a NO-GO it repeats the reason, but on GO it is the only place the walk-back margin shows.                                                      |
| 14  | `Route check: NO-GO`                                                                                        | keep as is                           | `AlertTitle`, with an icon                                                                              | "Route check" states the scope. GO/NO-GO are flight-control terms (T-4 allows them).                                                              |
| 15  | Reason: `The route goes 5.44 km from base, beyond the 2 km walk-back limit (Moon limit, assumed for Mars).` | keep as is                           | `AlertDescription`                                                                                      | Comes from `lib/flight-rules`. Must not be reworded.                                                                                              |
| 16a | `Route rules only: slope, walk-back and suit time, …`                                                       | move into the disclosure             | `Checks slope, walk-back distance and suit time only.`                                                  | The positive scope is secondary once 16c is visible.                                                                                              |
| 16b | `…with the start point treated as base.`                                                                    | move into the disclosure             | `The start point counts as base.`                                                                       | Explains why the reason says "from base". Secondary.                                                                                              |
| 16c | `Radiation, dust and daylight are not checked here.`                                                        | shorten, stays visible               | inside the verdict `Alert`: `Not checked: radiation, dust, daylight.`                                   | Honesty: the panel must not look like a full GO. It stays next to the verdict, never hidden.                                                      |
| 17  | `Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.`                             | move into the disclosure             | verbatim                                                                                                | Source and limit stay one click away (CLAUDE.md §8: every layer shows its NASA source).                                                           |
| 18  | `Slopes over 20° are walls (lunar suit limit, assumed for Mars).`                                           | move into the disclosure and shorten | `Ground over {MAX_SLOPE_DEG}° is impassable ({FLIGHT_RULES.slope.applies_to} limit, assumed for Mars).` | Drops the "wall" jargon. The wording then matches the reason sentences ("Moon limit, assumed for Mars"), built from the rule rather than retyped. |
| 19  | `Loading elevation…`                                                                                        | keep as is                           | muted `p role="status"`                                                                                 | Already names the operation.                                                                                                                      |
| 20  | `Elevation unavailable`                                                                                     | rewrite                              | `Elevation grid did not load, so no route can be planned. Reload the page to retry.` (error Alert)      | S-2: what failed, the consequence, what to do.                                                                                                    |
| 21  | `Point is outside the elevation grid`                                                                       | rewrite                              | `Start or end is outside the elevation grid. Pick a point inside it.`                                   | S-2.                                                                                                                                              |
| 22  | `Start is inside a wall or no-go zone`                                                                      | rewrite                              | `Start is on ground steeper than 20° or in a no-go zone. Set the start somewhere else.`                 | S-2, no jargon, 20 read from `MAX_SLOPE_DEG`.                                                                                                     |
| 23  | `End is inside a wall or no-go zone`                                                                        | rewrite                              | `End is on ground steeper than 20° or in a no-go zone. Set the end somewhere else.`                     | Same.                                                                                                                                             |
| 24  | `No route avoids every wall`                                                                                | rewrite                              | `No route avoids ground steeper than 20° and the no-go zones. Move the end or clear a zone.`            | Same.                                                                                                                                             |
| new | (none)                                                                                                      | add, only while a mode is active     | `Click the map to set the start.` and the others, plus `Enter` map centre, `Esc` cancel                 | Feedback for an active mode (C-5, M-4). Gone when the mode ends.                                                                                  |
| new | (none)                                                                                                      | add                                  | legend: `Out`, `Back`, `No-go zone`                                                                     | G-4. Three words.                                                                                                                                 |

Visible lines of text drop from 16 to about 10 on the NO-GO example. Nothing is deleted except the debug line and "(A*)".

Before/After summary (emil-design-eng format):

| Before                                                                        | After                                                                   | Why                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `<p className="text-destructive">Route check: NO-GO</p>` after six data lines | `Alert variant="error"` with an icon, first in the result               | Decision first; 8.8:1 title ink; an icon, not only colour |
| `Button variant={mode===v?"default":"outline"}` ×3                            | `ToggleGroup` with `aria-pressed`, second click cancels                 | State exposed; a way out                                  |
| `role="status"` on the whole result                                           | `role="status"` on the verdict or error only                            | Announces the change, not ten lines                       |
| `#38bdf8`, `#ef4444` in paint                                                 | `--primary`, `--destructive` plus a `--background` border               | Tokens; 3:1 over bright terrain                           |
| 4 always-visible caveat paragraphs                                            | 1 visible "Not checked" line plus the "Assumptions and data" disclosure | Progressive disclosure without hiding scope               |

---

## 4. Position

Use the measured top position on wide screens: `lg:top-4 lg:right-80 lg:bottom-auto lg:max-h-[calc(100svh-2rem)]`, keeping today's bottom-right classes below `lg`. Today's position cuts the result to 294 px at 790 px height. At the top position the panel gets its full height from 1100×700 up, with no overlaps. At 1024 px wide it still clears Layer (16–304 px from the left) and LARA (16–400 px from the left) horizontally, and keeps a 16 px gap to Scene.
Anchoring at the top keeps the controls in the same place while the result changes length (apple-design §16, repo L-11). At the bottom, every recompute moves the buttons under the pointer. After the text cuts, the panel is about 470 px tall (NO-GO), so the 288 px strip it covers is mostly empty map, and the A* route sits around the map centre to its left.
When the result is an error, the panel shrinks from the bottom up to the title, the controls, the error `Alert` directly under the control just used, the zone list and the disclosure, about 230 px. Uncovered map shows below it, and nothing moves.

---

## 5. Conflicts

| Conflict                                                                                                                      | Side taken                                 | Why                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| design-taste-frontend bans monospace, hairlines and backdrop blur. unslop wants borders at 6–10% opacity.                     | Hermes theme (`AGENTS.md`)                 | The brief is pinned: monospace readouts, cyan hairlines at 55%, and blur panels are the house look. impeccable itself says "the brief wins".                             |
| unslop and frontend-design ban all-caps labels.                                                                               | Keep `GO` / `NO-GO` / `CAUTION`            | Domain acronyms, allowed by T-4.                                                                                                                                         |
| redesign-existing-projects: font swap, off-black background, noise, tinted shadows.                                           | Reject                                     | Fonts were chosen to pass T-1. `--background` is a token. `AGENTS.md` says flat surfaces.                                                                                |
| emil-design-eng and redesign: `scale(0.97)` on press.                                                                         | Reject here                                | Would mean editing coss `button.tsx` (forbidden) or a global rule beyond scope. The coss button already changes appearance on press (C-7, see `survey-motion.md`).       |
| impeccable distill ("hide complexity") against the honesty constraints.                                                       | Honesty                                    | "Not checked: radiation, dust, daylight" and the Tobler note stay visible. Only secondary caveats move.                                                                  |
| impeccable clarify ("prefer undo") and apple-design §16 ("confirmation sparingly") against repo C-1.                          | C-1, with an `AlertDialog` and hazard tape | Clearing zones can flip the verdict to GO through a hazard. That is the "genuinely destructive" case both skills allow. Undo would need history state, which costs more. |
| "Remove unnecessary text" against repo G-4 (legend required).                                                                 | Add the three-word legend                  | Two line styles with no legend breaks a MUST rule. The legend replaces guessing, not information.                                                                        |
| D-5 "only as many decimals as the task needs": 1 dp is more honest on a 200 m grid.                                           | Keep 2 dp                                  | The flight-rule reason prints 2 dp ("5.44 km") and must not be reworded. A readout of 5.4 next to a reason saying 5.44 reads as a mismatch.                              |
| Repo T-3 (labels at least 16 px) against `text-xs` and `text-sm` across every map panel.                                      | Do not fix in this panel alone             | L-11 consistency. Flag it for an app-wide pass.                                                                                                                          |
| `AGENTS.md` "no shadowed surfaces" against `shadow-lg` on all four map panels (`--shadow-lg` is not zeroed in `globals.css`). | Leave it for now                           | Change all four panels together or none. Removing it here alone would make this panel the odd one out. Flag for the team.                                                |
| shadcn says use shadcn components. `AGENTS.md` says coss only.                                                                | coss                                       | `Alert`, `AlertDialog`, `ToggleGroup`, `Collapsible` and `Kbd` already exist in `components/ui/`.                                                                        |
| react-best-practices `useDeferredValue` for expensive derived renders.                                                        | Not now                                    | No trace shows a slow interaction. See section 6.                                                                                                                        |

---

## 6. Not recommended

- **Decorative effects:** gradients, glows, grain or noise, glassmorphism beyond the existing `backdrop-blur`, tinted or colored shadows, spotlight borders, entrance or stagger animations, number tickers. They are decoration on an operational console (repo K-1, impeccable operate "motion conveys state, not decoration").
- **New fonts** (Geist, Outfit, Satoshi from shadcn and redesign) or a type-scale change limited to this panel: the fonts were chosen to pass T-1, and the scale is app-wide.
- **Redesigning sibling panels** (Layer, Scene, LARA) or making Scene collapsible to free space: out of scope. The measured top position works without it.
- **Tooltips or a Popover for the caveats:** hover-only content does not work on touch, and a popover would cover the map or LARA (L-12). An inline `Collapsible` is one click and announced.
- **`ScrollArea` in place of `overflow-y-auto`:** the native scrollbar is already proportional (L-4), and after the cuts the panel rarely scrolls at `lg`.
- **A Sheet or Drawer for the panel, or a modal flow for drawing zones:** a modal as first thought (impeccable operate).
- **Text labels drawn on the map** (a symbol layer for zone names): the style has no glyphs URL, so it would need a new external resource. The legend and the zone list cover it.
- **A `fill-pattern` hatch for zones:** needs a sprite or an added image. The bordered outline from change 11 carries the shape.
- _*`useDeferredValue` / `useTransition` or a Web Worker for A*:_* only after a DevTools trace shows INP above 200 ms on a click (performance, core-web-vitals: no claims without runtime evidence).
- **Showing the algorithm or search effort** ("A*", "cells searched") in the UI: debug and implementation detail. The code and the pitch can say A*.
- **Rewording or restating any flight-rule limit or reason** in the panel, for example "limit 2 km" next to a readout typed by hand. Read values from `FLIGHT_RULES` or show `check.reasons` verbatim.
- **SEO, meta tags, Lighthouse score work and theme-factory themes:** they do not apply to this panel.

---

# Motion review

Scope: `components/map/route-planner.tsx` (panel plus Mapbox layers `planned-route`, `planned-route-back`, `no-go-zones`, `zone-draft`, `route-ends`). Read-only survey.

Repo facts that shape the answer:

- No easing tokens exist (`--ease-out` and the rest are absent from `app/globals.css`). The only motion tokens are the coss keyframe tokens: `--animate-toast-error-odd` / `-even` (0.28 s, `cubic-bezier(0.5, 1, 0.89, 1)`, a ±3px `translate` jitter) and `--animate-toast-success-*` (0.32 s). `components/ui/` uses `duration-200 ease-in-out` with `motion-reduce:transition-none` or `motion-reduce:animate-none`.
- `Button` animates nothing except `transition-shadow`. `:active` and `[data-pressed]` already change the inset shadow and background, which meets C-7 ("button changes appearance while actuated").
- Team rules (`.agents/skills/operational-ui-standards/SKILL.md`, `AGENTS.md`): A-4 (under reduced motion, replace animation with a static high-salience cue), A-6 (status changes are announced), C-5 (every activation gets positive feedback), D-3 (fixed-width value fields, no reflow), D-6 (update rate matched to the task, "faster than the eye can read just adds flicker"), F-1 (flashing only for events that need immediate attention).
- The only global `prefers-reduced-motion` block is the emergency-alert one (`globals.css:411`).
- Mapbox: `flyTo` and `easeTo` already skip animation under reduced motion unless `essential: true` (checked in `mapbox-gl.d.ts`), so the 3.5 s `flyTo` in `scene-panel.tsx:57` is already compliant. Paint transitions exist (`line-opacity-transition`, `fill-opacity-transition`, `circle-radius-transition`, and the style-root `transition`, default 300 ms), but they only apply to `setPaintProperty` changes. `GeoJSONSource.setData` is never interpolated, so route geometry cannot tween.

## 1. Skill table

| Skill                              | Verdict | Why, for this panel                                                                                                                                                                                                                   |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| animate                            | use     | Its step 1 and 2 gate (frequency, named purpose) is what rules out almost everything here; its rule "extend the codebase's tokens" points at the existing toast-error keyframe. Also requires reduced motion to ship with the change. |
| find-animation-opportunities       | use     | Same four-question gate plus the hunt list (teleporting state, feedback gaps) and a required "rejected candidates" list; its Function rule ("data the user is reading should not move for style") kills every readout animation.      |
| review-animations (+ STANDARDS.md) | partly  | Used for exact values and escalation triggers (no number tickers, no layout-property animation, keyframes vs transitions). Nothing to review yet, so no Block/Approve verdict.                                                        |
| improve-animations (+ AUDIT.md)    | partly  | Used AUDIT.md categories 6 (accessibility) and 7 (cohesion and tokens). Did not write plans; this task is read-only and the list is one item.                                                                                         |
| animation-performance              | partly  | Confirms the one candidate (`translate` keyframe) is composite-only. Side note: `rampStorm` in `scene-panel.tsx:45` sets React state every frame, which this skill flags; out of scope here.                                          |
| animation-vocabulary               | partly  | Naming only: Shake/Wiggle (the one candidate), Number ticker and Tabular numbers (rejected and static, respectively).                                                                                                                 |
| choreograph                        | skip    | At most one thing moves per event, so there is no order, overlap or stagger to decide. Its rule "never stagger on high-frequency UI" would apply to the readout list if anyone tried.                                                 |
| cinematic-gsap-lenis-motion-system | skip    | GSAP plus Lenis (new dependencies), 0.75 to 1.1 s reveals and luxury-editorial taste. Wrong for an operational console.                                                                                                               |
| gsap-core                          | skip    | New dependency; its `matchMedia` reduced-motion pattern is redundant with CSS `motion-reduce:`.                                                                                                                                       |
| gsap-performance                   | skip    | GSAP-specific; the general advice (transform and opacity only) is already covered by animation-performance.                                                                                                                           |
| gsap-react                         | skip    | `useGSAP` and cleanup patterns for a library we may not add.                                                                                                                                                                          |
| gsap-scrolltrigger                 | skip    | Scroll-linked animation; the panel's internal scroll needs none. Read the opening section only.                                                                                                                                       |
| gsap-timeline                      | skip    | Sequencing; there is nothing to sequence.                                                                                                                                                                                             |

Reference files read: `animate/RECIPES.md` (button press, dropdown, toast, accordion, crossfade mask, WAAPI sections), `review-animations/STANDARDS.md` (full), `improve-animations/AUDIT.md` (full). Skipped: `RECIPES.md` stagger, scroll reveal, drag to dismiss, hold to confirm and tab indicator sections; `improve-animations/PLAN-TEMPLATE.md` (plan format, not a decision aid); `cinematic-gsap-lenis-motion-system/REFERENCES.md` (links only) and `demo/`; the scroll, pin, parallax and text-reveal parts of the cinematic skill and most of gsap-scrolltrigger.

## 2. Motion changes, ranked

### 1. `nice`: brief shake on the failure sentence when a route is rejected

- **What moves:** the single `<p role="status">` that shows `STATUS_MESSAGES[...]` in `RouteResult` (route-planner.tsx, the `!summary` branch). Nothing else.
- **Property:** `translate` (±3px horizontal), via the existing `animate-toast-error-odd` utility. Give the `<p>` `key={failed}` so the animation replays each time the failure reason changes, and only then.
- **Duration and easing:** existing token, 0.28 s `cubic-bezier(0.5, 1, 0.89, 1)` (`--animate-toast-error-odd`). This is under 300 ms and matches the app's toasts, so it stays consistent (AUDIT.md section 7).
- **Purpose:** feedback (C-5). The user's eyes are on the map where they clicked, so a rejected click ("Start is inside a wall or no-go zone") changes text in the bottom-right corner, outside their focus. Peripheral motion makes them look. It fires only on rejection, which is occasional.
- **Skill rule:** animate step 2 "Feedback", Shake/Wiggle ("signaling an error or rejected input", animation-vocabulary); animate hard rule 3 (extend existing tokens, don't fork them).
- **Reduced motion:** `motion-reduce:animate-none`, the same pattern as `toast.tsx:53`. Per A-4, the static cue should be the sentence itself plus a warning icon or colour if the a11y/visual pass adds one. Do not add a motion-only signal.
- **Cost:** 1 line (a `key` and a `className` on an existing element).
- **Caveat:** `RouteResult` currently swaps between three different `role="status"` elements, so the live region is replaced rather than updated and some screen readers will not announce the change (A-6). If someone fixes that with one persistent `role="status"` wrapper, keep the `key` on the inner `<p>` so the shake still replays.

No `should` motion changes. Nothing else passed the gate.

### Mapbox-side options considered (none recommended)

- **Fade the new route in** (`line-opacity` 0 to 1 with `line-opacity-transition: {duration: 200}`): this works, but `setData` removes the old line instantly, so the result is a blink-in of the same line on every click. That fails D-6 ("adds flicker") and adds two `setPaintProperty` calls plus a frame wait for no new information.
- **Pulse the start or end marker** (`circle-radius-transition`): the marker already jumps to where the user clicked, so that move is the feedback. A pulse duplicates it.
- **Fade a finished zone in** (`fill-opacity-transition`): `fill-opacity` is per layer, so every existing zone would re-fade. Doing it per feature needs feature-state wiring. Not worth the cost.
- **Ghost of the previous route** (an extra source and layer fading out over about 600 ms after a recompute, so the detour around a new zone is visible): this is the only Mapbox idea that genuinely helps the user see what changed. It costs about 15 lines and a second source, and a static "previous route" layer would do the same job without motion. Out of budget for a hackathon.

## 3. Do not animate

| Thing                                                                           | Keep it instant because                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number readouts (distance, time, slope, cells searched, farthest)               | They are data the user reads (find-animation-opportunities Function rule). A number ticker would show false intermediate values on a safety readout (D-1 spirit) and lag behind a 10 ms recompute. If the digits jitter, the fix is static: `tabular-nums` / `font-mono` (D-3). |
| Route line, return dashes, zone fill, draft dots and lines                      | Geometry cannot tween with `setData`. Each click is direct manipulation that is repeated many times per session, so the instant redraw is the feedback (animate frequency gate, "tens of times a day: near-imperceptible or nothing").                                          |
| Draft corner dots while drawing a zone                                          | Placed on every click, many in quick succession. Any entrance would trail behind the cursor.                                                                                                                                                                                    |
| Panel height change when the result becomes an error                            | Animating `height` is a layout property (STANDARDS: performance). The jump itself is the real problem: the panel is anchored at the bottom, so its top edge leaps. Fix it statically with a `min-h-*` on the result block (D-3, L-9: no reflow), not with motion.               |
| Mode buttons (Set start, Set end, Draw no-go zone) toggling `default`/`outline` | Instant variant swap is the clearest M-4 state cue. A colour fade only delays it. Press feedback already exists in `Button` (`:active` inset shadow). Adding `scale(0.97)` would change every button in the app; leave it out of this panel's scope.                            |
| Verdict line (GO / CAUTION / NO-GO)                                             | Colour change plus label already carries it. Flashing is reserved for emergencies (F-1, F-2) and must not be borrowed for a route verdict.                                                                                                                                      |
| Camera (for example auto-fitting to the new route)                              | Moving the map while the user is clicking on it breaks their aim and spatial memory. The existing `flyTo` stays on the explicit "Fly to" buttons and already honours reduced motion.                                                                                            |
| Panel entrance, internal scroll                                                 | Always on screen, so no entrance is needed (choreograph: "one entrance per container", and there is none to make). Smooth scroll would only slow reading.                                                                                                                       |
| Any keyboard-triggered action (if shortcuts are added later)                    | Disqualified by the frequency gate: "Never animate keyboard-initiated actions."                                                                                                                                                                                                 |

Non-motion fixes found on the way. They are not motion, but they matter more than any motion: (1) `map.getCanvas().style.cursor = "crosshair"` while a mode is armed, so the map shows that the next click places something (M-4, about 2 lines); (2) `min-h` on the result block; (3) one persistent `role="status"` wrapper (A-6).

## 4. Verdict

Motion is barely worth touching here. The panel is direct manipulation: every click produces an instant, correct redraw of the route, zones and numbers 10 ms later, and in an operational console that immediacy is the feedback. Every skill gate (frequency, function, D-6 flicker) argues against tweening data or geometry. The one change that earns its place is the 1-line shake on a rejected route, which reuses the app's own toast-error keyframe and `motion-reduce:animate-none`, because the failure text appears outside where the user is looking. Ship it only if it is free. With a deadline, the crosshair cursor and the `min-h` on the result block are better uses of the same five minutes than any animation.
