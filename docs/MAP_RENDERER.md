# MapLibre renderer

The map uses MapLibre GL JS 6.18.0, licensed under BSD-3-Clause. It replaces
proprietary Mapbox GL JS v3. The renderer and its worker are bundled by Vite.
Labels use the application's local fonts rather than a Mapbox glyph endpoint.
No Mapbox access token is required. Historical dataset provenance still mentions
the renderer used when those files were generated; those immutable files are
not rewritten by this migration.

The following map features retain their existing data and controls:

- Globe overview, local terrain, pitch, bearing and fly-to controls.
- Global Viking color, Arcadia CTX imagery and all four HiRISE site layers.
- Site labels, clickable points, route overlays and layer visibility switches.
- Terrarium elevation tiles, terrain exaggeration and the 3D habitat.
- Optional AI comparison imagery, separate from terrain and measurements.
- Source attribution and cursor coordinates.

The habitat uses MapLibre's custom-layer projection matrix. Terrain elevation
queries already include exaggeration in MapLibre, so no second multiplier is
applied to the queried ground height. The inherited display elevation offset
and Mars model scaling are unchanged.

## Dust display

The dust control now draws an illustrative geographic raster around Arcadia.
It is clipped to the globe, not painted across the screen. The wind control
changes the orientation of the plume. Intensity controls its opacity; Stop
removes it. Close-up views also use MapLibre's sky and fog controls. There are
no screen-space particles in space and no Earth hurricane eye.

The raster is split at the antimeridian. Each image uses coordinates within
−180° to 180°, while both sample the same continuous dust field. A single image
crossing that boundary lost its western half when terrain became active.

Local browser checks cover zooms 2, 3, 4, 5, 6 and 8 across that boundary,
including a pitched, rotated view centered at 180°. Both image halves remain
visible with terrain enabled. Keyboard wind changes and reduced-motion
start/stop commands update both halves together.

The legend says this is simulated relative intensity. Colors are not measured
optical depths, alert levels, or a forecast. Starting and stopping a storm
never changes mission resources or historical NASA observations. Reduced-motion
users receive immediate control updates instead of a ramp.

### Observational data available for future integration

- [MRO MARCI daily global weather maps](https://astrogeology.usgs.gov/search/map/mars_mro_marci_daily_global_weather_maps_pds4_archive)
  show archived dust, cloud and albedo features. The processed map brightness
  must not be treated as calibrated radiance or dust optical depth.
- [Montabone dust climatology](https://www-mars.lmd.jussieu.fr/mars/dust_climatology/)
  supplies column dust optical-depth grids from NASA TES, THEMIS and MCS
  observations. Observation-only maps contain missing areas; complete maps use
  kriging. The product's wavelength, pressure normalization, time and masks must
  remain explicit. These are archived observations and reconstructions, not
  current weather at the simulated habitat.

Neither dataset has been downloaded or connected to the dust control. The
current illustration must not be described as NASA weather data.

## License notices

[public/licenses/maplibre-gl.txt](../public/licenses/maplibre-gl.txt) reproduces
the shipped MapLibre license and embedded third-party notices. It is also served
at `/licenses/maplibre-gl.txt`. Removing Mapbox does not certify the whole
submission's licensing or scientific claims; other dependencies and assets still
need their own citations.
