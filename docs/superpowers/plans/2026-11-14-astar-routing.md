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
