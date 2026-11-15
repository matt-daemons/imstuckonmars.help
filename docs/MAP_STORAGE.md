# Map imagery and terrain in R2

The map reads immutable public objects from
`https://tiles.imstuckonmars.help/mars-v2/`. The R2 bucket is `ares-mars-data`
in the Cloudflare account that owns `imstuckonmars.help`. The app does not
proxy these requests, expose write credentials, or use R2 for telemetry or
mission state. D1 remains their only backend store.

## Release contents

The first release has 3,187 objects totaling 209,690,690 bytes, including source
products and preserved local assets. New primary source downloads total
99,440,597 bytes. These counts exclude the small release inventory itself.

- `viking/`: 1,365 global colorized Viking context tiles, XYZ zooms 0–5. Source
  level 4 is 512 geographic tiles, 8192 × 4096 pixels across the planet,
  compared with 32 tiles and 2048 × 1024 pixels in the earlier release.
- `arcadia/`: approximately 5 m CTX source imagery around the unchanged HAB,
  823 XYZ tiles at zooms 9–14 from 100 source images. The source footprint spans approximately 0.44° on each axis,
  larger than the previous 0.26° × 0.18° image. Edge alpha preserves actual
  rectangular coverage. Only visible tiles load in the browser.
- `global-dem/`: global MOLA topography from the official 16-pixel-per-degree
  product, in 341 tiles. It is a coarse 0.0625° grid, approximately 3.7 km north-south.
  It is not local hazard data.
- `legacy/`: the original local terrain, regional shading, AI comparison and
  their provenance. AI stays off by default and separate from all elevation.
- `source-products/`: immutable MOLA topography, shot counts, labels and the
  existing bounded MOLA/HRSC source cutout.
- `catalog.json`, provenance documents and `release.json`: source IDs,
  transformations, bounds, checksums, byte sizes and release inventory.

Source image tiles remain in the acquisition cache; their exact URLs and hashes
are in R2 provenance documents. They are not independent additional science
layers. The generated image pyramid intentionally contains multiple resolutions
of each source, not thousands of independent observations.

The MOLA label specifies a 3,396,000 m sphere and a GMM3 areoid; the regional
products use a 3,396,190 m sphere. The display aligns their angular positions
but does not assert a shared quantitative grid or equal vertical datum. The
archive already interpolates bins with no shots. Counts remain available
to distinguish shot support. Global elevations are not direct point
measurements everywhere.

The topography and shot-count products and both detached labels match the
official PDS archive MD5 inventory. The release also stores SHA-256 hashes.

All terrain display tiles include the existing 10,000 m rendering offset.
Subtract it from an unexaggerated decoded display sample. It is not added to
the source products. The globe uses global imagery at distant zooms, then
global or regional elevation and the local MOLA/HRSC grid as coverage allows.

## Reproduce and publish

Requirements: Node 24, pnpm, GDAL, curl and Python 3.11 or later. Work from
the repository root. The first release caps retained new source downloads
at 500 MB; the scripts also enforce smaller per-product limits. The full
multi-terabyte CTX mosaic and full-resolution global Viking file are not
downloaded.

```sh
nix shell nixpkgs#gdal --command node pipelines/stable/r2-imagery.ts global
nix shell nixpkgs#gdal --command node pipelines/stable/r2-imagery.ts arcadia
node pipelines/stable/global-elevation.ts
node pipelines/prepare-map-release.ts
node pipelines/check-map-release.ts
python3 pipelines/upload-map-assets.py
python3 pipelines/verify-map-release.py
```

Acquisition retains source bytes in `data/raw/terrain/`. Generated release
objects live in ignored `data/map-assets/mars-v2/`, not the application bundle.
The previous `public/data/terrain/` copies are retired and ignored. Their data
remains under the release's `legacy/` prefix and in a local ignored backup.
On a fresh checkout, run `pnpm maps:restore` to retrieve the preserved legacy
inputs before preparing another release. It validates each restored hash and
does not overwrite existing local source products.
Offline reprojection assigns an Earth-sized Mercator coordinate system only
to a display adapter, never to scientific source products or measurements.

The publisher uses the Cloudflare API token from its environment or the
current Wrangler OAuth login without logging credentials. It publishes
only this configured bucket and prefix, then writes the release manifest
last. An existing completed release with different hashes is rejected.
Upload starts are limited to fewer than four per second, and a local inventory
prevents changing bytes under a partially uploaded version.
For bulk uploads, the management API may rate-limit before completion. Use
the loopback-only uploader instead of exposing a public write endpoint:

```sh
pnpm exec wrangler dev --config pipelines/wrangler-upload.jsonc --ip 127.0.0.1 --port 5294
# In another terminal:
R2_LOCAL_UPLOADER=http://127.0.0.1:5294 python3 pipelines/upload-map-assets.py
```

The helper uses a remote R2 binding but runs only on localhost. Never deploy
that helper. Stop its complete process group after uploading. The application
Worker has no R2 write route or bucket credentials.

CI keeps four small real-data elevation fixtures for decoding and display-offset
regressions. Full source/output hash checks run with `check-map-release.ts`, and
public-object checks run with `verify-map-release.py`; neither downloads the
entire map release during ordinary unit tests.
Change the version before publishing modified content. The verifier checks
all public bytes, CORS and immutable caching, not just upload status.

## Bucket setup

`pipelines/map-release.json` contains nonsecret account, bucket, version and
coverage settings. `pipelines/r2-cors.json` allows public GET and HEAD, not
browser uploads. The custom hostname attaches directly to R2. The managed
`r2.dev` hostname is disabled. One-year immutable cache headers are safe
only because each published prefix is frozen.

Do not create an unrestricted upload endpoint in the Worker. Do not point
Mapbox at NASA Trek's geographic tile matrix as if it were XYZ; the offline
pipeline performs that conversion.

## Limits

The global Viking mosaic is colorized and resampled, not true-color
radiometry. Polar fill beyond the Web Mercator latitude limit is a display
artifact, not new imagery. CTX mosaic image registration can differ from
terrain by roughly 200 m. Regional elevation remains substantially coarser
than the image texture. No source here establishes safe EVA routes.

## Verification

The packaged Worker was exercised in Chromium using the public R2 hostname.
The planet view and zoom-18 HAB view loaded remotely; the browser made no
requests to the former local `/data/terrain/` directory. A separate location
at 137.4°E, 4.6°S selected the coarse global elevation source and loaded its
tiles. The AI layer remains optional. These checks establish delivery and
source selection, not survey-grade alignment or operational suitability.

The final packaged check ran with `public/data/terrain/` removed: 168 R2
responses, no R2 HTTP errors and no JavaScript exceptions. All 3,187 published
objects separately passed SHA-256, byte-length, CORS and immutable-cache checks.
