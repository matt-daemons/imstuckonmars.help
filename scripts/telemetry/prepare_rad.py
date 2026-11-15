"""Build the Curiosity RAD companion release and its bounded D1 SQL import.

The radiation release is separate from the MOXIE/MEDA release: it is immutable, published on
its own, and small enough to import without reloading the MOXIE/MEDA data. Offline only.
Requires the pinned packages in scripts/telemetry/requirements.txt.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3

import cdflib
from cdflib import cdfepoch
import numpy

from acquire import ROOT, digest
from acquire_rad import MANIFEST, SPDF, attribute
from prepare import export_sql, write_weight

VERSION = "rad-ingestion-v1"
CREATED_AT = "2026-11-14T00:00:00Z"
TABLES = ["data_releases", "source_products", "field_definitions", "quality_issues", "rad_observations"]
# DOSIMETRY_TOTAL columns, checked against DOSIMETRY_OBS_LABEL in every file.
DOSE_FIELDS = [
    ("Total Dose B", "dose_rate_b_ugy_day",
     "Absorbed dose rate recorded in RAD silicon detector B. The label does not state an MMRTG "
     "correction; the companion RTG Corrected Dose B removes the rover power-source contribution."),
    ("RTG Corrected Dose B", "dose_rate_b_rtg_corrected_ugy_day",
     "Absorbed dose rate in RAD silicon detector B, corrected for the contribution of the rover's "
     "Multi-Mission Radioisotope Thermoelectric Generator (MMRTG)."),
    ("Total Dose E", "dose_rate_e_ugy_day",
     "Absorbed dose rate recorded in RAD detector E, tissue-equivalent plastic. The label does not "
     "state an MMRTG correction."),
]
WARNINGS = [
    "curiosity_rad_at_gale_crater_not_jezero_or_the_hypothetical_base",
    "absorbed_dose_rate_in_detector_material_not_dose_equivalent_or_crew_exposure",
    "sol_column_is_the_msl_curiosity_sol_not_perseverance",
    "msl_spacecraft_clock_not_comparable_with_m2020_sclk; aligned_by_utc_only",
    "epoch_is_observation_start; nominal_16_minute_observations; 8_minute_during_high_count_rates",
    "flagged_observations_masked: source says flagged data should be removed for science",
    "dosimetry_timeslices_let_spectra_and_neutral_histograms_not_ingested",
]


def utc_ms(tt2000):
    year, month, day, hour, minute, second, ms, *_ = (int(part) for part in cdfepoch.breakdown_tt2000(int(tt2000)))
    stamp = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
    return round(stamp.timestamp() * 1000) + ms


def native(value):
    """Store a float32 as the shortest decimal that converts back to exactly the same float32."""
    return float(numpy.format_float_positional(numpy.float32(value), unique=True, trim="-"))


def iso(value):
    """Convert a RAD global time attribute such as 20230606_00:16:23 to ISO 8601 UTC."""
    return datetime.strptime(value, "%Y%m%d_%H:%M:%S").strftime("%Y-%m-%dT%H:%M:%SZ")


class Builder:
    def __init__(self, db, release):
        self.db = db
        self.release = release
        self.issues = []

    def masked(self, value, attributes, product, field, row):
        if value is None:
            return None
        value = native(value)
        low, high = float(attributes["VALIDMIN"]), float(attributes["VALIDMAX"])
        if not math.isfinite(value) or value == float(attributes["FILLVAL"]) or not low <= value <= high:
            self.issues.append((product, field, row, "fill_or_outside_valid_range"))
            return None
        return value

    def product(self, source):
        path = ROOT / source["path"]
        cdf = cdflib.CDF(str(path))
        attributes = cdf.globalattsget()
        labels = [str(label).strip() for label in cdf.varget("DOSIMETRY_OBS_LABEL")]
        if labels != [label for label, _, _ in DOSE_FIELDS]:
            raise ValueError(f"Unexpected RAD dosimetry columns: {path}: {labels}")
        epochs = cdf.varget("EPOCH")
        times = [utc_ms(epoch) for epoch in epochs]
        if any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError(f"Non-increasing RAD epochs: {path}")
        # The file Start_time equals the first epoch, which is why epochs are treated as starts.
        start = datetime.strptime(attribute(attributes, "Start_time"), "%Y%m%d_%H:%M:%S")
        if times[0] != round(start.replace(tzinfo=timezone.utc).timestamp() * 1000):
            raise ValueError(f"First epoch is not the file start time; epoch semantics changed: {path}")
        lid, version = source["logical_file_id"], source["data_version"]
        product = hashlib.sha256((self.release + lid + version).encode()).hexdigest()[:24]
        self.db.execute("INSERT INTO source_products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            product, self.release, lid, version, "rad", "dosimetry", "level2",
            int(attribute(attributes, "Start_sol")), source["url"], source["url"],
            source["sha256"], source["sha256"], source["verification"], len(epochs), None, None,
            iso(attribute(attributes, "Start_time")), iso(attribute(attributes, "Stop_time")),
            "instrument_epoch_tt2000_observation_start", json.dumps(WARNINGS)))
        dose_attributes = cdf.varattsget("DOSIMETRY_TOTAL")
        alive_attributes = cdf.varattsget("ALIVE_TIME")
        unit = dose_attributes["UNITS"]
        if unit != "uGray/day" or alive_attributes["UNITS"] != "seconds":
            raise ValueError(f"Unexpected RAD units: {path}")
        rules = ["fill_and_outside_VALIDMIN_VALIDMAX_masked", "FLAGGED_DATA_observations_masked",
                 "float32_stored_as_shortest_round_trip_decimal",
                 "uGy/h equals uGy/day divided by 24 (unit conversion only)"]
        definitions = [
            ("alive_time_s", "ALIVE_TIME", "seconds", "s",
             "Seconds the RAD electronics could accept particles during the observation (source: ALIVE_TIME). "
             "DURATION and DEAD_TIME are not in this product.",
             ["fill_and_outside_VALIDMIN_VALIDMAX_masked", "float32_stored_as_shortest_round_trip_decimal"]),
            ("flag", "FLAGGED_DATA", None, None,
             "Source quality flag, for example Cmds (commanding) or DAN (DAN neutron instrument firing). "
             "Empty in the source means not flagged.", ["empty_source_flag_stored_as_null"]),
            *[(field, f"DOSIMETRY_TOTAL[{index}] ({label})", unit, "uGy/day", text, rules)
              for index, (label, field, text) in enumerate(DOSE_FIELDS)],
        ]
        for field, source_field, source_unit, normalized, text, field_rules in definitions:
            self.db.execute("INSERT INTO field_definitions VALUES (?,?,?,?,?,?,?,?)", (
                product, field, source_field, source_unit, normalized, text, "NASA RAD Level 2 (calibrated)",
                json.dumps(field_rules)))
        doses = cdf.varget("DOSIMETRY_TOTAL")
        alive = cdf.varget("ALIVE_TIME")
        flags = cdf.varget("FLAGGED_DATA")
        for row, time in enumerate(times, 1):
            flag = str(flags[row - 1]).strip() or None
            values = []
            for index, (_, field, _) in enumerate(DOSE_FIELDS):
                value = self.masked(doses[row - 1][index], dose_attributes, product, field, row)
                if flag is not None:
                    self.issues.append((product, field, row, "flagged_" + re.sub(r"[^a-z0-9]+", "_", flag.lower())))
                    value = None
                values.append(value)
            self.db.execute("INSERT INTO rad_observations VALUES (?,?,?,?,?,?,?,?)", (
                product, row, time, self.masked(alive[row - 1], alive_attributes, product, "alive_time_s", row),
                flag, *values))

    def write_issues(self):
        ranges = {}
        for product, field, row, code in sorted(set(self.issues)):
            key = (product, field, code)
            if key in ranges and ranges[key][-1][1] == row - 1:
                ranges[key][-1][1] = row
            else:
                ranges.setdefault(key, []).append([row, row])
        for (product, field, code), spans in ranges.items():
            detail = ("Source FLAGGED_DATA marks quality issues (commanding, DAN firing, corruption); "
                      "flagged data should be removed for science" if code.startswith("flagged_")
                      else "Fill value or outside the source VALIDMIN/VALIDMAX")
            for start, end in spans:
                self.db.execute("INSERT INTO quality_issues VALUES (?,?,?,?,?,?)", (
                    product, field, start, end, code,
                    detail + "; original value retained in the immutable source product"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", default="nasa-rad-sol816-v1")
    parser.add_argument("--output", type=Path, default=ROOT / "generated/radiation")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]{1,40}", args.release):
        raise ValueError("Invalid release ID")
    manifest = json.loads(MANIFEST.read_text())
    for entry in manifest["sources"]:
        if not entry["url"].startswith(SPDF) or digest(ROOT / entry["path"]) != entry["sha256"]:
            raise ValueError(f"Unverified or altered RAD source: {entry['path']}")
    args.output.mkdir(parents=True, exist_ok=True)
    db_path = args.output / "radiation.sqlite"
    if db_path.exists():
        db_path.unlink()
    db = sqlite3.connect(db_path)
    db.execute("PRAGMA foreign_keys=ON")
    for migration in sorted((ROOT / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    db.execute("INSERT INTO data_releases VALUES (?,?,?,?,?)",
               (args.release, VERSION, digest(MANIFEST), "staging", CREATED_AT))
    builder = Builder(db, args.release)
    for source in manifest["sources"]:
        builder.product(source)
    builder.write_issues()
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("Broken source references")
    db.commit()
    export_sql(db, args.output / "release-data.sql", TABLES)
    products = db.execute("SELECT count(*) FROM source_products").fetchone()[0]
    observations = db.execute("SELECT count(*) FROM rad_observations").fetchone()[0]
    (args.output / "publish.sql").write_text(
        f"UPDATE data_releases SET status='published' WHERE id='{args.release}' AND status='staging' "
        f"AND (SELECT count(*) FROM source_products WHERE release_id='{args.release}')={products} "
        f"AND (SELECT count(*) FROM rad_observations s JOIN source_products p ON p.id=s.product_id "
        f"WHERE p.release_id='{args.release}')={observations};\n")
    statistics = {}
    for _, field, _ in DOSE_FIELDS:
        count, low, high, mean = db.execute(
            f"SELECT count({field}),min({field}),max({field}),avg({field}) FROM rad_observations").fetchone()
        statistics[field] = {"unit": "uGy/day", "usable": count, "masked": observations - count,
                             "min": low, "max": high, "mean": mean}
    report = {"release": args.release, "processing_version": VERSION, "source_products": products,
              "observations": observations,
              "flags": dict(db.execute("SELECT flag,count(*) FROM rad_observations WHERE flag IS NOT NULL GROUP BY flag")),
              "observation_start_utc_span": [
                  datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                  for ms in db.execute("SELECT min(utc_ms),max(utc_ms) FROM rad_observations").fetchone()],
              "statistics": statistics,
              "application_rows": sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in TABLES),
              "estimated_import_write_units": sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] * write_weight(db, t) for t in TABLES),
              "sql_bytes": (args.output / "release-data.sql").stat().st_size,
              "sql_sha256": digest(args.output / "release-data.sql")}
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    db.close()


if __name__ == "__main__":
    main()
