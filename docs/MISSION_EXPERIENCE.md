# Camera views and mission review

The existing MapLibre globe, imagery, terrain and mission engine remain the owners of the world and simulation. `components/map/mission-view.tsx` owns presentation only. No new imagery, weather effects, resources or mission clocks are introduced.

## Direct entry

The app opens directly into the map workspace at the simulated Arcadia homebase. There is no home screen, intro sequence or first-visit storage gate. Map imagery loads without blocking the planning controls; failures retain a visible retry action.

Existing mission sessions still resume normally, with the map framing the loaded expedition. Camera views continue to respect reduced motion.

## Camera and route inspection

**Camera views** offers region Overview, Homebase, Route, Inspect target and Follow crew. `components/route/camera.ts` owns shared framing, antimeridian-aware bounds and motion preferences. Named views do not issue mission commands. Manual pan, zoom, rotation or tilt stops crew following; follow is explicitly re-enabled by the operator.

On handheld screens, the camera menu opens upward above the attribution and chat controls. Training starts collapsed but remains expandable; its checklist and progress are unchanged.

The chosen safest/shortest route is the emphasized route; optional comparison uses the other route in thin gray. `components/route/selected-route.ts` is shared by the map, terrain verdict, resource preview, launch and LARA's launch handoff. A missing chosen shortest route never silently becomes the safest route.

In Check, selecting a leg in the resource budget highlights the same geometry on the map. Clicking a mapped walking leg selects its budget row. A selected-target ring and a map readout identify the selected route or inspected leg. These are presentation overlays only; scientific and hazard layers keep their values and visibility.

## Launch and completion

The map launch control always opens **Mission manifest**. It captures the route, destination, loaded supplies and reserves, predicted return margins, sampling, sortie duration and playback speed being reviewed. The drive remains planner-only for a drive + walk; this boundary is stated in the manifest. Route warnings and replacement of an existing run remain explicit. If the plan changes during review, launch is disabled until the updated manifest is opened.

On completion or End simulation, the bottom controls disappear and a brief **Simulation complete** or **Simulation ended** notice appears. **Open report** skips that notice; otherwise the report opens after 1.6 seconds. The existing report archive and retry behavior remain unchanged. The crew pulse pauses with the mission rather than suggesting continued activity.

Design-system specimens: `#camera-views`, `#mission-manifest`, `#completion-transition`. Desktop viewing distance is assumed to be 600 mm and handheld 400 mm. No interface-wide panel or theme redesign is part of this change.

Verify direct entry on first and repeat visits, slow/failed asset loading, reduced motion, mobile and zoomed layouts, camera presets, shortest-route geometry consistency, bidirectional leg inspection, stale manifest rejection, completion and saved reports. Synthetic unit fixtures establish UI logic, not scientific validity.
