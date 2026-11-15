# Habitat terrain and imagery

The demo base stays at 45.97°N, 183.95°E. This release adds real regional
elevation and orbital imagery without moving the HAB, stops or planned route.
The base and route remain simulated, not historical mission positions.

## What is displayed

- **Regional elevation:** existing 463 m MOLA tiles and shaded-color base.
- **Local elevation:** a bounded native-grid cutout of the USGS MOLA/HRSC
  blended DEM v2. Its nominal grid spacing is 200 m. This is not a claim of
  local independent 200 m resolution or vertical accuracy.
- **Orbital imagery:** 24 CTX mosaic service tiles covering the original demo
  area, reprojected for Mapbox display. The original mosaic has nominal 5 m
  pixels. The retrieved service level has 0.0000858306884765625° pixels,
  approximately 5.1 m north-south and 3.5 m east-west at the HAB. Resampling
  does not create finer source detail.
- **AI texture experiment:** one generated image derived from a CTX service
  tile, off by default. Fine texture changes are unverified. This is a visual
  comparison, not recovered measurement detail.

The Scene panel identifies the active elevation grid. The local elevation
source activates only when the entire viewport is inside its supported bounds
and zoom is at least 10. Otherwise the existing MOLA source stays active.
Image layers never feed elevation, slope, route or resource calculations.

The original regional pipeline still clamps elevation at its outer boundaries
and exaggerates its color hillshade by 40. Its regional shading is illustrative.
The new local pipeline does neither. It includes a source interpolation halo
and fails if any generated elevation pixel lacks valid neighboring samples.
The terrain slider retains the existing Mapbox-to-Mars height scaling.

Mapbox's close-up camera stalled above its zero datum when rendering the
negative elevations at this site. Separate display tiles therefore add a
constant 10,000 m to both regional and local elevations. The original tiles
remain unchanged. Subtract this offset from an unexaggerated Mapbox elevation
query to recover the source height. Do not treat a display query as a source
measurement. The constant cancels out of relative relief; a regression test
checks every pixel in representative local and regional tile pairs.

## Coverage research

The University of Arizona HiRISE DTM index contained 1,377 footprints when
checked. None contained the HAB. The nearest listed model center was about
93 km away at the Arcadia terraced crater, so it was not used. The USGS STAC
HiRISE DTM, HiRISE observation and controlled CTX DTM queries returned no
matches for the immediate HAB window. This establishes absence in those
catalogs, not an exhaustive absence from every archive.

Sources checked:

- [HiRISE DTM footprints](https://www.uahirise.org/hiwish/maps/dtms.jsp)
- [USGS planetary STAC collections](https://stac.astrogeology.usgs.gov/api/collections)
- [USGS MOLA/HRSC blend](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m)
- [CTX mosaic service metadata](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer?f=pjson)
- [Murray Lab mosaic description](https://murray-lab.caltech.edu/CTX/)

The ArcGIS item is titled V01, while its service description says beta01.
Provenance records this mismatch and hashes the actual retrieved bytes.
The imagery is JPEG-compressed and not quantitative radiometry. Published
mosaic registration errors can approach 200 m. Fine-looking imagery does not
establish accurate alignment with the elevation grid or safe navigation.

## Reproduce

Run from the repository root with Node 24, pnpm and GDAL installed:

```sh
pnpm pipe:hab-terrain
pnpm pipe:hab-imagery
node pipelines/stable/ai-imagery.ts
pnpm pipe:display-terrain
```

The last command only projects the saved AI image. It does not call a model.
The original generation used the built-in image tool, `openai/gpt-image-2`,
with the prompt recorded in `public/data/terrain/ctx/ai-provenance.json`.
The generated image did not preserve exact pixel geometry. Its assigned
footprint is for side-by-side visual comparison only.

`data/raw/terrain/` holds source subsets and service responses, outside version
control. `public/data/terrain/hab/` holds 21 complete Terrarium tiles at zooms
9–11 plus metadata and hashes. `public/data/terrain/ctx/` holds imagery,
the AI input/output and provenance. No R2 bucket or runtime imagery proxy is
needed for this bounded static release. No large global raster was downloaded.

The new source uses Mars planetocentric, east-positive angles and a
3,396,190 m sphere. Mapbox receives the same angles in its display-only
Mercator frame. Earth display coordinates must not be reused for Mars distances.
Terrarium heights remain Mars meters; no AI output changes them.

## Verification

The browser check used Chromium with software WebGL at 1440 × 1000. The
overview used MOLA, and Fly to habitat reached zoom 18 at the unchanged
coordinates with the local elevation grid active. The raw Mapbox display
sample was 5902.1043 m, corresponding to about −4097.90 m after removing
the 10,000 m display offset. This is an interpolated product value, not a
survey measurement at the HAB.

Switching the AI comparison on left the elevation value and terrain source
unchanged. Terrain tiles and imagery loaded without request errors. The
browser logged an unrelated missing favicon and software-rendering warnings.
Full keyboard, screen-reader, mobile layout and geodetic registration checks
remain unverified. Existing map panels retain their prior styling and behavior.
