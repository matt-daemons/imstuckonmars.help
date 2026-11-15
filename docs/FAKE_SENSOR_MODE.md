# Fake data mode

Fake data mode is an off-by-default, map-only demonstration. Debug contains the
toggle. It resets to off on page reload; no preference, observation or mission
state is persisted. Turning it off removes the synthetic layers and playback.

The fictional network has 580 stations distributed with an equal-area Fibonacci
sphere, avoiding the polar crowding of a latitude/longitude grid.
Each station has a reading every ten seconds, six per Earth
minute, plus a final boundary sample at exactly seven complete Martian solar
days. One SOL is 88,775.244 seconds. There are 62,144 sample instants per station,
generated on demand instead of keeping over 36 million readings in memory.
The display clock divides a SOL into 24 equal synthetic hours, not Earth hours.
There are no real dates or claims of observations from a future instrument.

Seven layer controls show sensor locations, wind and sandstorm direction,
ground temperature, above-ground temperature, pressure, radiation
and relative humidity. The equations in `lib/mars/fake-sensors.ts` are invented,
bounded and deterministic. They are not calibrated Mars models.
Repeatable spherical noise adds broad regional weather, smaller moving fronts
and fixed terrain variation. Adjacent locations and ten-second samples change
smoothly; the field joins across the longitude seam. This makes the demonstration
less uniform without implying that the invented patterns are real observations.

- Wind arrows point **toward** the travel heading, clockwise from north.
  Storm intensity is a unitless illustrative index, not measured dust opacity.
- Temperatures use degrees Celsius. Sensor depth and height are unspecified.
- Radiation is fictional detector absorbed dose rate in µGy per Earth day.
  It is not human dose equivalent, crew exposure or a radiation-safety forecast.
- Relative humidity is fictional percent. It does not reinterpret the archived
  MEDA humidity products or their unresolved unit metadata.

These values never enter NASA datasets, Hono/D1, route masks, route caches,
expedition resources, weather drills, the reference dashboard or LARA tools.
Existing NASA layers keep their own provenance. A persistent synthetic-data
label and per-layer units accompany every enabled fake-data view.

## Controls

Open Debug with Shift+D and enable Fake data mode. A dashed frame and persistent
map legend identify the synthetic view. Map layers then contains seven separate
toggles and the shared timeline. Only sensor locations start visible. Ground
temperature, air temperature, pressure and radiation use seven-band
shaded fields with distinct palettes and darker contour boundaries. One shaded
field is visible at a time; selecting another switches it. These fields evaluate
the invented equations between sensors, not an observed global dataset. Four
seam-separated raster patches cover latitudes −85° to +85°; station markers and
vectors also cover the polar regions.

Playback advances the selected ten-second frame at 60×, 3600× or 21,600× speed.
It stops at the end of SOL 07 and pauses when the browser tab is hidden. Scrubbing
pauses playback. Nothing plays automatically when the mode is enabled.
Select a station on the map, or use the keyboard-accessible sensor dropdown,
to inspect all its values. Geographic wind vectors point toward travel; length
shows speed and white-to-orange color shows the unitless sandstorm index.
Relative humidity uses percentage labels at station positions, with overlap
suppression. Wind, humidity and sensor locations remain independently toggleable
over the selected shaded field.
