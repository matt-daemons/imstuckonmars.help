"""Prepare a bounded browser replay from the NASA Ames 2018 storm reference run.

Requires numpy and netCDF4. Source files stay in data/raw/dust; only sampled,
quantized fields enter the browser release. Run from the repository root.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from netCDF4 import Dataset

SOURCE_NAME = "Simus_REF_ls140-300_2D_DAILY.nc"
SOURCE_MD5 = "1f3b64795d79d8f603270289f5ad39bb"
SOURCE_ROOT = "https://data.nas.nasa.gov/legacygcm/fv3gcm/"
FIELDS = [
    ("tau_current", "Visible dust optical depth", "dimensionless", 0.001),
    ("dst_mass_source", "Surface dust lifting", "kg/m²/s", 1e-11),
]


def digest(path, algorithm):
    result = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, default=Path("data/raw/dust") / SOURCE_NAME
    )
    parser.add_argument(
        "--output", type=Path, default=Path("public/data/dust/nasa-2018-v1")
    )
    args = parser.parse_args()
    if digest(args.source, "md5") != SOURCE_MD5:
        raise ValueError("Source does not match NASA's published MD5")
    if args.output.exists():
        raise ValueError(
            "Output exists; use a new release path rather than overwriting it"
        )

    with Dataset(args.source) as dataset:
        longitude = np.asarray(dataset["lon"][:])
        latitude = np.asarray(dataset["lat"][:])
        np.testing.assert_allclose(longitude, np.arange(1, 360, 2))
        np.testing.assert_allclose(latitude, np.arange(-89, 90, 2))
        time = np.asarray(dataset["time"][:])
        np.testing.assert_allclose(np.diff(time), 1 / 12, atol=1e-9)
        # One native, instantaneous sample every two model sols, not a time average.
        indices = np.arange(0, len(time), 24)
        order = np.argsort((longitude + 180) % 360 - 180)
        weights = np.cos(np.deg2rad(latitude))[None, :, None]
        fields = []
        arrays = []
        for name, label, units, scale in FIELDS:
            variable = dataset[name]
            if variable.dimensions != ("time", "lat", "lon"):
                raise ValueError(f"Unexpected dimensions for {name}")
            values = np.ma.masked_invalid(variable[indices, :, :])
            if np.any(values.compressed() < 0):
                raise ValueError(f"Negative valid data in {name}")
            quantized = np.ma.round(values / scale)
            if quantized.max() >= 65535:
                raise ValueError(f"Quantization overflow in {name}")
            # North-to-south rows; west-to-east columns in [-180, 180]. 65535 means missing.
            encoded = quantized[:, ::-1, :][:, :, order].filled(65535).astype("<u2")
            arrays.append(encoded)
            fields.append(
                {
                    "id": name,
                    "label": label,
                    "units": units,
                    "scale": scale,
                    "maxAbsoluteQuantizationError": scale / 2,
                    "sourceAttributes": {
                        key: str(value) for key, value in variable.__dict__.items()
                    },
                    "minimum": float(values.min()),
                    "maximum": float(values.max()),
                    "missingCells": int(np.ma.count_masked(values)),
                    "globalMean": np.ma.average(
                        values,
                        axis=(1, 2),
                        weights=np.broadcast_to(weights, values.shape),
                    )
                    .filled(np.nan)
                    .tolist(),
                }
            )
        # Frame-major, field-major, row-major; no synthetic interpolation in the release.
        raw = np.stack(arrays, axis=1).tobytes()
        compressed = gzip.compress(raw, mtime=0)
        metadata = {
            "version": 1,
            "title": "NASA Ames 2018 global dust storm · reference simulation",
            "kind": "model-output",
            "citation": "Bertrand et al. (2020), Simulation of the 2018 Global Dust Storm on Mars Using the NASA Ames Mars GCM: A Multitracer Approach",
            "doi": "https://doi.org/10.1029/2019JE006122",
            "source": {
                "url": SOURCE_ROOT + SOURCE_NAME,
                "bytes": args.source.stat().st_size,
                "md5": SOURCE_MD5,
                "sha256": digest(args.source, "sha256"),
                "title": dataset.title,
            },
            "grid": {
                "width": 180,
                "height": 90,
                "west": -180,
                "east": 180,
                "north": 90,
                "south": -90,
                "stepDegrees": 2,
                "rowOrder": "north-to-south",
                "columnOrder": "west-to-east",
                "longitude": "east-positive",
                "body": "Mars",
                "sourceRegridding": "NASA bilinear regridding from FV3 cubed sphere",
            },
            "time": {
                "sourceUnits": dataset["time"].units,
                "sourceCalendar": dataset["time"].calendar,
                "sourceIndices": indices.tolist(),
                "modelDays": time[indices].tolist(),
                "elapsedSols": (time[indices] - time[indices[0]]).tolist(),
                "sampleIntervalSols": 2,
                "sourceIntervalSols": 1 / 12,
                "note": "Model-relative time only. Invalid civil epoch in source; no UTC conversion. Source native samples are two model hours apart.",
            },
            "fields": fields,
            "encoding": {
                "url": "fields.bin.gz",
                "type": "uint16-little-endian",
                "compression": "gzip",
                "layout": "frame,field,row,column",
                "missingValue": 65535,
                "bytes": len(compressed),
                "decodedBytes": len(raw),
                "sha256": hashlib.sha256(compressed).hexdigest(),
                "decodedSha256": hashlib.sha256(raw).hexdigest(),
            },
            "limits": [
                "Model output, not direct observations or a forecast.",
                "Global 2-degree grid does not resolve local sandstorms or habitat weather.",
                "No wind vectors or trajectories in this 2D subset.",
                "Optical depth is dimensionless and normalized to 610 Pa according to the NASA README; it is not dust mass.",
                "NetCDF tau_current units are blank; interpretation comes from the NASA README.",
                "README stress units conflict with NetCDF; stress is not displayed.",
                "Dissipation in opacity alone cannot distinguish settling from transport.",
                "Sampling every two sols can miss shorter-lived events.",
            ],
        }
    args.output.mkdir(parents=True)
    (args.output / "fields.bin.gz").write_bytes(compressed)
    (args.output / "manifest.json").write_text(
        json.dumps(metadata, indent=2, allow_nan=False) + "\n"
    )
    print(
        f"{len(indices)} frames, {len(compressed):,} compressed bytes; source MD5 verified"
    )


if __name__ == "__main__":
    main()
