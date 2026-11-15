# Mission sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four floating map panels with one docked sidebar that shows one step at a time (01 Mission 02 Where 03 Check), a verdict strip, and an "Ask LARA" button, on top of one shared route-plan state that future features can read.

**Architecture:** Route inputs move out of `route-planner.tsx` into a `RoutePlanProvider` (context + reducer); planning moves into a `useRoutePlanResult` hook built from the existing lib functions; map sources are synced by a DOM-less `RouteMapLayers`. The coss `Sidebar` hosts three step components and two closed sections that wrap today's Layer and Scene panel contents. The backend mission session stays the single mission-state owner; a last task sends the chosen route to it.

**Tech Stack:** React 19.3, TypeScript, Tailwind v4, MapLibre GL 6.18, coss/Base UI (`Sidebar`, `Accordion`, `ToggleGroup`, `Popover`/`Sheet`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-mission-sidebar-design.md`

## Global Constraints

- Starts after the drive + walk work (PR #3) is merged; branch from the updated `main`.
- `AGENTS.md` and `.agents/skills/operational-ui-standards/SKILL.md` are binding; coss components unmodified; colours from tokens; no new dependencies.
- No change to route maths, flight rules, data layers, dust model or copilot behaviour.
- Every current behaviour keeps working: Enter/Esc placement, double-click finish, zone confirmation, persistent status region, click-to-fly pause while placing, fits, honesty labels.
- Teammates' panel insides (Layer, Scene, dust playback, LARA) move without rewriting; only containers change.
- L-6: the time and alert summary are always visible (the verdict strip).
- Karpathy guidelines and readable code (user's hard requirement); no AI or Claude credit; never push without the user; Node 24 + `corepack pnpm`.

## Review Focus

1. Switching steps or hiding the sidebar loses no input (destination, zones, power, sampling).
2. Placing a point on the map from step 02 still works with the sidebar open, and on a small screen the sheet gets out of the way.
3. The verdict strip never shows a stale verdict after inputs change.
4. With dust on, its legend stays visible even with the sidebar hidden.
5. LARA's clock and alert stay visible while the chat is closed; a new alert badges the button.

---

### Task 15: Route-plan state, planning hook and map sync (refactor, no visible change)

**Files:** create `components/route/route-plan.tsx` (provider, reducer, `useRoutePlan`), `components/route/route-plan.test.ts`, `components/route/use-route-plan-result.ts`, `components/route/route-map-layers.tsx`; modify `components/map/route-planner.tsx`, `components/map/route-hooks.ts`, `components/map/mars-map.tsx` (wrap in the provider).

```ts
export type MissionType = "walking" | "drive-walk";
export type Step = "mission" | "where" | "check";
export interface RoutePlanInputs {
  mission: MissionType;
  start: LngLat;
  end: LngLat;
  destinationId: string | null;
  power: PowerSource;
  samplingMin: number;
  zones: NoGoZone[];
  step: Step;
}
export type RoutePlanAction =
  | { type: "setMission"; mission: MissionType }
  | { type: "setStart"; point: LngLat }
  | { type: "setEnd"; point: LngLat }
  | { type: "setDestination"; id: string }
  | { type: "setPower"; power: PowerSource }
  | { type: "setSampling"; minutes: number }
  | { type: "addZone"; zone: NoGoZone }
  | { type: "clearZones" }
  | { type: "goTo"; step: Step };
export function routePlanReducer(state: RoutePlanInputs, action: RoutePlanAction): RoutePlanInputs;
export function RoutePlanProvider(props: {
  base: LngLat;
  target: LngLat;
  sites: SitePoi[];
  children: ReactNode;
}): JSX.Element;
export function useRoutePlan(): {
  inputs: RoutePlanInputs;
  dispatch: Dispatch<RoutePlanAction>;
  result: RoutePlanResult;
};
export interface RoutePlanResult {
  status: string;
  walk: ReturnType<typeof planWalk> | null;
  driveWalk: DriveWalkPlan | null;
  verdict: EvaVerdict | null;
  loading: boolean;
}
```

- [ ] Reducer tests first: each action changes only its field; `setMission` resets start/end/destination to that mission's defaults (today's behaviour); `setSampling` clamps 0–480; zones append and clear.
- [ ] Move the planning hooks into `useRoutePlanResult` and the source syncing into `RouteMapLayers`; the existing panel reads `useRoutePlan()`. The page must look and behave exactly as before (browser check).
- [ ] Full check line; commit `route-ui(refactor): Shared route-plan state for the map panels`.

### Task 16: Docked sidebar with steps

**Files:** create `components/route/route-sidebar.tsx`, `components/route/steps/mission-step.tsx`, `where-step.tsx`, `check-step.tsx`, `components/route/sidebar-sections.tsx`; modify `components/map/mars-map.tsx` (sidebar instead of the Layer, Scene and Route panels; H toggles the sidebar; remove the hide-all toggle), `components/map/layer-panel.tsx` and `scene-panel.tsx` (export their bodies so the sections can host them unchanged), `app/globals.css` only if needed.

- [ ] coss `SidebarProvider` + `Sidebar` (left, off-canvas, ~360 px) with header "LARA · Arcadia base", step tabs 01 02 03 (clickable), Back / Next, and footer accordion items "Map layers" and "Scene and dust" (closed by default; Sources link inside Map layers).
- [ ] Step 01: two large choices with one line each; Drive + walk adds Power and Sampling time. Step 02: Walk end point / site list with distances; "Edit route" (closed) holds Set start, Set end, Draw no-go zone, Clear zones and the mode hint. Step 03: verdict alert + reasons, three headline numbers (the limiting factor's readout always among them), Fit buttons, "Details" accordion with the remaining readouts, legend and "Assumptions and data".
- [ ] `map.setPadding({ left: sidebarWidth })` while open; 0 when hidden. Below `md` the coss sheet; it closes while a point is being placed.
- [ ] Browser check at 1440 × 900, 1280 × 720 and the pane size; full check line; commit `route-ui(feat): Mission sidebar with steps`.

### Task 17: Verdict strip, LARA button, dust legend overlay

**Files:** create `components/route/verdict-strip.tsx`, `components/copilot/lara-launcher.tsx`; modify `app/page.tsx` / `components/map/mars-map.tsx` (mount points), `components/map/dust-playback.tsx` only to let its legend render as a map overlay when the section is closed (or render the legend from mars-map; pick the smaller change).

- [ ] Verdict strip at the top centre: status · limiting constraint · margin · time to shelter from `useRoutePlan().result` (walk margin = tightest of slope, walk-back, suit time vs `FLIGHT_RULES`; shelter = walk back time) plus LARA's clock and alert summary from `useLara` (read only); "No route yet" when empty; click → step 03. Truncates on narrow screens.
- [ ] "Ask LARA" button bottom right opens LaraPanel (mounted always) in a popover/sheet; a new alert shows a badge.
- [ ] Dust legend and simulation label visible on the map whenever dust is on.
- [ ] Browser check; full check line; commit `route-ui(feat): Verdict strip and LARA launcher`.

### Task 18: Send the chosen route to the backend mission session (agree with the backend owner first)

**Files:** to be agreed; likely `components/route/use-route-plan-result.ts` and `server/api/missions.ts` (`POST /:id/assess-return` already parses a `route`).

- [ ] Agree with the backend owner whether the route goes through `assess-return` or a new command, and what revision rule applies.
- [ ] Implement, test the endpoint with `api.request`, browser check that LARA sees the route.

### Task 19: Final check and PR

- [ ] Review Focus walk-through in the browser; one reviewer over the whole branch; PR into `main`.
