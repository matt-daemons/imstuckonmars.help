# Drive + walk mission: design

Date: 15 November 2026. Approved by the user ("Yes, build it"). Builds on the driving mission.

## Why

The team's mission is a rover drive to a water-ice site followed by a short suited walk. The user wants one best path that mixes both, different colours for driving and walking, and no-go zones that appear automatically instead of being drawn by hand.

## Design

- The Driving mission becomes **Drive + walk**. Walking missions near the habitat stay as they are; hand-drawn zones still work in both.
- **Drive leg:** the existing energy-cost A* on the 463 m MOLA strip, habitat → staging point and back.
- **Staging point (automatic):** on the site's 1 m HiRISE slope grid, the flat (≤ the rover's 5° caution slope over the parking area), boulder-free spot 0.5–1 km from the POI on the side facing the habitat (within ±60° of the POI→habitat bearing), nearest that bearing; if none, the nearest eligible spot within the 2 km walk-back limit; if none, status `no_staging`. Keeping the rover outside the crater matters because 463 m terrain cannot see a 130 m crater.
- **Walk leg:** A* on the site slope grid, read from the R2 slope COG (`sites-v1/slope/<HiRISE>_slope.tif`, Int16 tenths of a degree) in a window around the POI and max-pooled to 2 m cells (a 2 m cell takes its steepest 1 m slope, so walls are never under-counted). Walls: slope above `FLIGHT_RULES.slope.no_go_above_degrees`, plus **automatic boulder zones**: every boulder in `public/data/processed/boulders.geojson` for that site becomes a circle of radius diameter/2 + 1 m clearance (clearance is our assumption). Cost is distance; time comes from Nova's `walkLegTiming` (2 km/h flight-rule pace, sampling time input, 30 min reserve); the walk check is `evaluateRoute` with `est_time_min` from `walkLegTiming` and `farthest_from_base_km` measured from the staging point (the rover is the safe haven).
- **One verdict:** the worse of the drive verdict (`evaluateDrive`) and the walk verdict; its limiting factor and reasons come from that leg.
- **Output:** a `RouteCollection` (lib/mars/types.ts) in the team's agreed format (public/data/samples/routes/README.md): legs in travel order — 1 drive out, 2 walk out, 3 walk back, 4 drive back — each a `route-leg` with `RouteLegProperties`, one `staging` point, and the top-level `route` summary with `margin` and `time_to_shelter_min` (0 while driving; the walk's time back to the rover while walking). `simulated: false`, `source` names the data.
- **Map:** drive legs in `--primary` (cyan), walk legs in a new non-status token `--route-walk` (violet), return legs dashed, each with a dark casing; staging point marker; boulders as small red dots at site zoom; legend "Drive · Walk · Return (dashed) · Staging point · Boulder · No-go zone".
- **Panel:** destination, power, sampling time (default 60 min), verdict first, readouts in two groups (Drive: one way, sols, battery after the hardest day, reserve; Walk: distance out and back, suit time, suit minutes left), "Fit whole trip" and "Fit walk" buttons (the walk is ~1 km inside a ~100 km trip).

## Calls made by the builder

- Boulder clearance 1 m and the staging rule above are our assumptions, labelled in "Assumptions and data".
- The walk uses Nova's 2 km/h flight-rule pace (not Tobler) so the drive + walk numbers match the team's walk-leg timing; walking missions near the habitat keep Tobler.
- The ridges site has 1 boulder in the data; it still works, with a note that boulder coverage differs by site.
- This covers the team's task #2 (staging points) for the four POIs; tell Jess.
