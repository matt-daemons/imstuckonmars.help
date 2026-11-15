# Mission sidebar: a calmer LARA layout

Date: 15 November 2026. Size: a project. Approach picked by the user: **A, one docked sidebar that shows one step at a time.**

## Why

The map screen is overwhelming: four floating panels (Layers, Scene, Route, LARA) cover the map, and the Route panel alone holds about a dozen controls, the readouts, a legend and the fine print in one scrolling box. The user wants it calm and easy to handle, and wants the team to be able to add the features still coming without making it worse.

## Goals, non-goals, anti-goals

- **Goal:** at any moment the screen shows the map, one short step of the mission, and the answer (GO / CAUTION / NO-GO) at a glance.
- **Goal:** every feature still planned has an obvious place to go, and adding one does not mean adding another floating panel.
- **Non-goal:** changing how routes are computed, the flight rules, the data layers, the dust model or the copilot's behaviour. This is layout and state plumbing only.
- **Anti-goal:** hiding honesty labels or sources to look tidy. "Not checked: …", "(placeholder)", the Earth-model and assumption labels stay one click away at most, and the verdict's reasons stay visible.
- **Anti-goal:** breaking teammates' work. Layers, Scene, dust playback and LARA move into the sidebar unchanged inside; only their outer container changes.

## Approaches considered

| Approach                                                            | Trade-off                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| **A. Docked sidebar with steps ① Mission ② Where ③ Check (picked)** | Calmest; gives every future feature a home; most work |
| B. Docked sidebar with tabs (Mission · Route · Layers · Sources)    | Everything has a home, but each tab stays busy        |
| C. Trim what is there (collapse panels, hide advanced route tools)  | Quick, but future features still have nowhere to go   |

## Layout

```
┌ LARA · Arcadia base ─────────┐  ┌──── CAUTION · walk slope 17° · margin 3° · shelter 22 min ────┐
│ ① Mission  ② Where  ③ Check  │
│ ──────────────────────────── │
│  (one step's content)        │                     map (fills the rest)
│                              │
│  [ Back ]        [ Next → ]  │
│ ──────────────────────────── │
│ ▸ Map layers                 │
│ ▸ Scene and dust             │
│ ▸ Sources and caveats        │                                               ( Ask LARA )
└──────────────────────────────┘
```

- **Sidebar:** the repo's coss `Sidebar` (`components/ui/sidebar.tsx`), docked left, about 360 px, collapsible off-canvas with its trigger and with H (H now hides the sidebar instead of the four panels). Below `md` it becomes the coss bottom `Drawer`. The map gets `setPadding({ left: sidebar width })` so fits and centring ignore the covered strip.
- **Step ① Mission:** two large choices, "Walk from the base" and "Drive + walk to a site", each with one line saying what it means. Drive + walk shows Power (Fission / Solar) and Sampling time.
- **Step ② Where:** Walk: the end point (click the map or pick the science stop); Drive + walk: the four sites as a list with distance from the base. "Edit route" (closed by default) holds Set start, Set end, Draw no-go zone, Clear zones and their hint.
- **Step ③ Check:** the verdict alert and its reasons, then three headline numbers (Walk: distance, time, steepest slope; Drive + walk: sols, battery after the hardest day, suit minutes left), "Fit whole trip" / "Fit walk", and a "Details" accordion holding every other readout, the legend and "Assumptions and data". This step is also where the timeline and playback will go.
- **Steps are free to move between:** the header is clickable, Back / Next move in order, and nothing is lost when moving. Changing ① or ② replans; ③ is always current.
- **Bottom of the sidebar:** accordion items closed by default: "Map layers" (today's Layer panel content and the Sources link), "Scene and dust" (today's Scene panel content, including the site list, slope hazard, terrain exaggeration and dust playback).
- **Verdict strip:** a slim bar at the top centre of the map: status · limiting constraint · margin · time to shelter (the expert note in CLAUDE.md), read from the mission state; it says "No route yet" when there is none; clicking it opens step ③.
- **LARA:** a floating "Ask LARA" button at the bottom right that opens today's chat panel in a popover or sheet; the wake word keeps working because the panel stays mounted.
- **Map overlays left:** only the verdict strip, the LARA button, the cursor readout, the attribution and the map error badge.

## Shared mission state (for the team)

- A `RoutePlanProvider` (React context with a reducer) holds the route inputs: mission type, start, end, destination, power, sampling time, no-go zones, active step. A `useMissionPlan` hook turns the inputs plus the loaded grids into the result (the walking plan, or the `DriveWalkPlan` and its `RouteCollection`), using the existing lib functions unchanged.
- The map layers move into a `RouteMapLayers` component that renders nothing in the DOM and only syncs the map sources from the mission state.
- Everything else reads `useRoutePlan()`: the steps, the verdict strip, and later the timeline, playback, LARA tools and the solar-storm verdict flip. This replaces the props and state that live inside `route-planner.tsx` today.

## Future features and where they go

| Feature (owner)                                               | Home                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Verdict banner (M)                                            | The verdict strip; styling is M's call                                    |
| Timeline and playback with the rover marker (M, Nova offered) | Step ③ section plus a map marker reading `start_offset_min` from the legs |
| Compare shortest vs safest route (story step 3)               | Step ③ toggle; a second plan in the mission state                         |
| Solar-storm alert flips the verdict (demo moment)             | Live feed into the mission state; the strip and step ③ update             |
| Soft ground from THEMIS thermal inertia, roughness            | Planner inputs; no UI change except a line in "Assumptions and data"      |
| LARA answering about the current route                        | LARA reads `useRoutePlan()`                                               |

## Constraints

- `AGENTS.md` and `.agents/skills/operational-ui-standards/SKILL.md` are binding; coss components unmodified; tokens only; no new dependencies.
- Keep every behaviour that exists today: keyboard placement (Enter, Esc), double-click finish, zone confirmation, the persistent status region, click-to-fly pause while placing, camera fits, the honesty labels.
- **Coordinate first:** M owns the map UI and the verdict banner, and Nova offered to build a shared mission state and banner. Before building, the team agrees who builds what, so two mission states are not written.

## Decided by the user

- **Mission state: local now, sync later.** The route choices (mission type, start, end, destination, power, sampling time, zones, active step) live in a client-side `RoutePlanProvider` (named for routes, not "mission", to avoid a second mission-state owner). A final task sends the chosen route to the backend mission session so the backend stays the single owner (AGENTS.md); that task is agreed with the backend owner before it starts.

## Settled after the builder check (calls made by Claude, not the team)

- **Persistent region (rule L-6):** the time and alert summary must always be visible. The verdict strip therefore also shows LARA's mission clock and its alert summary, read from the existing `useLara` hook (read only). The rest of LARA (chat, readouts, "Play 20×") sits behind the "Ask LARA" button; a new LARA alert puts a badge on the button and appears in the strip, it does not pop the chat open. LaraPanel's insides are not rewritten; only its container moves.
- **Dust legend:** while dust is on, its legend and simulation label stay on the map as a small overlay (AGENTS.md requires it), whether or not the "Scene and dust" section is open or the sidebar is hidden.
- **Walk strip fields:** a walk shows status · limiting constraint · margin (the tightest of slope, walk-back and suit time against `FLIGHT_RULES`, computed from the existing summary numbers) · time to shelter (the walk back to the habitat). No new verdict logic.
- **Small screens:** desktop first. Below `md` the coss Sidebar's built-in left sheet is used as is; no custom bottom drawer. Step ② closes the sheet while a point is being placed.

## Left to the builder

The sidebar width, the exact step copy, which numbers count as "headline" if a verdict's limiting factor is not among them (show it instead), the drawer breakpoint, and how the verdict strip truncates on narrow screens.
