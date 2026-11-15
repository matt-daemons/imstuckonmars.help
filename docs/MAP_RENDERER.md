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

The habitat loads the existing `/models/mars/hab.glb` asset instead of the old
primitive dome. Its 9,904 triangles include a ribbed shell, windows, airlock,
stairs, solar-cell grids, supports and a ground-mounted communications dish.
The roof antenna has been removed. It is an
original conceptual asset, not a validated NASA habitat. The map preserves the
asset's metre units and ground-level origin. At distant views, display-only
scaling keeps its projected extent at least 90 CSS pixels. The Homebase label
shows Not to scale while enlarged. Close views return to the authored scale;
the base coordinates, terrain elevation and route calculations never change.

The habitat uses an elevated, local tangent frame on the globe and the Mercator
frame at close zoom. Their clip-space matrices blend with MapLibre's projection
transition so the ground origin does not drift when the camera tilts or zooms.
Enlarged views clear terrain depth so
the display symbol is not buried by relief outside its actual footprint.
Terrain elevation
queries already include exaggeration in MapLibre, so no second multiplier is
applied to the queried ground height. The inherited display elevation offset
and Mars model scaling are unchanged.

## Space-to-sky transition

The canvas background fades from dark space at zoom 3 to the Mars sky color
at `TERRAIN_MIN_ZOOM`, currently zoom 5. MapLibre makes the globe sky transparent
above the atmospheric limb, so `setSky` alone cannot supply that backdrop.
The zoom listener updates the canvas background continuously and reverses when
zooming out. It does not change the planet imagery, terrain or dust fields.
Regression tests bind both ends of the fade to the terrain threshold.

## Dust display

The dust control replays the NASA Ames reference simulation of the 2018
global storm. It replaces the earlier invented Arcadia plume. The initial
browser extract contains 128 snapshots sampled every two model sols, spanning
254 elapsed sols, for visible column optical depth and surface lifting.

Load the simulation, select Opacity or Surface lifting, and use Play, Pause,
Reset, Next frame or the time slider. Playback starts paused, stops at the
last frame, and pauses when the tab is hidden. It is separate from the mission
resource clock. A 4 MB download is checksum-verified before display.
Both compressed and transparently decompressed server responses are supported
and verified against their respective checksums.

Eight geographic patches avoid crossing the antimeridian and omit polar caps
above 80°. Both fields use fixed numeric legends; transparent missing cells
are not treated as zero. The source is a 2° global grid, not local weather.
Changing opacity over time does not by itself distinguish transport from
settling. This extract has no wind trajectories. MapLibre's background sky
is a visual treatment, not derived from the simulation.

Source details, encoding and limits live in
[the release README](../public/data/dust/nasa-2018-v1/README.md) and
[manifest](../public/data/dust/nasa-2018-v1/manifest.json).
The offline preparation script is `pipelines/prepare-dust-playback.py`, using
Python with numpy and netCDF4. The original file stays in ignored
`data/raw/dust/`; NASA's published MD5 is verified before extraction.

This bounded 4 MB prototype is bundled in `public/data/dust/`. It is not
telemetry or mission state. Move expanded frame releases to immutable R2
storage rather than increasing the Worker asset bundle without a budget.

Verification: all 4,147,200 retained field values were compared with the source
NetCDF. Maximum quantization error is 0.0005 for optical depth and
5 × 10⁻¹² kg/m²/s for lifting. No retained source cells are masked. Unit tests
also cover missing cells, longitude wrapping, frame limits and corrupted
downloads. Chromium checks on both Vite dev and the packaged Worker exercised
loading, keyboard scrubbing, play/pause, reset, field selection, hiding and
antimeridian terrain views. No dust-request errors or script exceptions occurred.

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

Neither observational dataset has been downloaded or connected to the dust
control. The connected dataset is NASA model output, not NASA observations.

## License notices

[public/licenses/maplibre-gl.txt](../public/licenses/maplibre-gl.txt) reproduces
the shipped MapLibre license and embedded third-party notices. It is also served
at `/licenses/maplibre-gl.txt`. Removing Mapbox does not certify the whole
submission's licensing or scientific claims; other dependencies and assets still
need their own citations.
