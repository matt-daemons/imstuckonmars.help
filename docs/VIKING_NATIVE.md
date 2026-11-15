# Native-resolution Viking color imagery

This release uses the full USGS/NASA Ames colorized Viking MDIM 2.1 mosaic,
not the lower-resolution NASA Trek cache. The original is 92,160 × 46,080 pixels,
with 231.5417872 m grid spacing on a 3,396,190 m Mars sphere. The approved source
download is 12,742,411,029 bytes; the derived-tile storage budget is 15 GB.

The original is retained locally outside Git. Source headers, byte length,
SHA-256 and a verified S3 multipart ETag accompany the release. Source and lossless processing copies never feed
the application bundle. The display pipeline reprojects the original into
1024-pixel JPEG tiles, quality 95, at XYZ zooms 0–7. At zoom 7 the equatorial
display spacing is about 163 m, so the tile grid is finer than the original
image; it does not add real detail. Higher latitudes have smaller display pixels.
The larger tile size preserves the same pixels as a 512-pixel zoom-8 release
with one quarter of the requests and objects: 21,845 tiles across all levels.

The prepared tiles total 4,193,921,182 bytes. Every local tile passed SHA-256,
byte-length and 1024 × 1024 JPEG dimension checks. Five independent samples
across both hemispheres matched the source grid to within 4.28 levels per
8-bit color channel after reprojection and JPEG compression.
Including source metadata and the catalog, the release has 21,849 objects and
4,197,295,229 bytes. These totals exclude the release inventory itself.

Source SHA-256:
`554f1170998b4cd00359defa48600307e52c49f921c282d842361ad45082aa31`.
The reconstructed multipart ETag matches
`efb446a3deef9aea7e8aba2e13bfbbaa-1520`.

Only global imagery changes. Elevation and the Arcadia CTX/AI layers continue
using `mars-v2`. The old brown elevation-colored hillshade becomes optional and
off by default so it no longer replaces surface color at intermediate zooms.
CTX imagery is still grayscale where enabled; it is not measured color.

## Reproduce

After the source download finishes:

```sh
mkdir -p data/raw/terrain/viking-native
curl --fail --location --retry 3 --continue-at - --output data/raw/terrain/viking-native/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif.partial https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif
nix shell nixpkgs#gdal --command node pipelines/stable/viking-native.ts
python3 pipelines/check-viking-native.py
nix shell nixpkgs#gdal --command node pipelines/check-viking-alignment.ts
pnpm exec wrangler dev --config pipelines/wrangler-upload.jsonc --ip 127.0.0.1 --port 5294
# In another terminal:
MAP_RELEASE_CONFIG=pipelines/viking-native-release.json R2_LOCAL_UPLOADER=http://127.0.0.1:5294 python3 pipelines/upload-map-assets.py
MAP_RELEASE_CONFIG=pipelines/viking-native-release.json MAP_RELEASE_URL=https://tiles.imstuckonmars.help/viking-native-v1 python3 pipelines/verify-map-release.py
```

Skip the download command if the completed `.tif` already exists. The uploader
records completed object hashes locally, so an interrupted upload can resume
without retransmitting successful objects. The public release inventory appears
only after all uploads succeed. Verify it before pointing the app at the release.

The source download uses a `.partial` filename and supports HTTP resume. The
processor only promotes it after the expected byte length matches, then checks
dimensions, extent, grid orientation and the Mars sphere in its header. The
multipart MD5 reconstruction must match the source server's ETag before tiling.
It retains a losslessly tiled
local processing copy to avoid rereading huge source scanlines per output tile.
GDAL resumes missing output tiles. Do not change processing parameters beneath
an existing release prefix; choose a new release name instead.

## Limits

This is the native detail of this global colorized mosaic, not the sharpest
orbital image of every individual location. Grid spacing is not positional
accuracy. The colors are a composite visualization, not calibrated true-color
radiometry. Web Mercator excludes latitudes beyond approximately 85.051°;
Mapbox's polar fill is not source imagery. No generated detail or AI upscaling
is used in the global color layer.

The detached PDS label lists an ellipsoidal polar radius of 3376.2 km, while the
GeoTIFF projection uses a 3396.19 km sphere. The pipeline follows the actual
GeoTIFF grid and retains both headers rather than silently reconciling them.

## Browser verification

All 21,849 published objects passed byte-for-byte SHA-256 and length checks,
public CORS checks and immutable-cache checks. The public release inventory
matches the local upload inventory exactly.

The packaged Worker loaded the public R2 release in Chromium at the globe,
Arcadia zoom 6, Jezero, Valles Marineris, a southern-latitude view and the
unchanged habitat at zoom 18. Requests included maximum-detail zoom-7 tiles.
The run recorded 18 R2 responses, no R2 HTTP errors and no JavaScript exceptions.

The elevation-colored hillshade stayed off by default and could be enabled and
disabled without changing the terrain source. The AI comparison also left the
habitat elevation source unchanged. These checks establish image delivery and
layer behavior, not positional accuracy or suitability for navigation.
