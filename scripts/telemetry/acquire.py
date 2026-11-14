"""Acquire the approved bounded NASA products and verify the retained source subset."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/telemetry"
CACHE = ROOT / ".cache/telemetry"
NASA = "https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/"
NS = {"p": "http://pds.nasa.gov/pds4/pds/v1"}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location",
         "--proto", "=https", "--continue-at", "-", "--max-time", "600",
         "--output", str(temporary), url],
        check=True,
    )
    if destination.exists() and digest(destination) != digest(temporary):
        temporary.unlink()
        raise ValueError(f"Refusing to replace changed source: {destination}")
    temporary.replace(destination)


def deletion_candidates():
    files = list((DATA / "meda").glob("*.csv"))
    files += [DATA / "moxie/moxie_bundle.tar.gz"]
    for relative in ["moxie/moxie_bundle/data_raw", "rad", "rems",
                     "moxie/moxie_bundle/xml_schema"]:
        files += [p for p in (DATA / relative).rglob("*") if p.is_file()]
    document = DATA / "moxie/moxie_bundle/document"
    files += list(document.glob("Mars2020_moxie_Labels_sort_*"))
    files += list(document.glob("mars2020_moxie_labels_sort_*"))
    return sorted(p for p in set(files) if p.exists())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prune", action="store_true", help="Delete the approved 318-file subset after verification")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    removals = deletion_candidates()
    if removals and len(removals) != 318:
        raise ValueError(f"Cleanup scope changed: expected 318 files, found {len(removals)}")
    cleanup = [{"path": str(p.relative_to(ROOT)), "sha256": digest(p), "bytes": p.stat().st_size}
               for p in removals]
    (CACHE / "cleanup-manifest.json").write_text(json.dumps(cleanup, indent=2) + "\n")
    excluded = set(removals)
    archive = CACHE / "official-moxie-bundle.tar.gz"
    download(NASA + "moxie_bundle.tar.gz", archive)
    sources = []

    def record(path, url, verification):
        sources.append({"path": str(path.relative_to(ROOT)), "url": url,
                        "sha256": digest(path), "bytes": path.stat().st_size,
                        "verification": verification})

    with tarfile.open(archive, "r:gz") as bundle:
        for path in sorted((DATA / "moxie/moxie_bundle").rglob("*")):
            if not path.is_file() or path in excluded:
                continue
            relative = str(path.relative_to(DATA / "moxie"))
            stream = bundle.extractfile(relative)
            if stream is None:
                raise ValueError(f"Missing official archive member: {relative}")
            h = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(chunk)
            if h.hexdigest() != digest(path):
                raise ValueError(f"Official MOXIE archive differs: {path}")
            record(path, NASA + relative, "official_archive_byte_match")

    for label in sorted((DATA / "meda/measurements/sol_0816").glob("*.xml")):
        remote = CACHE / "labels" / label.name
        url = NASA + "mars2020_meda/data_calibrated_env/sol_0780_0899/sol_0816/" + label.name
        # Derived products are verified separately below.
        if "CAL_" not in label.name:
            continue
        download(url, remote)
        if digest(label) != digest(remote):
            raise ValueError(f"Official MEDA label differs: {label}")
        check_meda(label, url, record)

    target = DATA / "meda/measurements/sol_0816"
    for sensor in ["PS", "RHS", "TIRS", "ANCILLARY"]:
        suffix = {"PS": "PS__________________", "RHS": "RHS_________________",
                  "TIRS": "TIRS________________", "ANCILLARY": "ANCILLARY___________"}[sensor]
        filename = f"WE__0816___________DER_{suffix}P01"
        url = NASA + "mars2020_meda/data_derived_env/sol_0780_0899/sol_0816/" + filename
        download(url + ".xml", target / (filename + ".xml"))
        download(url + ".CSV", target / (filename + ".CSV"))
        check_meda(target / (filename + ".xml"), url + ".xml", record)

    for filename in ["meda_env_rdr_sis.pdf", "meda_env_rdr_sis.pdf.xml", "meda_release_notes.txt"]:
        path = DATA / "meda/document" / filename
        url = NASA + "mars2020_meda/document/" + filename
        download(url, path)
        record(path, url, "official_https_download")
    path = DATA / "meda/readme.txt"
    download(NASA + "mars2020_meda/readme.txt", path)
    record(path, NASA + "mars2020_meda/readme.txt", "official_https_download")

    manifest = {"schema_version": 1, "authority": "NASA Planetary Data System Atmospheres Node",
                "node_directory": "https://pds.nasa.gov/home/about/node-descriptions.shtml",
                "moxie_archive_sha256": digest(archive), "sources": sources}
    (DATA / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if args.prune:
        for entry in cleanup:
            path = ROOT / entry["path"]
            if digest(path) != entry["sha256"]:
                raise ValueError(f"Source changed since cleanup inventory: {path}")
        for entry in cleanup:
            (ROOT / entry["path"]).unlink()
    print(json.dumps({"verified_files": len(sources), "removed_files": len(cleanup) if args.prune else 0,
                      "removed_bytes": sum(e["bytes"] for e in cleanup) if args.prune else 0,
                      "manifest": "data/telemetry/sources.json"}, indent=2))


def check_meda(label, url, record):
    root = ET.parse(label).getroot()
    name = root.findtext(".//p:File/p:file_name", namespaces=NS)
    expected = root.findtext(".//p:File/p:md5_checksum", namespaces=NS)
    path = label.with_name(name)
    if hashlib.md5(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"MEDA checksum mismatch: {path}")
    record(label, url, "official_label_byte_match")
    record(path, url.rsplit("/", 1)[0] + "/" + name, "official_label_md5_match")


if __name__ == "__main__":
    main()
