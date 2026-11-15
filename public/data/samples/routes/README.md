# Sample routes (hand-made — not real routes)

Three small GeoJSON files so M can build the route display, timeline and verdict banner
before Role C's real routes exist. C's routes will use the same shape, so the UI should not
need changes when they are swapped in. Every number here is **made up** and marked
`simulated: true`; keep the "SAMPLE" label visible if one is ever shown in a demo.

| File                           | Destination              | Verdict     | What it exercises                                    |
| ------------------------------ | ------------------------ | ----------- | ---------------------------------------------------- |
| `route-go.sample.geojson`      | ESP_033225 (93 km)       | **GO**      | Normal drive + walk                                  |
| `route-caution.sample.geojson` | ESP_033225, farther walk | **CAUTION** | Walk leg on a 17.5° slope (caution above 15°)        |
| `route-no-go.sample.geojson`   | ESP_034082 (194 km)      | **NO_GO**   | Drive leg leaves the rover battery below its reserve |

## Shape (types in `lib/mars/types.ts`: `RouteLegProperties`, `RouteSummary`)

- **One `LineString` feature per leg**, `kind: "route-leg"`, drawn in travel order:
  leg 1 `mode: "drive"` base → staging point, leg 2 `mode: "walk"` staging point → POI (outbound only).
  Leg props: `distance_km`, `est_time_min` (moving time), `stop_min` (sampling at the end of the leg),
  `start_offset_min` (timeline position), `max_slope`, `verdict`, `limiting_factor` (null when GO),
  `reasons[]`, `time_to_shelter_min` (pressurized rover = shelter, so 0 while driving).
- **One `Point` feature**, `kind: "staging"`: where the rover parks and the walk starts.
- **Top-level `route` member** = the banner summary: totals over the legs, worst verdict and its
  `limiting_factor`, `margin` `{resource, value, limit, unit}`, worst `time_to_shelter_min`, `source`.
  MapLibre ignores this member, so fetch the file yourself to read it.

Base and POI coordinates match `stops.geojson` and `sites.geojson`. Leg distances are true
great-circle lengths of the drawn lines on the Mars 2000 sphere. Assumed: 10 km/h rover average,
2 km/h walk (flight rule), 60 min sampling. `lib/mars/route-samples.test.ts` checks that the numbers
agree with the lines and with each other.

## How these differ from real routes (Sun Nov 15)

Real routes now come from the planner (`planDriveWalk` in `lib/mars/drive-walk.ts`) in this same
format, so these files are kept only as a test fixture (`components/map/route-layers.test.ts`) and a
format example. Differences:

- Real routes have **4 legs**: drive out, walk out, walk back, drive back. These samples hold only
  the 2 outbound legs.
- Real verdicts use the **agreed rover rules** (`lib/flight-rules/rover-rules.ts`): slope 5° / 10°,
  battery 30 / 20 %, reserve, range 100 / 200 km, trip length in sols. The sample numbers predate
  them, so some sample verdicts would differ (e.g. the 8.4° drive slope would now be CAUTION).
- Real `est_time_min` includes the nights of multi-sol drives; these samples assume one continuous drive.
- Rule and resource names match the planner: `limiting_factor: "battery"`, `margin.resource: "rover_battery"`.
