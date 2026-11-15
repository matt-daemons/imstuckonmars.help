# Weather risk drills

The expedition has only explicit, operator-injected weather risks. It does not select a historical date, fetch weather for the simulation, change scene lighting, or show weather particles/crew effects. The dashboard's existing NASA environmental reference and the separate NASA Ames dust-map replay are unchanged.

In **04 Run → Risk simulations**, confirm **Dust front** or **Cold snap**. Each appends a revisioned `weather_risk` event with `risk: "dust" | "cold"` and `active: boolean`. No weather release, date, or observations are needed.

- Dust multiplies outside oxygen demand by **1.25** and adds the corresponding exertion load to fixed suit equipment power. It compounds with an independently injected exertion fault. The profile's existing 30 W thermal allowance per two crew is not multiplied again by dust.
- Cold adds **70 W per two crew** of heater load while outside, on top of the original activity profile. This is a bounded equipment assumption, not a measured temperature or validated suit model.
- Neither drill changes walking speed, base generation or observations. Suits draw neither extra energy nor oxygen from these drills while sheltered.
- **Clear dust** and **End cold snap** remove only the named risk. They do not refill resources, clear equipment faults or rewrite the past. Reset clears all events; End simulation freezes the result.

`lib/mission/weather-risks.ts` owns the constants and load calculations. The shared deterministic engine, return forecasts, external return checks, suit-rate display, alerts and reports use the same model. `weather_risk_effects` records outside drill durations, extra oxygen demand, extra exertion energy and extra heater energy including discharge efficiency. These are requested model quantities, not physiological exposure or measured weather.

The historical-weather prototype was removed before deployment. Its already-applied local migration `0003_weather.sql`, schema mapping and locally imported rows are retained only to preserve migration history and avoid modifying populated databases. There is no `WEATHER_RELEASE` runtime binding, weather API, import script or deployment dependency on that companion. Do not reimport or publish the retired companion as part of deploying these risks.

Run the standard repository checks. `lib/mission/weather-risks.test.ts` covers independent activation/recovery, deterministic ordering, unchanged no-drill behavior, fractional event boundaries, inventory accounting, shelter behavior, replanning and return forecasts. Browser verification should also check that no date selector, historical weather requests or added weather visuals appear, while the risk controls and saved reports still work.
