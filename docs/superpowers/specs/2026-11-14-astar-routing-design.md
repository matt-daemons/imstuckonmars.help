# A* route planner: design

Date: 14 November 2026. Size: small change.

## Why

The challenge asks for a route that avoids obstacles. LARA has no route planner yet; `route.geojson` is a hand-drawn placeholder. The team wants a point A to point B route found with A*, as taught in the AI class.

## What we found

The only elevation data at the base is the bounded MOLA/HRSC grid (nominal 200 m), served as Terrarium tiles at `legacy/display/hab/{z}/{x}/{y}.png` with a +10,000 m display offset. On the zoom-9 tile covering the base, the steepest slope is 2.2° and relief is 39 m across about 29 km. A slope wall alone blocks nothing there. Boulders and small craters are not visible in this grid.

## Approaches

| Approach                                                   | Trade-off                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Slope walls only                                           | Honest, but the route is nearly a straight line at this base                                                                           |
| **Slope walls plus no-go zones drawn on the map (picked)** | Real slope data still applies; the crew marks boulder fields or crater rims they see in the 5 m CTX imagery, and A* routes around them |
| Auto-detect obstacles from CTX imagery                     | Most impressive, slowest to build; imagery registration can be off by up to 200 m                                                      |

Algorithm: A* rather than Dijkstra, because one start and one goal is exactly what A* is for. Dijkstra is the better tool later, for a "how far can I get and still return" field from the base.

## Design

- **Core** (`lib/mars/routing.ts`, pure, no browser APIs): 8-neighbour A* on a grid of cells with true metre spacing per row (Mars radius 3,396,190 m, cos(latitude) for east-west). No corner cutting. A cell is a wall if it has no data, is inside a no-go zone, or its steepest slope is above `FLIGHT_RULES.slope.no_go_above_degrees` (20°). A step is also refused if its own grade is above that limit. Step cost is 3D length in metres. Heuristic is straight-line distance using the smallest cell spacing, so it never overestimates.
- **Output:** path as longitude and latitude, distance, steepest grade along the path, cells searched, and status (`ok`, `no_path`, `outside_grid`, `start_blocked`, `goal_blocked`). Time uses Tobler's off-path hiking function, labelled as an Earth hiking model, not a suited Mars walk. The outbound and return paths are planned separately and give `est_time_min`, `max_slope` and `farthest_from_base_km`, the fields `evaluateEva` reads.
- **Grid** (`lib/mars/route-grid.ts`): decodes Terrarium RGBA into heights, subtracts the display offset, and gives each Web Mercator row its own latitude. The browser loader fetches the four zoom-10 tiles of the base (about 56 m cells; the source is coarser, so this is not extra detail).
- **Map** (`components/map/route-planner.tsx`): start defaults to the base, end to the science stop. Buttons set start, set end, draw a no-go zone (click corners, then Finish), and clear zones. Draws the route line and red zones, and shows distance, time, steepest grade and cells searched. The placeholder route layer is hidden by default.

- **Route check** (added 14 November, approved by the user): the panel shows how far the route goes from base and a route-only verdict from `evaluateRoute`, which runs the same slope, walk-back and suit-time rules as `evaluateEva`. It says plainly that radiation, dust and daylight are not checked there. On the default route this reads NO-GO: 5.44 km from base against the 2 km walk-back limit.

## Calls made by the builder (not decided by the team)

- One example no-go zone between the base and the science stop is preloaded, labelled placeholder, so the first view shows avoidance.
- Zones live only in the page; they are not saved.
- No path smoothing, so the line has grid zig-zags.

## Out of scope

Rock detection from imagery, energy and oxygen use, several stops, the full GO/NO-GO verdict with live data (that stays with `evaluateEva`).
