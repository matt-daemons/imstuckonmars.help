# ARES: scientific data analysis

Research date: 2026-11-14. Repository snapshot: `b6e0e4c83bde486d724c69b39143695726c64410`.

## 1. Executive summary

**ARES should build a bounded Jezero exploration-planning demonstration, not claim operational astronaut navigation.** NASA-derived topography can support terrain screening and route comparison. Geologic interpretations and rover observations can explain why a destination matters. EVA resources must be explicitly modeled, not presented as NASA telemetry.

The decisive availability finding is that **there are no local scientific datasets in this checkout**. All 30 project files, including hidden configuration files, were inventoried. There are no rasters, geologic vectors, observation tables, scientific archives, data directories, or data-processing scripts. No external data directory was supplied; arbitrary folders outside the project were not searched.

Actual analysis therefore consists of repository inventory and programmatic inspection of three small official metadata records: the Jezero CTX DEM PDS4 label, its matched orthoimage label, and USGS SIM 3464 geologic-map metadata. These reveal concrete coverage, resolution, missing-value, registration, and memory constraints. **No elevation samples or vector geometries were obtained, and no elevation or slope statistics can honestly be reported.**

Key findings:

- The CTX DEM is a single-band, 20 m grid with 22,578,552 cells. Its uncompressed float32 array requires 90,314,208 bytes before masks or routing structures.
- Its companion image is approximately 5 m/pixel, nominally four pixels per DEM-cell side, but its origin, spacing and footprint differ. The grids cannot be joined by array index.
- The USGS web catalog reverses the DEM latitude extrema and lists a radius different from the PDS4 label. Ingestion must reconcile metadata against the actual raster header.
- SIM 3464 explicitly warns of roughly 100-200 m offsets from controlled surface-operations imagery. Geologic contacts are contextual, not precise exclusion boundaries.
- Mars Trek provides rendered WMTS tiles. Colored elevation shading is not a numeric DEM.
- A quantitative THEMIS thermal-inertia product would add Mars Odyssey data, but its published regional file is approximately 2.53 GB. No such file was downloaded.

Product choices are in [FEATURE_RESEARCH.md](FEATURE_RESEARCH.md); integration contracts and data gates are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## 2. Evidence and availability inventory

Evidence terms used throughout:

| Label                        | Meaning                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Local observation            | Inspected repository content                                                         |
| Metadata observation         | Value read from an official label or publication, not verified against raster pixels |
| Metadata-derived calculation | Arithmetic on label dimensions, resolutions, or boundaries                           |
| Proposed derivation          | Calculation possible after the underlying data is acquired                           |
| Simulation                   | Scenario output dependent on declared, unvalidated operating assumptions             |

| Dataset or source                            | Local availability     | Material actually inspected                                                | Mission or provenance                                           |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Science Investigation Jezero CTX DEM, 2021   | Absent                 | Catalog and PDS4 XML label                                                 | MRO CTX stereo, registered to MOLA control                      |
| Matched Science Investigation CTX orthoimage | Absent                 | PDS4 XML label and DEM catalog description                                 | MRO CTX                                                         |
| Mars 2020 Jezero landing-site collection     | Absent                 | Collection description                                                     | CTX and HiRISE products supporting Mars 2020                    |
| SIM 3464 Jezero/Nili Planum geology          | Absent                 | FGDC metadata, GIS README, distribution listing                            | NASA-funded USGS interpretation using multiple orbital datasets |
| Mars Trek                                    | No integration present | Portal HTML, API documentation/configuration, one WMTS capabilities record | Service aggregating mission products                            |
| Perseverance observations and images         | Absent                 | NASA raw-image gallery and rover location-map description                  | Mars 2020                                                       |
| THEMIS apparent thermal inertia              | Absent                 | Global collection and Jezero-covering quantitative tile catalog            | 2001 Mars Odyssey THEMIS                                        |
| Atmosphere, radiation, spectra, chemistry    | Absent                 | Curiosity instrument overview only for radiation limitations               | No local measurements or analysis-ready products                |

### Inspection method

The repository was scanned recursively, including hidden files, excluding VCS internals and dependency/build caches. Extension counts were: 5 `.json`, 7 `.ts`, 3 `.tsx`, 3 `.nix`, 2 `.md`, 2 `.yaml`, and one each `.css`, `.jsonc`, `.lock`, `.mjs`, `.sh`, plus 3 extensionless files. These are project files, not NASA data. The total was 216,860 bytes before this documentation was added. A VCS file listing independently confirmed the 30-file inventory. There were no root symlinks pointing to datasets.

Python standard-library XML parsing was used on three bounded text downloads, each limited to 256 KiB. Together the records contained 38,358 bytes. Verified HTTPS retrieval used `curl`. Raw metadata and arithmetic output were kept in task-local temporary storage, not committed as datasets.

No packages were installed for scientific analysis. NumPy was available but unnecessary; GDAL, rasterio, SciPy, Pillow, and matplotlib were unavailable in the inspected shell. No raster, archive, full-resolution image, or PDF was downloaded. No plots or notebooks were created because there were no scientific samples to plot.

| Parsed record          |  Bytes | SHA-256 of retrieved text                                          |
| ---------------------- | -----: | ------------------------------------------------------------------ |
| DEM label [S2]         |  8,786 | `ddf03b3de30ffee3d04baea2c8ebdf4558b5490a84989440c7447658c2f62732` |
| Orthoimage label [S3]  |  8,805 | `617b3d0a0608bbba6016907ca30040e0c1fa6bca89e3c27912cf0ef4c39c6a32` |
| Geologic metadata [S6] | 20,767 | `24f129b9ae7ac670f620ea5397860703f1051e53a10ea8f3871f7ed82fb5acd5` |

These identify metadata text inspected on the research date, not immutable checksums of the underlying scientific products.

## 3. Formats, coordinates, and provenance

### 3.1 Jezero CTX DEM

USGS publishes this product as a contextual reference for Jezero science investigations [S1]. The mosaic extends earlier terrain-relative-navigation coverage using additional stereo models produced with Ames Stereo Pipeline. The catalog describes vertical localization to MOLA and some horizontal georeferencing in ArcGIS Pro. Its publication date is 2021-10-14, not a terrain acquisition timestamp.

| Property                      | PDS4 label observation [S2]                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Filename                      | `M20_JezeroCrater_CTXDEM_20m.tif`                                                                                       |
| Product identifier            | `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxdem_mosaic`, version 1.0                                            |
| Format                        | GeoTIFF; one band; little-endian IEEE float32                                                                           |
| Dimensions                    | 4,456 columns x 5,067 rows                                                                                              |
| Pixel spacing                 | 20 m x 20 m                                                                                                             |
| Bounds, west/south/east/north | 76.997437 / 17.580520 / 78.582563 / 19.290187 degrees                                                                   |
| Projection                    | Equirectangular; standard parallel 18.4663 degrees; central meridian 0; latitude of origin 0                            |
| Body model                    | Sphere, radius 3,396,190 m                                                                                              |
| Angular coordinates           | Planetocentric latitude, positive-east longitude                                                                        |
| Upper-left projected corner   | Approximately x=4,329,000 m, y=1,143,420 m                                                                              |
| Vertical values               | Meters according to catalog; reference surface must be confirmed from product documentation before combining elevations |
| Missing constant              | `-3.4028234663852886e+38`                                                                                               |
| Advertised distribution size  | 87 MB in catalog; not verified by downloading the raster                                                                |

**Extractable after acquisition:** elevation, valid-data footprint, profiles, local relief, slope, aspect, and regional ruggedness. **Not extractable:** individual boot hazards, soil bearing strength, oxygen, radiation, or current weather.

Required processing: inspect the actual GeoTIFF CRS/geotransform, verify missing values and units, select a small area, retain valid-data masks, calculate derivatives with a processing halo, and export versioned numeric grids plus display overlays. A published 20 m pixel spacing is not a statement of 20 m positional accuracy or vertical error.

### 3.2 Matched CTX orthoimage

The 2021 Science Investigation image is distinct from the collection's older 6 m TRN orthomosaic. Do not interchange their metadata [S1, S3, S4].

| Property                      | Label observation [S3]                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Filename                      | `M20_JezeroCrater_CTXortho_mosaic_5m.tif`                                      |
| Product identifier            | `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxortho_mosaic`, version 1.0 |
| Format                        | GeoTIFF; one unsigned 8-bit band                                               |
| Dimensions                    | 17,766 columns x 20,234 rows                                                   |
| Pixel spacing                 | x=5.002064681 m; y=5.002262972 m                                               |
| Bounds, west/south/east/north | 77.000854 / 17.581391 / 78.581475 / 19.288963 degrees                          |
| Projection/body               | Same labeled equirectangular parameters and 3,396,190 m sphere as DEM          |
| Upper-left projected corner   | x=4,329,192.108 m, y=1,143,347.424 m                                           |
| Missing constant              | 0                                                                              |

It contains visual surface morphology and relative image tone. It is not a chemical-composition or calibrated temperature map. Orthorectification supports spatial comparison but does not eliminate registration errors or prove exact pixel alignment.

Required processing: crop and tile independently for display; reproject/sample by coordinates when joining to terrain. Respect the label's zero mask rather than treating all dark pixels as valid observations. Do not infer physical albedo from this 8-bit presentation without calibration provenance.

### 3.3 SIM 3464 geologic interpretation

Sun and Stack's 2020 map covers Jezero crater and Nili Planum at **1:75,000** [S5-S7]. Its domain is 76.8-77.8 degrees E and 17.7-18.7 degrees N. It uses a 6 m CTX image base, with THEMIS nighttime IR, CTX terrain models, HRSC topography, and HiRISE imagery assisting interpretation.

Distribution is a GIS archive containing an ESRI file geodatabase, associated layers, and rasters. The metadata also describes `Jezero_GeoUnits.shp` attributes; the archive was not opened, so do not assume that exact standalone shapefile is available. The distribution listing advertises a 333 MB ZIP.

The GIS README specifies Mars Transverse Mercator, central meridian 77.5 degrees E, scale factor 1, zero false easting/northing, and a Mars 2000 sphere with radius 3,396,190 m. This is **not** the DEM's projected grid and is not Earth UTM. Coordinate storage precision, such as metadata's 0.6096 m representation resolution, is not geologic contact accuracy.

The parsed metadata enumerates 14 distinct numeric `unit` codes but 15 distinct name strings and 15 symbols. Names include Jezero floor, Jezero fan 1 and 2, eolian bedform, crater ejecta, and rugged bright units. Both `Crater rim unit` and the apparent typo `Crater riim unit` occur. These are **attribute-domain entries, not measured polygon counts or a verified count of scientific units**. Numeric ID ranges in metadata must not be mistaken for feature counts.

Required processing: obtain an approved vector-only subset if possible; inspect actual fields and geometry; preserve raw names/IDs; create a documented display-name normalization only where justified; reproject using Mars definitions; clip to the study area; retain the published registration warning. Unit interpretation supports hypotheses and observation goals, not direct mineral abundance, trafficability, or proof of past life.

### 3.4 Mars Trek

Trek is a data discovery and visualization service, not one homogeneous dataset [S8-S10]. Its API documentation describes OGC RESTful WMTS, tile styles, matrix sets, row/column indexing, coverage gaps, and PNG/JPEG formats.

One actual capabilities record was inspected for `Mars_MGS_MOLA_ClrShade_merge_global_463m`. It declares JPEG tiles, 256 x 256 pixels, matrix set `default028mm`, levels 0-7, and a level-0 matrix of **2 columns x 1 row**, not standard Web Mercator XYZ's 1 x 1. The top-left corner is (-180, 90). The record uses `EPSG::104905`, while Trek's Mars API configuration spells its equirectangular identifier `IAU2000::104905`. It also exposes a `WGS84BoundingBox` element; that does not turn the product into Earth measurements.

**Engineering conclusion:** parse and test each chosen service's actual matrix set and body convention. Never plug an arbitrary Trek layer into a default Earth XYZ source. The inspected color-shaded MOLA layer is useful regional context, not a numeric source for slope, elevation, or local route costs. Browser CORS behavior, tile rendering, and service reliability were not tested in this research.

### 3.5 Perseverance imagery and traverse evidence

NASA's raw-image gallery provides browse imagery, and its location-map page describes rover drive endpoints indexed by sol [S11, S12]. The rover map combines HiRISE-based imagery with an ESA Mars Express HRSC regional map; do not attribute all imagery there solely to NASA or call enhanced color an unmodified measurement.

No image catalog response, rover coordinate table, calibrated image, or camera pose was acquired. Exact API schema, observation counts, sample dates, and ground resolution therefore remain unverified. Camera images are perspective views, not georeferenced map tiles; pixel size varies with camera geometry and target distance.

For ARES, curate a small source-backed set of observations only after verifying product IDs, sol/time, camera, attribution, and location evidence. Associate an image with a rover station only when metadata supports the association. An image target is not automatically at the camera's position. Use rover evidence to motivate a stop and illustrate unresolved small-scale terrain, not to certify a synthetic astronaut route.

### 3.6 THEMIS apparent thermal inertia

The verified candidate `THEMIS_TI_Mosaic_Quant_00N060E_100mpp.cub` covers 0-30 degrees N and 60-120 degrees E, enclosing Jezero in its rectangular bounds [S13, S14]. The catalog reports 100 m/pixel, one 32-bit band, a simple-cylindrical projection, planetocentric positive-east coordinates, and axes A=3,396,190 m and C=3,376,200 m. Full CRS, latitude treatment, missing constants, scaling, and Jezero's valid-data mask require inspecting the actual product label/header.

The primary link is an ISIS3 cube advertised as 2,532,510,192 bytes. The catalog includes some generic processing text describing qualitative products even on the quantitative page. Confirm the selected file is quantitative and preserves units; do not rely on thumbnails or a filename alone.

Thermal inertia is a **model-derived thermophysical property**, `I = sqrt(k * density * specific_heat)`, commonly expressed as J m^-2 K^-1 s^-1/2. It is not current temperature. USGS reports approximately 20% absolute accuracy and approximately 10% relative accuracy within a single image for the underlying method [S13]. Those are published estimates, not uncertainty measured for our study area. Atmospheric effects, calibration, slopes, subsurface structure, and mosaic seams affect interpretation.

Quantitative values can contextualize material contrasts and help choose diverse science observations. They cannot uniquely identify sand, prove bearing strength, forecast battery temperature, or establish human thermal exposure. A normalized 8-bit qualitative mosaic is for visual comparison, not quantitative sampling. Request an approved small cutout or verified numeric service before making this a delivery commitment; do not download the regional cube by default.

## 4. Exploratory results and geographic coverage

### 4.1 Actual metadata-derived statistics

These calculations use labeled dimensions and spacing. They describe rectangular grids, not valid surface coverage or terrain distributions.

| Quantity                     |            DEM |     Orthoimage |
| ---------------------------- | -------------: | -------------: |
| Cells                        |     22,578,552 |    359,477,244 |
| Raw one-band array bytes     |     90,314,208 |    359,477,244 |
| Projected rectangular width  |      89.120 km |   88.866681 km |
| Projected rectangular height |     101.340 km |  101.215789 km |
| Projected rectangular area   | 9,031.4208 km² | 8,994.7112 km² |

Reproduction formulas: `cells = rows * columns`; `bytes = cells * bytes_per_sample`; `width = columns * dx`; `height = rows * dy`; `rectangle_area = width * height`. This is projected area, not a corrected spherical surface-area estimate. Headers, overviews, compression, masks, and processing memory are excluded.

The orthoimage rectangle occupies approximately **99.5935%** of the DEM rectangle by projected area. Its geographic bounding box lies inside the DEM box. Neither fact proves gap-free valid overlap. The origins differ by approximately **192.108 m east and 72.576 m south**; combining them by array index would be incorrect. The ratio of total image to elevation cells is 15.9212, not exactly 16.

| Pair or domain              | Metadata-supported conclusion                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DEM and orthoimage          | Bounding-box intersection is approximately [77.000854, 17.581391, 78.581475, 19.288963] in west/south/east/north order                |
| DEM, image, and SIM 3464    | Common rectangular domain is approximately [77.000854, 17.700000, 77.800000, 18.700000]; actual valid masks and geometry still needed |
| Geologic map's western edge | Its 76.8-77.000854 degrees E strip is outside the matched DEM/image common rectangle                                                  |
| THEMIS and Jezero products  | The candidate thermal tile's rectangle encloses these Jezero bounds; local gaps are unknown                                           |
| Rover observations          | No coordinate records inspected, so no spatial join or overlap count is established                                                   |

At nominal 20 m spacing, a hypothetical 10 km x 10 km analysis window is 500 x 500 cells and **1,000,000 bytes of float32 elevations**. This is a sizing example, not an acquired cutout. The eventual region must fit actual science sites, round-trip distances, and valid-data coverage; do not choose endpoints merely to fill this window.

### 4.2 Elevation and terrain statistics that cannot be computed

| Requested statistic                                  | Result       | Reason                                          |
| ---------------------------------------------------- | ------------ | ----------------------------------------------- |
| Elevation minimum, maximum, range                    | Not computed | No raster samples                               |
| Elevation mean, median, percentiles, distribution    | Not computed | No raster samples                               |
| Missing elevation count or percentage                | Not computed | Missing sentinel known, sample mask unavailable |
| Gradient and slope distribution                      | Not computed | No neighboring elevations                       |
| Difficult-terrain fraction, ruggedness, local relief | Not computed | No derived terrain grid                         |
| Route ascent, descent, length, or feasibility        | Not computed | No route or numeric terrain                     |
| Unit areas, site counts, rover station counts        | Not computed | No vector geometries or observation records     |

No figure would resolve these gaps. A familiar published Jezero elevation or a statistic inferred from a color image would not be a measurement of the proposed study area.

### 4.3 Scientific observations versus hypotheses

The source collection and NASA rover description identify Jezero's ancient delta as a science target [S4, S12]. SIM 3464 provides mapped fan and floor units whose relationships can frame questions about deposition and geologic history. These are source-backed contextual statements. This research did not locate a particular contact in inspected geometry, confirm minerals at a proposed waypoint, or identify a traversable fan access route.

The most useful feature is therefore a **route-to-question workflow**: choose a source-supported target, expose what evidence exists there, and calculate whether a conservative terrain route fits an explicitly simulated mission budget. A science priority should remain a user-selected hypothesis or authored ranking, not a claimed probability of discovery.

## 5. Potential calculations after data acquisition

| Calculation              | Method and output                                                                                    | Scientific boundary                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Elevation inspection     | Coordinate-to-grid lookup; nearest valid cell or explicitly labeled interpolation                    | No interpolation across missing cells; report source and resolution     |
| Slope/aspect             | Horn 3 x 3 or central-difference gradient in metric coordinates; `slope = atan(sqrt(dzdx² + dzdy²))` | Effective analysis scale spans multiple cells; not footstep slope       |
| Terrain variation        | Windowed max-min relief or explicitly defined RMS neighbor elevation difference                      | Name the window and metric; avoid unexplained ruggedness scores         |
| Route profile            | Sample the same numeric grid used by routing; cumulative ascent/descent                              | Noise and sampling alter totals; no extra precision from oversampling   |
| Traversability screening | Block missing/unsupported cells and scenario-defined high slopes; show relative penalties            | Classification is a planning policy, not validated mobility performance |
| Route optimization       | A* on bounded metric grid; length, slope, and authored exclusion costs                               | Optimal only for this graph and cost function                           |
| Science context          | Point-in-polygon lookup and route/unit intersections after CRS conversion                            | Report 100-200 m registration warning near geologic contacts            |
| Thermal context          | Mask-aware regional samples from quantitative THEMIS data                                            | Preserve 100 m support; resampling to 20 m adds no detail               |
| EVA resources            | Integrate declared activity rates over route time and station dwell                                  | Scenario estimates; no measured astronaut physiology                    |
| Terrain visibility       | DEM ray casting to hypothetical base/relay with specified antenna heights                            | Topographic line of sight only, not RF link margin or orbiter access    |

For raster derivatives, record stencil, spacing, edge handling, missing-data policy, and any smoothing. Mask the border where a valid stencil is unavailable. Retain a halo during clipping. For routing, use both regional slope screening and directed edge grade; an average can hide a difficult segment. Coarsening a DEM can hide hazards, so retain conservative fine-grid exclusion summaries and disclose the analysis resolution.

## 6. Data quality and scientific limitations

| Issue                                 | Evidence                                                             | Required engineering response                                                       |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Reversed DEM latitude extrema         | Web page says minimum 19.29, maximum 17.58; label has ordered bounds | Validate bounds and compare against header; do not ingest catalog fields blindly    |
| Different DEM body radius             | Catalog A/C=3,396,160 m; label sphere=3,396,190 m                    | Preserve discrepancy; use validated product CRS, not a guessed Mars constant        |
| Similar product names                 | 2021 matched image is about 5 m; older TRN image is 6 m              | Pin filename, version, provenance, and checksum                                     |
| Nonidentical origins/resolutions      | Parsed DEM/image labels                                              | Coordinate-based sampling and visual tie-point checks                               |
| Very negative finite missing sentinel | DEM label                                                            | Mask before statistics, interpolation, gradients, or graph creation                 |
| Geologic registration offset          | SIM README explicitly says about 100-200 m                           | Show boundary ambiguity; do not use contacts as exact obstacles                     |
| Attribute inconsistencies             | `Crater riim unit`, 14 codes versus 15 strings/symbols in metadata   | Inspect actual tables; preserve raw values and review normalization                 |
| Mixed spatial support                 | About 5 m image, 20 m terrain, 100 m thermal, 1:75,000 geology       | Show per-layer scale; never imply finer measurement by upsampling                   |
| Temporal mismatch                     | Mosaic publication dates and rover sols are different concepts       | Retain acquisition/observation time where known; never label historical layers live |
| Missing uncertainty rasters           | None acquired; no local DEM accuracy assessment                      | Do not invent per-cell confidence intervals or calibrated failure probabilities     |
| Visualization versus measurement      | Trek shaded relief and qualitative thermal mosaics                   | Keep numeric values separate from rendered tiles                                    |

Earth-default geospatial libraries are particularly dangerous: the ratio of a common Earth mean radius (6,371,008.8 m) to the CTX label's Mars radius is **1.87593**. Identical angular paths would be approximately 87.6% too long if calculated with that Earth radius. Use native projected meters locally or a deliberately specified Mars body model; use actual projection scale where necessary. Test the map renderer separately from distance calculations.

Neither terrain nor optical appearance establishes soil cohesion, wheel slip, loose-regolith depth, dust toxicity, radiation dose, or suit thermal load. Curiosity RAD measures radiation at its rover location in Gale crater [S15]; that does not provide a spatial radiation field at Jezero. No local atmospheric, spectral, chemical, or radiation analysis was possible.

## 7. Additional data, acquisition decisions, and first EDA gate

| Priority   | Acquire or verify next                                                          | Purpose                                                   | Gate and limit                                                                              |
| ---------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P0         | Approved CTX DEM subset plus original label/header                              | Numeric terrain and routing                               | No terrain claims until actual samples and masks pass checks                                |
| P0         | Matching image tiles/crop from map team's existing source                       | Register terrain to existing map                          | Reuse mapping work; validate at least three distributed landmarks                           |
| P0         | SIM 3464 vector-only subset or verified equivalent geologic service             | Third information type and science targets                | Approval before full archive download; retain registration warning                          |
| P0         | Small, curated Perseverance observation/station set                             | Integrate a second mission's evidence into selected stops | Verify IDs, coordinates, times, and attribution; do not scrape gallery HTML as a stable API |
| P1         | Quantitative THEMIS Jezero cutout or verified numeric service                   | Independent Mars Odyssey material context                 | No 2.53 GB download without approval; inspect units, mask, registration                     |
| P2         | Small HiRISE DTM/orthoimage/confidence subset                                   | Higher-resolution validation and uncertainty context      | Coverage and download size must be checked; collection link alone is insufficient           |
| P2         | MEDA observations, CRISM calibrated products, or other targeted science records | Historical atmosphere or composition explanations         | Select product/time/quality first; not prerequisites for core route demo                    |
| Out of MVP | RAD dose transport, SPICE relay ephemerides, suit calibration studies           | Radiation or realistic communications/physiology          | Substantial modeling and validation beyond current evidence                                 |

After approved numeric acquisition, run one bounded analysis before feature implementation:

1. Inspect header versus label, CRS/body, units, geotransform, dimensions, scaling, missing constants, and checksums. Confirm that numeric elevations are not rendered RGB.
2. Select a study area inside real common coverage with a feasible hypothetical base and source-backed science targets. The base is a scenario object, not an existing NASA human outpost.
3. Report valid/invalid counts, min/max, mean, median, p5/p95, and an elevation histogram on valid cells. Preserve negative elevations.
4. Compute slope and one named ruggedness metric; report derivative-valid counts and p50/p90/p95/max, along with the stencil and analysis resolution. Inspect extremes for seams and missing-value leakage.
5. Quantify common valid coverage, not just intersecting rectangles. Check three or more distributed landmarks visually and numerically; document registration residuals without inventing an accuracy certification.
6. Verify actual geologic attributes and station associations; inspect contact uncertainty at candidate stops. Compute route metrics only after graph/mask validation.
7. Freeze a small data release and one demonstration scenario. If coverage or input quality fails, change the study area or disclose the missing capability, not the observations.

## 8. Implications for ARES

The existing map and dashboard are integration surfaces, not new workstreams. The scientific backend should consume prepared, small artifacts rather than process planetary archives per request. Default to a bounded browser Web Worker for graph search, with pure TypeScript calculations shared by simulation and explanations; actual performance must be benchmarked.

The minimum credible science package combines optical context, numeric terrain, geologic interpretation, and source-linked Mars 2020 observations in a single mission decision. Multiple derived renderings of one DEM do not count as independent data types or missions. THEMIS is the strongest extra quantitative layer if access is resolved early.

The challenge wording and 2026 attribution are supplied by the project brief. The official homepage and `/2026/challenges/` returned a third-party-link interstitial during research; the exact challenge text and judging rubric were not independently authenticated. Confirm the official challenge-specific link before claiming compliance.

## 9. Source register

All sources below were accessed on 2026-11-14. Raster availability, browser integration, and service reliability are not guaranteed by a successful metadata read.

- **S1:** [USGS Science Investigation CTX DEM catalog](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic).
- **S2:** [CTX DEM PDS4 label](https://astrogeology.usgs.gov/ckan/dataset/f8ef46b8-d512-4c46-b825-fe9633c38e1c/resource/5691ea08-1db4-4018-a341-e415e716add7/download/m20_jezerocrater_ctxdem_20m.xml).
- **S3:** [Matched CTX orthoimage PDS4 label](https://astrogeology.usgs.gov/ckan/dataset/f8ef46b8-d512-4c46-b825-fe9633c38e1c/resource/d139f28f-9976-40b1-aa55-49b78cebf055/download/m20_jezerocrater_ctxortho_mosaic_5m.xml).
- **S4:** [USGS Jezero landing-site product collection](https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products).
- **S5:** [Sun and Stack, 2020, SIM 3464](https://doi.org/10.3133/sim3464); [distribution listing](https://pubs.usgs.gov/sim/3464/).
- **S6:** [SIM 3464 FGDC metadata](https://pubs.usgs.gov/sim/3464/sim3464_metadata.txt).
- **S7:** [SIM 3464 GIS README and registration warning](https://pubs.usgs.gov/sim/3464/sim3464_readme.txt).
- **S8:** [NASA Mars Trek](https://trek.nasa.gov/mars/); [WMTS API documentation](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars).
- **S9:** [Trek API configuration](https://trek.nasa.gov/tiles/apidoc/config/config.json).
- **S10:** [Inspected MOLA color-shaded WMTS capabilities](https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml).
- **S11:** [NASA Perseverance raw-image gallery](https://mars.nasa.gov/mars2020/multimedia/raw-images/).
- **S12:** [NASA Perseverance location map and dataset description](https://science.nasa.gov/mission/mars-2020-perseverance/location-map/).
- **S13:** [USGS THEMIS apparent thermal-inertia collection and limitations](https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic).
- **S14:** [Jezero-covering quantitative THEMIS tile, 00N060E](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_00n060e_100mpp).
- **S15:** [NASA Curiosity science instruments, including RAD](https://science.nasa.gov/mission/msl-curiosity/science-instruments/).
- **S16:** [USGS Planetary Geologic Mapping program](https://www.usgs.gov/special-topics/planetary-geologic-mapping).
- **S17:** [NASA spacesuit life-support overview](https://www.nasa.gov/humans-in-space/what-is-a-spacesuit/). This explains system responsibilities, not validated Mars EVA consumption rates.
- **S18:** [NASA Space Apps official site](https://www.spaceappschallenge.org/). Challenge-specific text remained unverified.
