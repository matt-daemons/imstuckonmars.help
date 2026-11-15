# Fake data mode

Fake data mode is an off-by-default, map-only demonstration. Debug contains the
toggle. It resets to off on page reload; no preference, observation or mission
state is persisted. Turning it off removes the synthetic layers and playback.

The fictional network has 288 stations on a 15-degree global lattice and two
polar stations. Each station has a reading every ten seconds, six per Earth
minute, plus a final boundary sample at exactly seven complete Martian solar
days. One SOL is 88,775.244 seconds. There are 62,144 sample instants per station,
generated on demand instead of keeping over 18 million readings in memory.
The display clock divides a SOL into 24 equal synthetic hours, not Earth hours.
There are no real dates or claims of observations from a future instrument.

Eight independent layers show sensor locations, wind and sandstorm direction,
ground temperature, above-ground temperature, soil hardness, pressure, radiation
and relative humidity. The equations in `lib/mars/fake-sensors.ts` are invented,
bounded and deterministic. They are not calibrated Mars models.

- Wind arrows point **toward** the travel heading, clockwise from north.
  Storm intensity is a unitless illustrative index, not measured dust opacity.
- Temperatures use degrees Celsius. Sensor depth and height are unspecified.
- Soil hardness is fictional penetration resistance in MPa. It does not certify
  terrain traversability or replace the existing terrain and slope products.
- Radiation is fictional detector absorbed dose rate in µGy per Earth day.
  It is not human dose equivalent, crew exposure or a radiation-safety forecast.
- Relative humidity is fictional percent. It does not reinterpret the archived
  MEDA humidity products or their unresolved unit metadata.

These values never enter NASA datasets, Hono/D1, route masks, route caches,
expedition resources, weather drills, the reference dashboard or LARA tools.
Existing NASA layers keep their own provenance. A persistent synthetic-data
label and per-layer units accompany every enabled fake-data view.
