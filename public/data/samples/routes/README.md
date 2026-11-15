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
2 km/h walk (flight rule), 60 min sampling. `rover_battery` is **not a flight rule yet** (pending
role A). `lib/mars/route-samples.test.ts` checks that the numbers agree with the lines and with each other.
