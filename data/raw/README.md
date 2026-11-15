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

## HiRISE water-ice sites (`pnpm pipe:sites`)

| File | Source | Downloaded | CRS |
|---|---|---|---|
| `hirise/DTEEC_033225_2250_033146_2250_A01/*.IMG` + `ESP_033225_2250_RED_A_01_ORTHO.JP2` | hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_033200_033299/ (found via ODE REST)             | 2026-11-14 | Equirectangular, local-radius sphere R=3387887.658 m, lat_ts 40°, lon_0 183.68°E; planetocentric, east-positive. DTM 1.0 m, ortho 0.25 m                          |
| `hirise/DTEEC_034082_2260_033014_2260_A01/*.IMG` + `ESP_034082_2260_RED_A_01_ORTHO.JP2` | …/ORB_034000_034099/                                                                   | 2026-11-14 | Equirectangular, R=3386150.747 m, lat_ts 45°, lon_0 188.62°E. **JP2 GeoJP2 header has lat_ts 0° → GDAL puts it at ~90°N; use the DTM's CRS (metre coords match)** |
| `hirise/DTEEC_037352_2245_037418_2245_A01/*.IMG` + `ESP_037352_2245_RED_A_01_ORTHO.JP2` | …/ORB_037300_037399/                                                                   | 2026-11-14 | Equirectangular, R=3387887.658 m, lat_ts 40°, lon_0 193.86°E. **Same JP2 header bug (~84°N); use the DTM's CRS**                                                  |
| `hirise/DTEEC_054060_2265_054126_2265_A01/*.IMG` + `ESP_054060_2265_RED_A_01_ORTHO.JP2` | …/ORB_054000_054099/                                                                   | 2026-11-14 | Equirectangular, R=3386150.747 m, lat_ts 45°, lon_0 172.56°E (west of ±180)                                                                                       |

All processed outputs are reprojected to lon/lat on the Mars 2000 sphere (`+proj=longlat +R=3396190`), east-positive −180..180.
Angles carry over unchanged from the local-radius spheres (no datum shift between Mars spheres).
