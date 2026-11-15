# A* Route Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan a walk from the base to a target with A*, treating steep cells and crew-drawn no-go zones as walls, and draw it on the map.

**Architecture:** A pure TypeScript core (`route-grid.ts` turns Terrarium tiles into a metre-aware grid; `routing.ts` builds the wall mask and runs A*). A React panel loads the base's elevation tiles once, replans whenever start, end or zones change, and draws the result as GeoJSON layers.

**Tech Stack:** TypeScript, Vitest, React, Mapbox GL JS v3, pngjs (tests only).

**Spec:** `docs/superpowers/specs/2026-11-14-astar-routing-design.md`

## Global Constraints

- Mars distances use `MARS_RADIUS_M` (3,396,190 m) from `lib/mars/terrain.ts`, with cos(latitude) for east-west. Never Mapbox or Turf distances.
- Slope wall = `FLIGHT_RULES.slope.no_go_above_degrees` (20) from `lib/flight-rules/rules.ts`. Do not hardcode 20.
- Heights = decoded Terrarium value minus `DISPLAY_ELEVATION_OFFSET_M` (10,000).
- Base tiles: zoom 10, x 10–11, y 364–365, URL `mapAsset("legacy/display/hab/10/{x}/{y}.png")`. They cover exactly `LOCAL_TERRAIN_BOUNDS`.
- Walking time: Tobler off-path, speed km/h = 3.6 · e^(−3.5 · |s + 0.05|), s = rise over run. UI label: "Tobler hiking model (Earth, off-path), not a suited Mars walk".
- Anything invented is labelled "(placeholder)".
- No AI or Claude credit in code comments or commits (no Co-Authored-By lines). Commit on branch `astar-routing` with the repo's `area(type): Summary` style, e.g. `routing(feat): Add A* over the base elevation grid`. Never push.
- Code follows the Karpathy guidelines: minimum code that solves the task, no speculative options or abstractions, surgical edits to existing files, every changed line traceable to the task. Code must be readable: clear names, short functions, a one-line comment where the why is not obvious.
- Run tools on Node 24: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"` and call pnpm as `corepack pnpm`.
- Done means `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.

## Review Focus

1. Start or end placed outside the grid: status `outside_grid`, panel says so, no crash.
2. A zone drawn over the base or the target: `start_blocked` or `goal_blocked`, panel names which.
3. Zones that wall the target off completely: `no_path`, panel says no route exists.
4. Finishing a zone with fewer than 3 corners: the draft is dropped, no zone is added.
5. Elevation tiles fail to load: panel shows "Elevation unavailable", no route, map still works.

---

### Task 1: Elevation grid from Terrarium tiles

**Files:**

- Create: `lib/mars/route-grid.ts`
- Test: `lib/mars/route-grid.test.ts`

**Interfaces:**

- Consumes: `tileLongitude`, `tileLatitude`, `MARS_RADIUS_M`, `DISPLAY_ELEVATION_OFFSET_M` from `lib/mars/terrain.ts`; `LngLat` from `lib/mars/types.ts`.
- Produces:

  ```ts
  export interface RouteGrid {
    width: number;
    height: number;
    west: number;
    east: number; // longitude of the outer edges, degrees
    rowEdges: Float64Array; // latitude of each row edge, north to south, length height + 1
    heights: Float32Array; // metres, row-major; NaN = no data
  }
  export function decodeTerrarium(rgba: ArrayLike<number>, offsetM: number): Float32Array; // NaN where alpha < 255
  export function gridFromTiles(
    zoom: number,
    x0: number,
    y0: number,
    tiles: ArrayLike<number>[][],
  ): RouteGrid; // tiles[row][col], 256×256 RGBA each, display offset removed
  export function cellAt(grid: RouteGrid, point: LngLat): number | null; // row * width + col
  export function cellCenter(grid: RouteGrid, index: number): LngLat;
  export function cellSize(grid: RouteGrid, row: number): { dx: number; dy: number }; // metres
  ```

- [ ] **Step 1: Write the failing tests**
  - `decodes a Terrarium pixel and marks transparent pixels as no data`: one pixel `[128, 0, 0, 255]` with offset 0 → `0`; `[0,0,0,0]` → `NaN`.
  - `lays out 2×2 tiles as one 512×512 grid with Web Mercator row edges`: `gridFromTiles(10, 10, 364, tiles)` → `width 512`, `height 512`, `west === tileLongitude(10, 10)`, `east === tileLongitude(12, 10)`, `rowEdges[0] === tileLatitude(364, 10)`, `rowEdges[512] === tileLatitude(366, 10)`, `rowEdges[256]` within 1e-12 of `tileLatitude(365, 10)`.
  - `round trips a cell through cellCenter and cellAt`, and `returns null outside the grid` for `[-177, 46]`.
  - `uses Mars metres`: `cellSize(grid, 0).dy` ≈ `MARS_RADIUS_M · (rowEdges[0] − rowEdges[1]) · π/180`; `dx` ≈ `MARS_RADIUS_M · cos(rowLat) · (east − west)/width · π/180`.
  - `reads the real base tile`: decode `lib/mars/fixtures/hab-display.png` with pngjs through `gridFromTiles(9, 5, 182, [[data]])`; every height is between −4106 and −4067.

- [ ] **Step 2: Run** `pnpm vitest run lib/mars/route-grid.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** the interfaces above. Row edge r of tile-pixel space = `tileLatitude(y0 + r / 256, zoom)`. Row latitude for `dx` = midpoint of its two edges. `cellAt` finds the row by binary search on `rowEdges`.

- [ ] **Step 4: Run** the same command — expect PASS.

### Task 2: Walls and A*

**Files:**

- Create: `lib/mars/routing.ts`
- Create: `lib/mars/route-zones.ts` (the placeholder zone, so tests and UI share it; contents in Task 3's Interfaces)
- Test: `lib/mars/routing.test.ts`

**Interfaces:**

- Consumes: Task 1's `RouteGrid`, `cellAt`, `cellCenter`, `cellSize`; `FLIGHT_RULES`.
- Produces:
  ```ts
  export interface NoGoZone { id: string; name: string; ring: LngLat[] } // ≥ 3 corners, not closed
  export type RouteStatus = "ok" | "no_path" | "outside_grid" | "start_blocked" | "goal_blocked";
  export interface PlannedPath {
    status: RouteStatus;
    path: LngLat[];          // exact start, interior cell centres, exact goal; [] unless ok
    distance_m: number;
    max_slope_deg: number;   // steepest cell slope among path cells
    time_min: number;        // Tobler off-path
    expanded: number;        // cells taken off the open list
  }
  export interface RouteSummary { distance_km: number; est_time_min: number; max_slope: number; farthest_from_base_km: number }
  export const MAX_SLOPE_DEG: number; // = FLIGHT_RULES.slope.no_go_above_degrees
  export function slopeDegrees(grid: RouteGrid): Float32Array;                 // Horn 3×3, true spacing; NaN if any neighbour is NaN; edges clamp
  export function wallMask(grid: RouteGrid, slope: Float32Array, zones: NoGoZone[], maxSlopeDeg?: number): Uint8Array; // 1 = wall: NaN slope, slope > max, or centre inside a zone
  export function findPath(grid: RouteGrid, slope: Float32Array, walls: Uint8Array, start: LngLat, goal: LngLat, opts?: { maxSlopeDeg?: number; heuristic?: boolean }): PlannedPath;
  export function planWalk(grid: RouteGrid, slope: Float32Array, walls: Uint8Array, base: LngLat, target: LngLat): { outbound: PlannedPath; back: PlannedPath; summary: RouteSummary | null }; // summary null unless both legs ok
  ```

A* rules (the tests cannot pin these all down):

- 8 neighbours. A diagonal step needs both side cells open (no corner cutting).
- Step cost = √(horizontal² + Δz²). Horizontal uses `cellSize` of the rows involved (average for vertical and diagonal steps).
- Refuse a step whose own grade atan(|Δz| / horizontal) exceeds `maxSlopeDeg`.
- Heuristic = `hypot(|Δrow| · minDy, |Δcol| · minDx)` with the smallest spacings in the grid, so it never overestimates. `heuristic: false` sets it to 0 (Dijkstra), for tests.
- Binary min-heap keyed on f; skip stale entries.
- Start and goal snap to their cells; `start === goal` cell returns `ok` with a two-point path and distance 0.

- [ ] **Step 1: Write the failing tests** with a helper `flatGrid(width, height, cellM)` that builds a `RouteGrid` at the equator with `cellM`-metre cells and heights of 0.
  - `goes straight across open flat ground`: 20×20, start col 1 → goal col 18 on row 10 → `ok`, `distance_m` = 17 · cellM ± 1e-6.
  - `goes through the gap in a wall`: wall at column 10 except row 2 → `ok`; no path point lies in a wall cell.
  - `does not cut corners`: walls at (5,6) and (6,5); route (5,5) → (6,6) has more than 2 cells.
  - `treats steep ground as a wall`: a 10 m cliff (heights 0 for col < 10, 10 for col ≥ 10) on 10 m cells → `wallMask` marks cols 9 and 10 (26.6°); a route across reports `no_path`; with `wallMask(..., 90)` and `maxSlopeDeg: 90` it crosses.
  - `blocks cells inside a no-go zone`: a square zone over cells 8–11 marks exactly those centres.
  - `reports no_path when the goal is walled in`, `start_blocked`, `goal_blocked`, `outside_grid`.
  - `matches Dijkstra's cost`: 40×40 with a fixed pseudo-random 25% wall pattern (seeded LCG) → `distance_m` equal (±1e-6) with `heuristic: true` and `false`, and `expanded` smaller or equal with the heuristic.
  - `sums both legs`: `planWalk` on flat 1 km of 100 m cells → `est_time_min` = outbound + back, `farthest_from_base_km` ≈ 1.0, `max_slope` 0.
  - `avoids the placeholder zone on the real tile`: fixture grid, base `[-176.05, 45.97]`, target `[-175.95, 46.03]`, zone `EXAMPLE_ZONE` (Task 3) → `ok`, no path point inside the zone.

- [ ] **Step 2: Run** `pnpm vitest run lib/mars/routing.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the interfaces with the rules above.
- [ ] **Step 4: Run** — expect PASS.

### Task 3: Route panel on the map

**Files:**

- Create: `lib/mars/load-route-grid.ts` (browser loader)
- Create: `components/map/route-planner.tsx`
- Modify: `components/map/mars-map.tsx` (render the panel; move the error badge to bottom centre)
- Modify: `public/data/processed/manifest.json` (`route` layer `visible: false`)

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces:
  ```ts
  // route-zones.ts
  export const EXAMPLE_ZONE: NoGoZone = {
    id: "example",
    name: "Example boulder field (placeholder)",
    ring: [
      [-176.018, 46.0],
      [-176.0, 46.012],
      [-175.982, 46.0],
      [-176.0, 45.988],
    ],
  };
  // load-route-grid.ts
  export function loadBaseGrid(signal?: AbortSignal): Promise<RouteGrid>; // fetch → createImageBitmap → OffscreenCanvas.getImageData for the 4 tiles
  // route-planner.tsx
  export function RoutePlanner(props: {
    map: MapboxMap | null;
    base: LngLat;
    target: LngLat;
  }): JSX.Element;
  ```

Panel behaviour:

- Bottom-left, same card style as `LayerPanel`. Title "Route (A*)".
- Mode buttons: Set start, Set end, Draw no-go zone, Finish zone, Clear zones. A map click acts on the current mode; with no mode set, clicks do nothing.
- Starts with start = base, end = `s1` stop, zones = `[EXAMPLE_ZONE]`.
- Recomputes the slope once per grid, the wall mask when zones change, and `planWalk` when start, end or zones change.
- Map layers: `planned-route` (line, outbound solid, return dashed), `no-go-zones` (red fill 0.35 + outline), `zone-draft` (points and line), `route-ends` (start and end circles).
- Shows: distance one way (km), out-and-back time (min), steepest slope (°), cells searched, the Tobler label, and the source line "Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters."
- Status messages: `outside_grid` "Point is outside the elevation grid", `start_blocked` "Start is inside a wall or no-go zone", `goal_blocked` "End is inside a wall or no-go zone", `no_path` "No route avoids every wall", load failure "Elevation unavailable".

- [ ] **Step 1:** Implement the files above. Run `pnpm typecheck && pnpm lint` — expect PASS.
- [ ] **Step 2:** Run `pnpm test` — the full suite, including `terrain-assets.test.ts` (it reads the manifest) — expect PASS.

### Task 4: Check it in the browser

- [ ] **Step 1:** Start the dev server, open the map, fly to the base. Confirm the route bends around the red placeholder zone and the numbers show.
- [ ] **Step 2:** Walk the Review Focus list: set an end outside the grid, draw a zone over the end, wall the end in, finish a 2-corner zone. Each shows its message.
- [ ] **Step 3:** Run `pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` — expect all PASS.

### Task 5: Route-only flight-rule check in the panel

Added 14 November after the first three tasks: the team's limits (walk-back 2 km, suit time, slope) are real and in `lib/flight-rules/rules.ts`, and the default route already breaks one of them, so the panel should say so.

**Files:**

- Modify: `lib/flight-rules/evaluate.ts`
- Test: `lib/flight-rules/evaluate.test.ts`
- Modify: `components/map/route-planner.tsx`

**Interfaces:**

- Consumes: `RouteSummary` from `lib/mars/routing.ts` (`est_time_min`, `max_slope`, `farthest_from_base_km`); the existing private checks `checkSlope`, `checkWalkBack`, `checkSuitSupply` and the `EvaVerdict` type in `evaluate.ts`.
- Produces:
  ```ts
  /** Checks only the rules that depend on the route itself: slope, walk-back distance and suit time. */
  export function evaluateRoute(route: EvaPlan["route"]): EvaVerdict;
  ```

Rules for the change to `evaluate.ts`:

- No rule value or comparison is copied or changed. `evaluateRoute` runs the same three check functions `evaluateEva` runs, and both share one helper that turns findings into an `EvaVerdict` (worst first).
- The three route checks and `minutesWithMargin` take `Pick<EvaPlan, "route">` so they can run without live data. `evaluateEva`'s behaviour and its existing tests do not change, except the two reason strings below.
- Reason strings round what they print, the way times are already printed in whole minutes: walk-back distance to 2 decimals (`Math.round(x * 100) / 100`, so 2.5 stays "2.5" and 5.440856 prints "5.44"), slope to 1 decimal. Comparisons keep using the unrounded values.

Panel (`RouteResult` in `route-planner.tsx`), shown only when `summary` is not null, below the existing numbers:

- `Farthest from base: {farthest_from_base_km to 2 decimals} km`
- `Route check: GO` | `Route check: CAUTION` | `Route check: NO-GO`, coloured `text-success` | `text-warning` | `text-destructive`.
- One line per entry in `reasons`, as returned.
- Muted note, verbatim: "Route rules only: slope, walk-back and suit time. Radiation, dust and daylight are not checked here."

- [ ] **Step 1: Write the failing tests** in `evaluate.test.ts`, in a new `describe("evaluateRoute")`:
  - `gives GO when the route meets every route rule`: `{ est_time_min: 180, max_slope: 8, farthest_from_base_km: 1.2 }` → verdict `GO`, `limiting_factor` null, `reasons` empty.
  - `gives NO_GO beyond the walk-back limit and prints the distance to 2 decimals`: `farthest_from_base_km: 5.440856262495297` → verdict `NO_GO`, `limiting_factor` `"walk_back"`, `reasons[0]` contains `"5.44 km"` and does not contain `"5.4408"`.
  - `gives CAUTION when the walk with margin is longer than planned`: `est_time_min: 300` (390 with the 1.3 margin, over 360, under 450) → verdict `CAUTION`, `limiting_factor` `"suit_supply"`.
  - `prints the slope to 1 decimal`: `max_slope: 20.4567` → verdict `NO_GO`, `limiting_factor` `"slope"`, `reasons[0]` contains `"20.5°"`.
  - `agrees with evaluateEva when the live readings are safe`: for the walk-back case above, `evaluateRoute(route)` deep-equals `evaluateEva(planWith({ route }))`.
- [ ] **Step 2: Run** `corepack pnpm vitest run lib/flight-rules/evaluate.test.ts` — expect the new tests to FAIL (`evaluateRoute` is not exported).
- [ ] **Step 3: Implement** `evaluateRoute` and the rounding in `evaluate.ts`, then the panel lines.
- [ ] **Step 4: Run** the same command — expect PASS, including every existing `evaluateEva` test. Then `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm vitest run && corepack pnpm fmt:check && corepack pnpm build`.

---

# Part 2: Route panel polish (Tasks 6–8)

**Spec:** `docs/superpowers/specs/2026-11-14-route-panel-polish-design.md`. "Change N" below means the numbered change in that spec's "Changes, ranked" section; the "Text plan" table there is binding word for word.

## Global Constraints for Tasks 6–8

- `AGENTS.md` and `.agents/skills/operational-ui-standards/SKILL.md` are binding for all UI. Read both before writing UI code.
- Use coss components from `components/ui/` unmodified (`ToggleGroup`, `Alert`, `AlertDialog`, `Collapsible`, `Kbd`, `Button`). No shadcn registry components, no new dependencies, no edits to files in `components/ui/`.
- Colours come from theme tokens in `app/globals.css`; no new hex values.
- Flight-rule limits and reason sentences come from `lib/flight-rules/` and `MAX_SLOPE_DEG`; never retype a limit.
- Honesty: "(placeholder)" stays on the example zone; "Tobler off-path hiking (Earth), not a suited Mars walk" and "Not checked: radiation, dust, daylight." stay visible; the other caveats stay one click away.
- Do not touch `layer-panel.tsx`, `scene-panel.tsx`, `scene.ts`, `components/copilot/*` or `mars-map.tsx`.
- Everything in Part 1's Global Constraints still applies (Karpathy guidelines, readable code, Node 24 with `corepack pnpm`, commit style, no AI credit, never push).

## Review Focus for Tasks 6–8

1. Leaving draw mode by Esc, by pressing the pressed toggle again, or by choosing another mode: the draft disappears and a later map click adds nothing.
2. Double-click while drawing: with 3 or more corners one zone is added (not two) and the map does not zoom; with fewer the draft is dropped and no zone is added.
3. Keyboard only: a mode can be armed from the toggle group, Enter on the focused map places the point at the map centre, Esc cancels.
4. An error result: the controls do not move, the message appears in the verdict's slot, and only that slot is a status region.
5. Clear zones: Cancel keeps every zone; confirming removes them all, including the example zone; the button is disabled when there are none.

---

### Task 6: Split the panel files; interaction and accessibility

**Files:**

- Create: `components/map/route-layers.ts`, `components/map/route-result.tsx`
- Modify: `components/map/route-planner.tsx`, `lib/mars/route-zones.ts`
- Test: `lib/mars/route-zones.test.ts`, `components/map/route-layers.test.ts`

**Interfaces:**

- Produces:

  ```ts
  // lib/mars/route-zones.ts
  /** Adds a corner to a draft zone, ignoring one identical to the last (the second click of a double-click). */
  export function appendCorner(draft: LngLat[], corner: LngLat): LngLat[];

  // components/map/route-layers.ts — map sources, layer specs and GeoJSON builders, no React
  export type Plan = ReturnType<typeof planWalk>;
  export type Feature = /* the panel's existing local GeoJSON feature type */;
  export const SOURCES: readonly string[];
  export const LAYERS: LayerSpecification[]; // Task 8 replaces this with routeLayers(token)
  export function setData(map: MapboxMap | null, source: string, features: Feature[]): void;
  export function routeFeatures(plan: Plan): Feature[];
  export function zoneFeature(zone: NoGoZone): Feature;
  export function draftFeatures(draft: LngLat[]): Feature[];
  export function endFeatures(start: LngLat, end: LngLat): Feature[];

  // components/map/route-result.tsx — verdict, readouts and error messages
  export function RouteResult(props: { plan: Plan | null; loadFailed: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Split, changing no behaviour.** Move the layer specs, feature type and GeoJSON builders to `route-layers.ts`, and `RouteResult` with `VERDICT_STYLES` and `STATUS_MESSAGES` to `route-result.tsx`. Run `corepack pnpm typecheck && corepack pnpm vitest run && corepack pnpm build`; expect PASS. Commit on its own: `route-ui(refactor): Split route panel into layers, result and planner files`.
- [ ] **Step 2: Write the failing tests.**
  - `route-zones.test.ts`: `appendCorner` adds a new corner; returns the same corners when the new one equals the last; keeps a corner that equals an earlier, not last, corner.
  - `route-layers.test.ts`: `zoneFeature` closes the ring (first point repeated at the end) and carries the zone name; `routeFeatures` returns only the legs whose status is `"ok"`, tagged `leg: "outbound"` and `leg: "back"`; `draftFeatures` gives 1 point for 1 corner and 3 points plus 1 line for 3 corners.
- [ ] **Step 3: Run** `corepack pnpm vitest run lib/mars/route-zones.test.ts components/map/route-layers.test.ts`; expect the `appendCorner` tests to FAIL (not exported).
- [ ] **Step 4: Implement** changes 1, 2, 3, 5, 9 and 14 from the spec in `route-planner.tsx`, with these rules:
  - `chooseMode(next)` is the only place the mode changes; leaving `"zone"` clears the draft.
  - While a mode is active: `Escape` on `window` cancels it; `Enter` on `map.getCanvas()` places a point at `map.getCenter()` through the same handler a click uses; the map canvas cursor is `crosshair`, restored on cleanup.
  - While the mode is `"zone"`: `map.doubleClickZoom.disable()`, re-enabled on cleanup; a `dblclick` finishes the zone. Clicks add corners through `appendCorner`.
  - Map handlers are `useEffectEvent` functions, so they read the current mode and draft without re-registering.
  - `finishZone` keeps its behaviour: 3 or more corners add a zone, fewer drop the draft, and the mode ends either way.
  - "Finish zone" renders only in draw mode: `variant="default"`, `size="sm"`, disabled below 3 corners, labelled `Finish zone (n/3)` until 3 corners, then `Finish zone`.
  - Mode hint, shown only while a mode is active, `aria-live="polite"`: "Click the map to set the start." / "Click the map to set the end." / "Click the map to add corners. Double-click to finish.", followed by `<Kbd>Enter</Kbd> map centre` and `<Kbd>Esc</Kbd> cancel`.
  - "Clear zones" stays a plain button here (`size="sm"`); Task 7 adds its confirmation.
- [ ] **Step 5: Run** the focused tests (expect PASS), then `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm vitest run && corepack pnpm fmt:check && corepack pnpm build`. Commit: `route-ui(feat): Toggle-group modes, keyboard placement and safer zone drawing`.

### Task 7: Verdict first, less text, better placement

**Files:**

- Modify: `components/map/route-result.tsx`, `components/map/route-planner.tsx`

**Interfaces:**

- Consumes: Task 6's `RouteResult`, `Plan`; `evaluateRoute` and `FLIGHT_RULES`; `MAX_SLOPE_DEG`.
- Produces: no new exports.

Implement changes 4, 6, 7, 8, 10, 12, 13 and 17 and the spec's "Text plan" table, plus:

- **Title:** `Route`.
- **Result order:** verdict or error `Alert` first, then the readouts `dl`, then the zone list, the legend, and the disclosure.
- **Disclosure** "Assumptions and data" (closed by default), four lines in this order:
  1. `Checks slope, walk-back distance and suit time only. The start point counts as base.`
  2. `Elevation: MOLA/HRSC blend, nominal 200 m. Cannot see rocks or small craters.`
  3. `Ground over {MAX_SLOPE_DEG}° is impassable ({FLIGHT_RULES.slope.applies_to} limit, assumed for Mars).`
  4. `Search: A*, {n} cells searched.` where n is outbound plus back `expanded`, formatted with `toLocaleString("en-US")`; `Search: A*.` when there is no route.
- **Rejected route:** the error `Alert` gets `key={status}` and the app's existing toast-error shake class with `motion-reduce:animate-none` (find the class name in `app/globals.css`; if none exists, skip the shake and say so in the report).
- **Readout marking:** only the readout named by `check.limiting_factor` is marked (`slope` → Steepest slope, `walk_back` → Farthest from start, `suit_supply` → Out-and-back time), in the destructive or warning foreground token with an up-arrow icon labelled "Above limit".

No unit tests for rendering; the controller checks this task in the browser.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm vitest run && corepack pnpm fmt:check && corepack pnpm build`; expect PASS. Commit: `route-ui(feat): Verdict alert first, trimmed text and full-height placement`.

### Task 8: Map colours from tokens

**Files:**

- Modify: `components/map/route-layers.ts`, `components/map/route-planner.tsx`, `app/design-system/_demos/operational.tsx`
- Test: `components/map/route-layers.test.ts`

**Interfaces:**

- Produces:
  ```ts
  /** Layer specs for the route, zones, draft and end points, coloured from theme tokens. */
  export function routeLayers(token: (name: string) => string): LayerSpecification[]; // replaces LAYERS
  ```

Implement changes 11, 15 and 16. For change 15: the start stays a filled dot; the end becomes a ring (fill `token("--background")`, the existing `#fde68a` as a 3 px stroke).

- [ ] **Step 1: Write the failing test** in `route-layers.test.ts`: with `token = (name) => "T(" + name + ")"`, the outbound line colour is `T(--primary)`, the zone fill and outline are `T(--destructive)`, and `JSON.stringify(routeLayers(token))` contains no `#` colour other than `#7dd3fc` and `#fde68a`.
- [ ] **Step 2: Run** `corepack pnpm vitest run components/map/route-layers.test.ts`; expect FAIL (`routeLayers` not exported).
- [ ] **Step 3: Implement.** Read tokens once in the map effect with `getComputedStyle(document.documentElement)`. If `line-border-*` does not render on the globe projection, add one wider casing line layer under the route instead and say so in the report.
- [ ] **Step 4: Run** the focused test (expect PASS), then the full check line from Task 7. Commit: `route-ui(feat): Colour route layers from theme tokens`.

---

# Part 3: Driving mission (Tasks 9–11)

**Spec:** `docs/superpowers/specs/2026-11-15-driving-mission-design.md`. Tasks 9 and 10 touch different files and may run at the same time; Task 11 needs both.

## Global Constraints for Tasks 9–11

- Everything in Part 1 and Part 2 Global Constraints still applies (Karpathy guidelines, readable code, coss unmodified, tokens only, Node 24 + `corepack pnpm`, `area(type): Summary` commits, no AI credit, never push, no `git stash`).
- Every rover number lives in `lib/flight-rules/rover-rules.ts` with its source and `applies_to`; nothing else retypes one.
- Mars distances use `MARS_RADIUS_M`; never Mapbox or Turf.
- Commit only your own files (`git add <paths>`); if git reports `index.lock`, wait a few seconds and retry.

### Task 9: 463 m terrain strip and its grid

**Files:** create `pipelines/stable/mola-corridor.ts`, `public/data/processed/rover/mola-corridor.bin`, `public/data/processed/rover/mola-corridor.json`; modify `package.json` (script `pipe:mola-corridor`), `lib/mars/route-grid.ts`, `lib/mars/route-grid.test.ts`, `lib/mars/load-route-grid.ts`.

**Interfaces (produces):**

```ts
// lib/mars/route-grid.ts
export interface EquirectMeta {
  width: number;
  height: number;
  west: number;
  north: number;
  degreesPerPixel: number;
  nodata: number | null;
}
/** Grid on a plain lon/lat raster (rows evenly spaced in latitude). West may be above 180 for a strip across the antimeridian. */
export function gridFromEquirect(meta: EquirectMeta, heights: ArrayLike<number>): RouteGrid;
/** Longitude in the grid's own domain: adds 360 to points west of 0 when the grid lies east of 180. */
export function toGridLng(grid: RouteGrid, lng: number): number;
// lib/mars/load-route-grid.ts
export function loadDriveGrid(signal?: AbortSignal): Promise<RouteGrid>;
```

- [ ] Write failing tests: `gridFromEquirect` row edges are evenly spaced from `north` down by `degreesPerPixel`; `cellAt(grid, [toGridLng(grid, -176.05), 45.97])` lands in the expected cell for a strip with `west: 171`; nodata becomes NaN.
- [ ] Implement them. Run `corepack pnpm vitest run lib/mars/route-grid.test.ts`.
- [ ] Write the pipeline: source `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif` (46080 × 23040 Int16, uncompressed, one row per strip, IFD at the end of the file; read the TIFF header, IFD, strip offsets, ModelTiepoint and ModelPixelScale to place columns; never assume). Cut 42.5–48.5° N, 171–196° E (two column ranges per row across ±180), write Int16 little-endian rows north to south and a JSON with `EquirectMeta` plus `source`, `sha256` and the extent. Use `fetch` with `Range` headers, a small concurrency limit and retries. Run it once and commit the output.
- [ ] Spot-check: the habitat (183.95° E, 45.97° N) reads about −4,100 m (the base tile's range is −4106 to −4067 m).
- [ ] `loadDriveGrid` fetches the two files from `/data/processed/rover/` and builds the grid.
- [ ] Full check line; commit `rover-data(feat): Cut a 463 m MOLA strip for driving routes`.

### Task 10: Energy-based A\*, trip model and rover rules

**Files:** modify `lib/mars/routing.ts`, `lib/mars/routing.test.ts`, `lib/flight-rules/evaluate.ts` (export `toVerdict` only); create `lib/mars/driving.ts`, `lib/mars/driving.test.ts`, `lib/flight-rules/rover-rules.ts`, `lib/flight-rules/drive.ts`, `lib/flight-rules/drive.test.ts`; copy `research_notes/Rover routing/*.md` (in the parent folder) unchanged to `docs/research/rover/`.

**Interfaces (produces):**

```ts
// lib/mars/routing.ts — findPath gains a cost model; walking behaviour and numbers unchanged
interface StepCostModel {
  stepCost: (horizontalM: number, riseM: number) => number;
  costPerMetreLowerBound: number;
}
// findPath(grid, slope, walls, start, goal, { maxSlopeDeg?, heuristic?, cost?: StepCostModel })
// PlannedPath gains `cost: number` (the A* total); distance_m stays the 3D path length.

// lib/mars/driving.ts
export type PowerSource = "fission" | "solar";
export interface DriveSummary {
  one_way_km: number;
  odometer_km: number;
  sols: number;
  hardest_sol_kwh: number;
  battery_left_percent: number;
  reserve_km: number;
  max_slope: number;
  straight_km: number;
  power: PowerSource;
}
export function stepEnergyWh(horizontalM: number, riseM: number, terrainFactor: number): number;
export function planDrive(
  grid: RouteGrid,
  slope: Float32Array,
  walls: Uint8Array,
  base: LngLat,
  target: LngLat,
  power: PowerSource,
): { outbound: PlannedPath; back: PlannedPath; summary: DriveSummary | null };

// lib/flight-rules/drive.ts
export function evaluateDrive(summary: DriveSummary): EvaVerdict;
```

Rules: the formulas and values are the spec's "Design" section; `ROVER_RULES` cites each value's document (title, year, NTRS or URL, page or table) from `docs/research/rover/rover_guidelines_research.md`, with `applies_to` one of `Mars crewed study`, `Mars robotic rover`, `Moon`, `assumption`. Reasons follow the walking style: "(Mars crewed study limit, assumed for this rover)" / "(our assumption)". Rounded numbers in reasons; comparisons on raw values.

- [ ] Failing tests first: `stepEnergyWh` on flat 1 km with k = 1 is about 1,418 Wh and with k = 2 about 2,602 Wh; downhill traction floors at 0 (only life support left); the walking tests in `routing.test.ts` still pass unchanged; an energy-cost A\* on a grid with a hill prefers the flat way round when it costs less energy; `planDrive` on a flat synthetic strip: 93 km straight line gives `sols` 6 with fission and 18 with solar (±1); `evaluateDrive` gives GO / CAUTION / NO-GO at each rule edge and names the limiting rule.
- [ ] Implement. Full check line; commit `routing(feat): Energy-cost A* and the driving trip model` and `flight-rules(feat): Proposed rover rules from NASA studies`.

### Task 11: Walking / Driving switch in the panel

**Files:** modify `components/map/route-planner.tsx`, `components/map/mars-map.tsx` (pass `sites` to the planner only); create `components/map/drive-result.tsx`; as needed `components/map/route-result.tsx`.

- [ ] Mode toggle "Walking / Driving" (`aria-label="Mission type"`) at the top; walking exactly as now.
- [ ] Driving: start defaults to the habitat, end to the nearest site; a destination select of the four sites (title, nearest first); Power toggle "Fission / Solar" (Fission default); the driving grid loads on first use with "Loading rover terrain…".
- [ ] Driving result: verdict alert first (`evaluateDrive`), readouts One way, Round trip, Sols, Battery after the hardest day, Drive-back reserve, Steepest slope; limiting readout marked; "Not checked: radiation, dust, daylight, rocks." visible; disclosure lines: rover preset and its source, rolling resistance and the two assumptions, terrain resolution and the lowered slope limits, the two-rover rule, `Search: A*, n cells searched.`
- [ ] On switching to Driving, fit the map to the start and end; on switching back, fly to the habitat.
- [ ] Measure planning time on the real strip in the browser console; if a leg takes more than about 2 s, downsample the strip by 2 in `loadDriveGrid` and say so.
- [ ] Full check line; commit `route-ui(feat): Walking and driving missions in the route panel`.

---

# Part 4: Drive + walk mission (Tasks 12–14)

**Spec:** `docs/superpowers/specs/2026-11-15-drive-walk-design.md`. Tasks 12 and 13 touch different files and run at the same time; Task 14 wires them together. All earlier Global Constraints apply.

### Task 12: Site walk grid, automatic boulder zones, staging point, trip planner (lib only)

**Files:** create `lib/mars/site-grid.ts`, `lib/mars/site-grid.test.ts`, `lib/mars/drive-walk.ts`, `lib/mars/drive-walk.test.ts`. Do not touch `components/`.

```ts
// lib/mars/site-grid.ts
export interface SiteInfo {
  id: string;
  hiriseId: string;
  poi: LngLat;
} // hiriseId e.g. "ESP_033225_2250"
export interface Boulder {
  center: LngLat;
  radius_m: number;
} // diameter/2 + 1 m clearance
export interface SiteGrid {
  grid: RouteGrid;
  slope: Float32Array;
  walls: Uint8Array;
  boulders: Boulder[];
}
export function siteGridFromSlope(
  meta: EquirectMeta,
  slopeTenths: ArrayLike<number>,
  boulders: Boulder[],
  cellM: 2,
): SiteGrid; // pure: max-pool to 2 m, walls = slope > limit or inside a boulder circle; heights all 0
export function loadSiteGrid(site: SiteInfo, signal?: AbortSignal): Promise<SiteGrid>; // geotiff.js window read of `${SITE_DATA_ROOT}/slope/<hiriseId>_slope.tif` around the POI (±1.2 km) + boulders.geojson
export function findStagingPoint(site: SiteGrid, poi: LngLat, base: LngLat): LngLat | null; // rule in the spec

// lib/mars/drive-walk.ts
export interface DriveWalkPlan {
  status: "ok" | "no_staging" | "drive_failed" | "walk_failed";
  collection: RouteCollection | null; // lib/mars/types.ts, null unless ok
  drive: ReturnType<typeof planDrive>;
  walk: {
    outbound: PlannedPath;
    back: PlannedPath;
    timing: WalkLegTiming | null;
    verdict: EvaVerdict | null;
  };
  staging: LngLat | null;
  verdict: EvaVerdict | null; // worse of drive and walk
}
export function planDriveWalk(
  driveGrid: RouteGrid,
  driveSlope: Float32Array,
  driveWalls: Uint8Array,
  site: SiteGrid,
  siteInfo: SiteInfo,
  base: LngLat,
  power: PowerSource,
  samplingMin: number,
): DriveWalkPlan;
```

- [ ] Failing tests first (synthetic grids, no network): max-pooling keeps the steepest 1 m value; a boulder circle walls exactly the cells whose centres are inside it; `findStagingPoint` picks a flat, boulder-free cell in the 0.5–1 km annulus facing the base, falls back within 2 km, returns null when nothing is eligible; `planDriveWalk` on a flat synthetic setup returns legs in order drive-out, walk-out, walk-back, drive-back with `mode`, `from`/`to`, `start_offset_min` non-decreasing, `simulated: false`, a `route` summary whose verdict is the worse leg's, and walk timing equal to `walkLegTiming` for the walked distance.
- [ ] Implement; `corepack pnpm vitest run lib/mars/site-grid.test.ts lib/mars/drive-walk.test.ts`; full check line; commit `routing(feat): Drive + walk planner with automatic boulder zones and staging points`.

### Task 13: Journey rendering (map layers, legend, readouts) against the sample routes

**Files:** modify `components/map/route-layers.ts`, `components/map/route-layers.test.ts`, `app/globals.css` (add `--route-walk`), `app/design-system/_demos/operational.tsx` (colour table row); create `components/map/route-legend.tsx`, `components/map/journey-result.tsx`. Do not touch `route-planner.tsx`, `route-hooks.ts`, `drive-controls.tsx` or `lib/`.

```ts
// route-layers.ts
export function journeyFeatures(collection: RouteCollection): Feature[]; // the legs + staging point for a "journey" source
export function boulderFeatures(boulders: Boulder[]): Feature[]; // Boulder from lib/mars/site-grid (type only)
// routeLayers(token) gains: journey drive line (--primary), walk line (--route-walk), return legs dashed, each with a --background casing; staging point; boulders (small --destructive dots, minzoom about 13)
// route-legend.tsx
export function RouteLegend(props: { mode: "walking" | "drive-walk" }): JSX.Element;
// journey-result.tsx
export function JourneyResult(props: {
  collection: RouteCollection | null;
  status: string;
  drive: DriveSummary | null;
  walk: { distance_km: number; suit_time_min: number; suit_minutes_left: number } | null;
}): JSX.Element;
```

- [ ] Build against `public/data/samples/routes/*.sample.geojson` (they are `RouteCollection`s). Tests: drive legs and walk legs land on different layers by `mode`; return legs (to = "base" or to = "staging") are dashed; every coloured line has a casing directly under it; no new hex values.
- [ ] Full check line; commit `route-ui(feat): Drive and walk legs in their own colours`.

### Task 14: Wire drive + walk into the panel

**Files:** `components/map/route-planner.tsx`, `components/map/route-hooks.ts`, `components/map/drive-controls.tsx`, `components/map/drive-result.tsx` (or replace with JourneyResult), `lib/mars/sources.ts` (route planner entry: boulder zones and staging rule).

- [ ] The Driving mission is labelled "Drive + walk"; it loads the drive grid and the destination's site grid, runs `planDriveWalk`, draws the collection with Task 13's layers and the site's boulders, shows `JourneyResult` and `RouteLegend`; sampling time input (default 60 min); "Fit whole trip" / "Fit walk" buttons; status messages for `no_staging`, `drive_failed`, `walk_failed`.
- [ ] Browser check; full check line; commit `route-ui(feat): Drive + walk missions in the route panel`.
