# NASA Ames 2018 global dust storm

This is a sampled, quantized replay of the reference simulation from
Bertrand et al. (2020), not spacecraft observations or a forecast.

Source: https://data.nas.nasa.gov/legacygcm/fv3gcm/

Paper: https://doi.org/10.1029/2019JE006122

See `manifest.json` for the exact source URL, published MD5, SHA-256, grid,
time samples, variable attributes, missing values and encoding.

The original NetCDF file is 1,195,479,216 bytes. Its MD5 matches NASA's
published inventory. The browser extract is 3,960,537 bytes compressed and
contains 128 frames of visible column dust optical depth and surface dust
lifting rate, sampled every two model sols. The native file has two-hourly
output. Model time has an invalid civil epoch, so no UTC dates are fabricated.

The optical depth is dimensionless and normalized to 610 Pa according to
NASA's README. Its NetCDF units attribute is blank. Surface lifting is in
kg/m²/s. The source grid is 2° by 2°, regridded by NASA from the model grid.
This does not resolve local storms or habitat weather. Polar regions above
80° latitude are omitted from the map renderer; global means include them.

The loader verifies either compressed bytes or the decoded bytes when a
development server transparently decompresses gzip. Both checksums are in the
manifest; a complete decoded response is not mistaken for a truncated download.

The binary uses little-endian unsigned 16-bit integers ordered by frame,
field, row and column. Rows run north to south and columns west to east.
Multiply by each field's scale. A value of 65535 means missing, not zero.
The quantization error is at most half the scale. No temporal interpolation
or invented winds were added. The map's color ramp and transparency are
display choices, not a physical rendering of airborne dust.

Reproduce from the original NetCDF with `pipelines/prepare-dust-playback.py`.
Keep this release immutable; publish revised data under a new version.
