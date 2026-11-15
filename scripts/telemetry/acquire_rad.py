"""Acquire the approved Curiosity RAD Level 2 observations that overlap Perseverance sol 816.

Offline only. Requires the pinned packages in scripts/telemetry/requirements.txt.
Writes a separate provenance manifest so the MOXIE/MEDA manifest, and every release
built from it, stays byte-for-byte reproducible.
"""

import json

import cdflib

from acquire import DATA, ROOT, digest, download

RAD = DATA / "msl_rad_l2"
MANIFEST = RAD / "sources.json"
SPDF = "https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/"
# UTC days 157-158 of 2023 cover the MEDA sol-816 span (2023-06-06T14:47Z to 2023-06-07T14:31Z),
# including the MOXIE run (2023-06-06T15:19Z to 18:43Z). Versions are pinned: a new upstream
# version is a new source and needs review.
FILES = ["msl_rad_obs-l2_2023157_v05.cdf", "msl_rad_obs-l2_2023158_v06.cdf"]
VERIFICATION = ("official_https_download; cdf_logical_file_id_version_and_record_count_match; "
                "no_upstream_checksum_published_sha256_recorded_at_acquisition")


def attribute(attributes, name):
    value = attributes[name]
    return value[0] if isinstance(value, list) else value


def describe(path):
    """Check that the file identifies itself as the pinned product before recording it."""
    cdf = cdflib.CDF(str(path))
    attributes = cdf.globalattsget()
    stem, version = path.stem.rsplit("_v", 1)
    if attribute(attributes, "Logical_file_id") != stem or attribute(attributes, "Data_version") != version:
        raise ValueError(f"RAD file identity differs from its pinned name: {path}")
    if attribute(attributes, "Logical_source") != "msl_rad_obs-l2":
        raise ValueError(f"Unexpected RAD dataset: {path}")
    records = int(attribute(attributes, "File_records"))
    if len(cdf.varget("EPOCH")) != records:
        raise ValueError(f"RAD record count differs from File_records: {path}")
    return {"logical_file_id": stem, "data_version": version, "records": records,
            "start_sol": int(attribute(attributes, "Start_sol")),
            "start_time": attribute(attributes, "Start_time"),
            "stop_time": attribute(attributes, "Stop_time")}


def main():
    sources = []
    for name in FILES:
        path = RAD / name
        url = SPDF + name[15:19] + "/" + name
        download(url, path)  # Refuses to replace an existing file whose bytes changed.
        sources.append({"path": str(path.relative_to(ROOT)), "url": url, "sha256": digest(path),
                        "bytes": path.stat().st_size, "verification": VERIFICATION, **describe(path)})
    manifest = {"schema_version": 1,
                "authority": "NASA Space Physics Data Facility (SPDF), CDAWeb dataset MSL_RAD_OBS-L2",
                "catalog": "https://catalog.data.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr",
                "instrument_reference": "https://doi.org/10.1007/s11214-012-9913-1",
                "acknowledgement": "RAD Principal Investigator Dr. Hassler of Southwest Research Institute Boulder",
                "sources": sources}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"verified_files": len(sources), "manifest": str(MANIFEST.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
