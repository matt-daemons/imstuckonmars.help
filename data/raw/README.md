# data/raw

As downloaded, never edited. Files here are gitignored; this README is not.
Add one line per download: file · source URL · date · CRS (lat convention, lon direction).

`terrain/viking/*.jpg`: 32 [NASA Trek Viking color mosaic tiles](https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml),
level 2, rows 0–3, columns 0–7, retrieved 2026-11-15 UTC. Geographic 2:1 matrix,
planetocentric, east-positive. Hashes and reprojection are in `public/data/terrain/globe/provenance.json`.

| File                               | Source                                                                                                                                                        | Downloaded     | CRS                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `terrain/mola-hrsc-hab-subset.tif` | Bounded native-grid read of [USGS MOLA/HRSC blend v2](https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif) | 2026-11-15 UTC | Mars sphere 3,396,190 m; planetocentric, east-positive; source missing value −32768                                                       |
| `terrain/ctx/*.jpg`                | 24 cached [CTX service tiles](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer), level 12, rows 999–1002, columns 88–93                    | 2026-11-15 UTC | Mars sphere 3,396,190 m; geographic matrix, planetocentric, east-positive; individual hashes in `public/data/terrain/ctx/provenance.json` |
