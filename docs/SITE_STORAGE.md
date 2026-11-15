# HiRISE site release in R2

`sites-v1` contains the four sites supplied in `sites-v1.zip`. It uses the existing
`ares-mars-data` bucket and public origin `https://tiles.imstuckonmars.help`.
The archive was extracted into ignored `data/map-assets/sites-v1/`; macOS
`__MACOSX` and dot-prefixed metadata were excluded. Data bytes are unchanged.

The payload is 23,542 files totaling 660,737,714 bytes:

- 21,097 WebP imagery and slope-class tiles.
- 2,439 PNG terrain tiles.
- Four slope GeoTIFFs, not raw elevation models.
- `sites.geojson` and `catalog.json`.

The supplied GeoJSON matches `public/data/processed/sites.geojson`. Each slope
file is a cloud-optimized GeoTIFF with an Int16 band, nodata `-9999` and a
3,396,190 m Mars sphere. Divide valid samples by 10 for slope in degrees.
Terrain tiles use the existing Terrarium encoding and 10,000 m display offset.
These are the site owner's processed products, not newly acquired measurements.

## Publish and verify

```sh
# Run the local-only upload bridge in a separate process group. Never deploy it.
setsid pnpm exec wrangler dev --config pipelines/wrangler-upload.jsonc --ip 127.0.0.1 --port 5294
MAP_RELEASE_CONFIG=pipelines/sites-release.json R2_LOCAL_UPLOADER=http://127.0.0.1:5294 python3 pipelines/upload-map-assets.py
MAP_RELEASE_CONFIG=pipelines/sites-release.json MAP_RELEASE_URL=https://tiles.imstuckonmars.help/sites-v1 python3 pipelines/verify-map-release.py
```

The publisher writes `release.json` last. Its inventory records every object's
SHA-256 and byte length. Reusing an existing release with different bytes is
rejected. Completed-upload receipts allow interrupted uploads to resume.

GeoJSON is served as `application/geo+json`, WebP as `image/webp`, and GeoTIFF
as `image/tiff`. Public reads need CORS, immutable cache headers and HTTP range
support for slope-file access. Local slope files are approximately 51–121 MB.
The local bridge accepts files up to 40 MB. The publisher sends larger files
through `wrangler r2 object put --remote` using the same bucket configuration.
The 121 MB TIFF stalled through the bridge but uploaded through this direct
path and passed a full remote checksum check.

`SITE_DATA_ROOT` in `lib/mars/map-data.ts` selects the public site tile origin.
The app retains its committed site GeoJSON for labels and site definitions.
The root must only be enabled once the matching release is available.

## Verification notes

All 23,542 published objects passed SHA-256, byte-length, CORS and immutable-cache
checks. The public release inventory matches the local inventory exactly.

`https://tiles.imstuckonmars.help/sites-v1/sites.geojson` returns HTTP 200,
`application/geo+json`, public CORS headers and bytes identical to the archive.
It contains four site points and four footprints. The largest slope TIFF also
passed a full remote checksum and a byte-range request returning HTTP 206.

The packaged map loaded all four sites from R2 and selected their site terrain
at zoom 17. It made 674 site-resource requests, no local `/data/sites/` requests
and raised no JavaScript exceptions. Of those requests, 31 returned 404 for
edge tiles absent from the supplied archive. Uploading the archive does not fix
those source-coverage gaps; the site tile-generation owner should review them.
At the existing zoom-15, pitched fly-to view, the map can retain regional terrain
because the full view does not fit within the site's terrain bounds.
