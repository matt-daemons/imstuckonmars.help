"""Build a reproducible SQLite release and bounded D1 SQL imports from verified NASA files."""

import argparse
from collections import defaultdict
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import xml.etree.ElementTree as ET

from acquire import DATA, ROOT, NS, digest

VERSION = "ares-ingestion-v1"
MEDA_TABLES = {sensor: f"meda_{sensor.lower()}_samples"
               for sensor in ["ATS", "PS", "RHS", "TIRS", "RDS", "ENG", "ANCILLARY"]}
ALIASES = {"local_temp_uncertainty": "humidity_local_temp_uncertainty",
           "volume_mixing_ration_uncertainty": "volume_mixing_ratio_uncertainty",
           "upward_lw_uncertainty": "upward_lw_irradiance_uncertainty"}
MOXIE_FIELDS = {
    "TT": ("top_temperature_k", 1, 273.15, "K"),
    "TB": ("bottom_temperature_k", 1, 273.15, "K"),
    "IT": ("top_current_a", 1, 0, "A"), "IB": ("bottom_current_a", 1, 0, "A"),
    "V28VM": ("main_voltage_v", 1, 0, "V"),
    "P1_cal": ("inlet_pressure_pa", 100000, 0, "Pa"),
    "P4_cal": ("cathode_pressure_pa", 100000, 0, "Pa"),
    "SW_MODE": ("mode", 1, 0, None), "VT_en": ("top_enabled", 1, 0, None),
    "VB_en": ("bottom_enabled", 1, 0, None), "SW_FAULT_COUNT": ("fault_count", 1, 0, None),
    "SW_LAST_FAULT": ("last_fault_code", 1, 0, None),
    "F_O2_I_G_HR": ("oxygen_rate_g_h", 1, 0, "g/h"),
    "P_TOT_W": ("total_power_w", 1, 0, "W"),
    "P_MAIN_W": ("main_power_w", 1, 0, "W"), "P_SOXE_W": ("soxe_power_w", 1, 0, "W"),
    "E_TOT_W_HR": ("archive_energy_wh", 1, 0, "Wh"),
}


def canonical(name):
    key = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return ALIASES.get(key, key)


def milliseconds(value):
    return int(Decimal(str(value)) * 1000)


def utc_ms(value):
    return round(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def metadata(label):
    root = ET.parse(label).getroot()
    table = root.find(".//p:Table_Delimited", NS)
    fields = table.findall(".//p:Field_Delimited", NS)
    def find(name):
        return next((e.text.strip() for e in root.iter() if e.tag.split("}")[-1] == name and e.text), None)
    path = label.with_name(root.findtext(".//p:File/p:file_name", namespaces=NS))
    with path.open(newline="") as stream:
        reader = csv.DictReader(stream)
        names = reader.fieldnames
        rows = list(reader)
    warnings = []
    if len(rows) != int(table.findtext("p:records", namespaces=NS)):
        if "data_calibrated" not in str(path) or label.parent.name not in ["00081", "00155"]:
            raise ValueError(f"Unknown row-count discrepancy: {path}")
        warnings.append("declared_record_count_disagrees_with_csv")
    if len(names) != len(fields) or any(len(row) != len(names) or None in row for row in rows):
        raise ValueError(f"Malformed table: {path}")
    for index, (name, field) in enumerate(zip(names, fields)):
        declared = field.findtext("p:name", namespaces=NS)
        if canonical(name) != canonical(declared):
            allowed = ("RHS" in path.name and index in [6, 12])
            if not allowed:
                raise ValueError(f"Unknown header mismatch: {path}: {name} / {declared}")
            warnings.append(f"label_name_mismatch_column_{index + 1}")
    if [int(f.findtext("p:field_number", namespaces=NS)) for f in fields] != list(range(1, len(fields) + 1)):
        if "data_derived" not in str(path):
            raise ValueError(f"Unknown field numbering issue: {path}")
        warnings.append("label_field_numbering_inconsistent")
    with path.open("rb") as stream:
        if len(stream.readline()) != int(table.findtext("p:offset", namespaces=NS)):
            raise ValueError(f"Invalid table offset: {path}")
    return {"root": root, "fields": dict(zip(names, fields)), "rows": rows, "path": path,
            "label": label, "lid": find("logical_identifier"), "version": find("version_id"),
            "start": find("start_date_time"), "stop": find("stop_date_time"),
            "sclk_start": find("spacecraft_clock_start"), "nasa_run_id": find("run_id"),
            "warnings": warnings}


class Builder:
    def __init__(self, connection, manifest, release):
        self.db = connection
        self.manifest = {item["path"]: item for item in manifest["sources"]}
        self.release = release
        self.bad_pressure_times = set()
        self.issues = defaultdict(list)
        self.tables = {name: {row[1] for row in self.db.execute(f"PRAGMA table_info({name})")}
                       for name in MEDA_TABLES.values()}

    def product(self, meta, instrument, sensor, level, sol, times, unresolved=False):
        path = meta["path"]
        source = self.manifest[str(path.relative_to(ROOT))]
        label = self.manifest[str(meta["label"].relative_to(ROOT))]
        identity = hashlib.sha256((self.release + meta["lid"] + meta["version"]).encode()).hexdigest()[:24]
        self.db.execute("INSERT INTO source_products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            identity, self.release, meta["lid"], meta["version"], instrument, sensor, level, sol,
            source["url"], label["url"], source["sha256"], label["sha256"], source["verification"],
            len(meta["rows"]), None if unresolved else times[0], None if unresolved else times[-1],
            meta["start"], meta["stop"], "unresolved" if unresolved else "approximate_label_anchor",
            json.dumps(meta["warnings"])))
        return identity

    def field(self, product, name, source, field, unit=None, rules=None, level="calibrated"):
        self.db.execute("INSERT INTO field_definitions VALUES (?,?,?,?,?,?,?,?)", (
            product, name, source, field.findtext("p:unit", namespaces=NS), unit,
            " ".join(field.findtext("p:description", default="", namespaces=NS).split()),
            "NASA archive-derived" if level == "derived" else "NASA calibrated",
            json.dumps(rules or [])))

    def issue(self, product, field, row, code):
        self.issues[(product, field, code)].append(row)

    def value(self, raw, field, product, name, row):
        if raw is None or not raw.strip():
            self.issue(product, name, row, "missing_or_inapplicable")
            return None
        if field.findtext("p:data_type", namespaces=NS) == "ASCII_String":
            return raw
        value = float(raw)
        specials = [float(e.text) for e in field.findall("p:Special_Constants/*", NS)]
        if not math.isfinite(value) or value in [999999999, 9999999999, *specials]:
            self.issue(product, name, row, "invalid_or_not_applicable")
            return None
        return value

    def meda(self, meta):
        sensor = re.search(r"_(CAL|DER)_([A-Z]+)_", meta["path"].name).group(2)
        level = "derived" if "_DER_" in meta["path"].name else "calibrated"
        table = MEDA_TABLES[sensor]
        times = [milliseconds(row["SCLK"]) for row in meta["rows"]]
        if any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError(f"Non-increasing MEDA clock: {meta['path']}")
        if sensor == "TIRS":
            meta["warnings"].append("field_of_view_flags_required; missing_flags_are_unknown_not_good")
        if sensor == "RHS":
            meta["warnings"].append("humidity_scale_not_specified_in_xml; use_volume_mixing_ratio_ppm_where_available")
        if sensor == "ANCILLARY":
            meta["warnings"].append("positions_are_M2020_TOPO_meters_relative_to_landing_not_latitude_longitude")
        if sensor == "RDS":
            meta["warnings"].append("optical_band_channels_not_dust_concentration_or_astronaut_radiation")
        product = self.product(meta, "meda", sensor.lower(), level, 816, times)
        selected = [(name, canonical(name), field) for name, field in meta["fields"].items()
                    if canonical(name) in self.tables[table] and name not in ["SCLK", "LMST", "LTST"]]
        for name, key, field in selected:
            rules = ["blank_and_SIS_fill_values_masked", "native_geometry_flags_preserved"]
            unit = field.findtext("p:unit", namespaces=NS)
            if key == "pressure_uncertainty" and unit == "kelvin":
                rules.append("unit_conflict_withheld")
                unit = None
            self.field(product, key, name, field, unit, rules, level)
        columns = ["product_id", "source_row", "sclk_ms", "utc_ms", "lmst", "ltst"] + [key for _, key, _ in selected]
        query = f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
        rollups = defaultdict(list)
        for index, (row, time) in enumerate(zip(meta["rows"], times), 1):
            values = []
            for name, key, field in selected:
                value = self.value(row[name], field, product, key, index)
                code = None
                if value is not None and sensor == "RHS" and "humidity" in key and "temp" not in key:
                    if time in self.bad_pressure_times: code = "invalid_pressure_propagated_to_humidity"
                    elif value < 0: code = "negative_relative_humidity"
                if isinstance(value, (int, float)) and sensor == "PS" and "pressure" in key and "uncertainty" not in key and value <= 0:
                    code = "nonpositive_pressure"
                if key == "pressure_uncertainty" and field.findtext("p:unit", namespaces=NS) == "kelvin":
                    code = "unit_conflict"
                if value is not None and sensor == "TIRS" and (key.startswith("downward_lw") or key.startswith("air_temp")) and row.get("RSM_HEAD_OUTSIDE_TIRS_UPWARD_LOOKING_FOV") == "0":
                    code = "upward_field_of_view_obstructed"
                if code:
                    self.issue(product, key, index, code)
                    value = None
                values.append(value)
                if isinstance(value, (int, float)) and "uncertainty" not in key:
                    rollups[(key, time // 60000 * 60000)].append(value)
            self.db.execute(query, [product, index, time, utc_ms(meta["start"]) + time - times[0], row["LMST"], row["LTST"], *values])
        self.db.executemany("INSERT INTO metric_rollups VALUES (?,?,?,?,?,?,?)",
            [(product, field, bucket, len(values), min(values), max(values), math.fsum(values) / len(values))
             for (field, bucket), values in rollups.items()])

    def moxie(self, cal, derived, directory):
        unresolved = directory in [96, 901]
        warnings = cal["warnings"]
        if directory == 96: warnings.append("copied_UTC_sol_SCLK_metadata_quarantined")
        if directory == 901: warnings.append("elapsed_counter_reset;derived_product_absent")
        if directory in [176, 631]: warnings.append("UTC_duration_disagrees_with_elapsed_span")
        if directory == 631: warnings.append("directory_631_starts_on_label_sol_630")
        elapsed = [milliseconds(row["SW_TIME"]) for row in cal["rows"]]
        times = [milliseconds(cal["sclk_start"]) + t - elapsed[0] for t in elapsed]
        cal_id = self.product(cal, "moxie", "engineering", "calibrated", directory, times, unresolved)
        derived_id = None
        if derived:
            if elapsed != [milliseconds(row["T"]) for row in derived["rows"]]:
                raise ValueError("Calibrated and derived elapsed arrays differ")
            derived["warnings"] += warnings
            derived_id = self.product(derived, "moxie", "production", "derived", directory, times, unresolved)
        for meta, pid in [(cal, cal_id), (derived, derived_id)]:
            if meta:
                for source, (name, factor, offset, unit) in MOXIE_FIELDS.items():
                    if source in meta["fields"]:
                        self.field(pid, name, source, meta["fields"][source], unit,
                                   [f"value * {factor} + {offset}", "CS4_purity_not_supported"],
                                   "derived" if meta is derived else "calibrated")
        run = f"{self.release}-moxie-{directory:05}"
        self.db.execute("INSERT INTO moxie_runs VALUES (?,?,?,?,?,?,?,?,?)", (
            run, self.release, directory, cal["nasa_run_id"], cal_id, derived_id,
            len(elapsed), "unresolved" if unresolved else "approximate_label_anchor", json.dumps(warnings)))
        columns = ["run_id", "source_row", "segment_id", "elapsed_ms", "sclk_ms", "utc_ms"] + [v[0] for v in MOXIE_FIELDS.values()]
        query = f"INSERT INTO moxie_samples ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
        segment = 0
        oxygen = []
        power = []
        active = []
        residuals = []
        power_residuals = []
        energy = 0
        for index, (row, time) in enumerate(zip(cal["rows"], elapsed), 1):
            if index > 1 and time <= elapsed[index - 2]:
                if directory != 901: raise ValueError("Unexpected MOXIE counter reset")
                segment += 1
            if index > 1 and segment == 0 and time - elapsed[index - 2] != 1000:
                raise ValueError("Unexpected MOXIE sample gap")
            d = derived["rows"][index - 1] if derived else {}
            values = []
            for source, (_, factor, offset, _) in MOXIE_FIELDS.items():
                meta = cal if source in cal["fields"] else derived
                raw = row.get(source, d.get(source))
                value = self.value(raw, meta["fields"][source], cal_id if meta is cal else derived_id,
                                   MOXIE_FIELDS[source][0], index) if meta else None
                values.append(None if value is None else value * factor + offset)
            if derived:
                q, p = float(d["F_O2_I_G_HR"]), float(d["P_TOT_W"])
                oxygen.append(q)
                power.append(p)
                energy += p / 3600
                if q > 0 and (row["VT_en"] == "1" or row["VB_en"] == "1") and row["SW_MODE"] == "1": active.append(q)
                residuals.append(abs(energy - float(d["E_TOT_W_HR"])))
                power_residuals.append(abs(p - float(d["P_MAIN_W"]) - float(d["P_SOXE_W"])))
            self.db.execute(query, [run, index, segment, time, None if unresolved else times[index - 1],
                None if unresolved else utc_ms(cal["start"]) + time - elapsed[0], *values])
        self.db.execute("INSERT INTO experiment_summaries VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
            run, len(oxygen), len(active) if derived else None, math.fsum(oxygen) / 3600 if derived else None,
            float(derived["rows"][-1]["E_TOT_W_HR"]) if derived else None,
            math.fsum(power) / 3600 if derived else None, max(oxygen) if derived else None,
            math.fsum(active) / len(active) if active else None,
            max(residuals) if derived else None, max(power_residuals) if derived else None,
            "inclusive one-second sum; active: q>0 AND (VT_en OR VB_en) AND SW_MODE=1"))

    def write_issues(self):
        for (product, field, code), indices in self.issues.items():
            start = end = indices[0]
            for row in [*indices[1:], None]:
                if row == end + 1:
                    end = row
                    continue
                self.db.execute("INSERT INTO quality_issues VALUES (?,?,?,?,?,?)", (
                    product, field, start, end, code, "Original value retained in the immutable source product; see source row and field definition"))
                start = end = row


EXPORT_TABLES = ["data_releases", "source_products", "field_definitions", "quality_issues", *MEDA_TABLES.values(),
                 "moxie_runs", "moxie_samples", "experiment_summaries", "metric_rollups", "scenario_presets"]


def write_weight(db, table):
    # WITHOUT ROWID primary keys are table storage, not an additional secondary index.
    return 1 + sum(row[3] != "pk" or not db.execute(
        "SELECT sql LIKE '%WITHOUT ROWID%' FROM sqlite_master WHERE name=?", (table,)).fetchone()[0]
        for row in db.execute(f"PRAGMA index_list({table})"))


def bound_release(db, max_rows, max_write_units):
    """Keep one complete sortie trace plus matching MEDA windows within both budgets."""
    run_id, trace_count = db.execute("SELECT id,sample_count FROM moxie_runs WHERE directory_sol=816").fetchone()
    start, stop = db.execute("SELECT min(sclk_ms),max(sclk_ms) FROM moxie_samples WHERE run_id=?", (run_id,)).fetchone()
    metadata_tables = [t for t in EXPORT_TABLES if t not in [*MEDA_TABLES.values(), "moxie_samples", "metric_rollups"]]
    rows = sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in metadata_tables) + trace_count
    writes = sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] * write_weight(db, t) for t in metadata_tables)
    writes += trace_count * write_weight(db, "moxie_samples")
    chosen = []
    # Preserve the primary replay companions before contextual sensor inspection.
    priority = [("ats", "calibrated"), ("ps", "derived"), ("rhs", "derived"),
                ("tirs", "calibrated"), ("ancillary", "derived"), ("eng", "calibrated"), ("rds", "calibrated")]
    rollup_fields = {}
    for position, (sensor, level) in enumerate(priority):
        product_id = db.execute("SELECT id FROM source_products WHERE instrument='meda' AND sensor=? AND processing_level=?", (sensor, level)).fetchone()[0]
        table = MEDA_TABLES[sensor.upper()]
        fields = [r[0] for r in db.execute("SELECT field FROM field_definitions WHERE product_id=?", (product_id,))]
        numeric = {r[1] for r in db.execute(f"PRAGMA table_info({table})") if r[2] in ["INTEGER", "REAL"]}
        fields = [f for f in fields if f in numeric and "uncertainty" not in f]
        count = db.execute(f"SELECT count(*) FROM {table} WHERE product_id=? AND sclk_ms BETWEEN ? AND ?", (product_id, start, stop)).fetchone()[0]
        rollups = sum(db.execute(f"SELECT count(DISTINCT CAST(sclk_ms/60000 AS INTEGER)) FROM {table} WHERE product_id=? AND sclk_ms BETWEEN ? AND ? AND {field} IS NOT NULL", (product_id, start, stop)).fetchone()[0] for field in fields)
        candidate_rows = rows + count + rollups
        candidate_writes = writes + count * write_weight(db, table) + rollups * write_weight(db, "metric_rollups")
        if candidate_rows <= max_rows and candidate_writes <= max_write_units:
            chosen.append(product_id)
            rollup_fields[product_id] = (table, fields)
            rows, writes = candidate_rows, candidate_writes
        elif position < 3:
            raise ValueError("Budgets cannot retain the complete MOXIE trace and primary ATS/PS/RHS companions")
    db.execute("DELETE FROM moxie_samples WHERE run_id<>?", (run_id,))
    marks = ",".join("?" for _ in chosen)
    for table in MEDA_TABLES.values():
        db.execute(f"DELETE FROM {table} WHERE product_id NOT IN ({marks}) OR sclk_ms<? OR sclk_ms>?", (*chosen, start, stop))
    db.execute("DELETE FROM metric_rollups")
    for product_id, (table, fields) in rollup_fields.items():
        for field in fields:
            db.execute(f"INSERT INTO metric_rollups SELECT product_id,?,CAST(sclk_ms/60000 AS INTEGER)*60000,count(*),min({field}),max({field}),avg({field}) FROM {table} WHERE product_id=? AND {field} IS NOT NULL GROUP BY product_id,CAST(sclk_ms/60000 AS INTEGER)", (field, product_id))
    for product_id, instrument, sensor, original_count, warnings_json in db.execute(
            "SELECT id,instrument,sensor,sample_count,warnings_json FROM source_products").fetchall():
        if instrument == "meda":
            table = MEDA_TABLES[sensor.upper()]
            count, first, last = db.execute(f"SELECT count(*),min(sclk_ms),max(sclk_ms) FROM {table} WHERE product_id=?", (product_id,)).fetchone()
        else:
            count, first, last = db.execute("SELECT count(*),min(s.sclk_ms),max(s.sclk_ms) FROM moxie_samples s JOIN moxie_runs r ON r.id=s.run_id WHERE r.calibrated_product_id=? OR r.derived_product_id=?", (product_id, product_id)).fetchone()
        warnings = json.loads(warnings_json)
        warnings += [f"deployment_subset: stored_rows={count}; original_source_rows={original_count}",
                     "whole_archive_summaries_retained; raw_traces_outside_sol_816_not_deployed"]
        db.execute("UPDATE source_products SET sample_count=?,first_sclk_ms=?,last_sclk_ms=?,warnings_json=? WHERE id=?", (count, first, last, json.dumps(warnings), product_id))
    for rid, original_count, warnings_json in db.execute("SELECT id,sample_count,warnings_json FROM moxie_runs").fetchall():
        count = trace_count if rid == run_id else 0
        warnings = json.loads(warnings_json) + [f"deployment_subset: stored_rows={count}; original_source_rows={original_count}",
                                               "comparison_summaries_are_whole_archive_not_subset_integrals"]
        db.execute("UPDATE moxie_runs SET sample_count=?,warnings_json=? WHERE id=?", (count, json.dumps(warnings), rid))
    actual_rows = sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in EXPORT_TABLES)
    actual_writes = sum(db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] * write_weight(db, t) for t in EXPORT_TABLES)
    if actual_rows != rows or actual_writes != writes or rows > max_rows or writes > max_write_units:
        raise ValueError(f"Subset budget audit failed: rows={actual_rows}/{rows}, writes={actual_writes}/{writes}")
    return {"max_rows": max_rows, "max_import_write_units": max_write_units, "application_rows": rows,
            "estimated_import_write_units": writes, "source_run": run_id,
            "sclk_window_ms": [start, stop], "meda_products": chosen,
            "scope": "complete sol-816 MOXIE trace; selected matching MEDA windows; whole-archive comparison summaries"}


def export_sql(db, path):
    with path.open("w") as output:
        for table in EXPORT_TABLES:
            prefix = f'INSERT INTO "{table}" VALUES '
            statement = prefix
            rows = db.execute(f'SELECT * FROM "{table}"')
            for row in rows:
                quoted = ["NULL" if value is None else "'" + value.replace("'", "''") + "'"
                          if isinstance(value, str) else repr(value) for value in row]
                literal = "(" + ",".join(quoted) + ")"
                if len((statement + literal).encode()) > 90000:
                    output.write(statement + ";\n")
                    statement = prefix
                statement += ("," if statement != prefix else "") + literal
            if statement != prefix: output.write(statement + ";\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", default="nasa-v1")
    parser.add_argument("--output", type=Path, default=ROOT / "generated/telemetry")
    parser.add_argument("--max-rows", type=int, help="Bound deployment rows, including metadata and rollups")
    parser.add_argument("--max-write-units", type=int, help="Bound estimated import writes including indexes")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]{1,40}", args.release): raise ValueError("Invalid release ID")
    if (args.max_rows is None) != (args.max_write_units is None):
        raise ValueError("Supply both deployment row and write budgets")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest_path = DATA / "sources.json"
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest["sources"]:
        path = ROOT / entry["path"]
        if not entry["url"].startswith("https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/") or digest(path) != entry["sha256"]:
            raise ValueError(f"Unverified or altered NASA source: {path}")
    db_path = args.output / "telemetry.sqlite"
    if db_path.exists(): db_path.unlink()
    db = sqlite3.connect(db_path)
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript((ROOT / "migrations/0001_telemetry.sql").read_text())
    db.execute("INSERT INTO data_releases VALUES (?,?,?,?,?)", (
        args.release, VERSION, digest(manifest_path), "staging", "2026-11-14T00:00:00Z"))
    builder = Builder(db, manifest, args.release)
    labels = sorted((DATA / "meda/measurements/sol_0816").glob("*.xml"))
    for label in labels:
        if "_PS_" in label.name:
            meta = metadata(label)
            for row in meta["rows"]:
                if any(row.get(name) in ["999999999", "9999999999"] for name in ["PRESSURE", "BAROCAP3_PRESSURE"]):
                    builder.bad_pressure_times.add(milliseconds(row["SCLK"]))
    for label in labels: builder.meda(metadata(label))
    bundle = DATA / "moxie/moxie_bundle"
    for label in sorted((bundle / "data_calibrated").glob("*/*.xml")):
        companions = list((bundle / "data_derived" / label.parent.name).glob("*.xml"))
        builder.moxie(metadata(label), metadata(companions[0]) if companions else None, int(label.parent.name))
    builder.write_issues()
    preset = json.loads((ROOT / "lib/mission/demo-preset.json").read_text())
    preset["run_id"] = f"{args.release}-moxie-00816"
    db.execute("INSERT INTO scenario_presets VALUES (?,?,?,?,?)", (
        f"{args.release}-illustrative", "Illustrative assumptions, not NASA equipment or physiological limits",
        preset["model_version"], "assumed", json.dumps(preset)))
    if db.execute("PRAGMA foreign_key_check").fetchall(): raise ValueError("Broken source references")
    totals = db.execute("SELECT sum(oxygen_g), sum(archive_energy_wh), sum(active_seconds) FROM experiment_summaries").fetchone()
    if not math.isclose(totals[0], 122.27199526472222, abs_tol=1e-8) or totals[2] != 72799:
        raise ValueError(f"MOXIE audit did not reproduce: {totals}")
    subset = bound_release(db, args.max_rows, args.max_write_units) if args.max_rows is not None else None
    if db.execute("PRAGMA foreign_key_check").fetchall(): raise ValueError("Broken subset source references")
    if subset:
        db.execute("UPDATE data_releases SET processing_version=?", (VERSION + "-bounded",))
    db.commit()
    if subset:
        db.execute("VACUUM")  # Compact only this generated local release, never source or remote data.
    export_sql(db, args.output / "release-data.sql")
    # A partial import must remain invisible. Check every imported observation table atomically.
    conditions = [f"(SELECT count(*) FROM source_products WHERE release_id='{args.release}')=55"]
    for table in MEDA_TABLES.values():
        count = db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        conditions.append(f"(SELECT count(*) FROM {table} s JOIN source_products p ON p.id=s.product_id WHERE p.release_id='{args.release}')={count}")
    moxie_count = db.execute("SELECT count(*) FROM moxie_samples").fetchone()[0]
    conditions.append(f"(SELECT count(*) FROM moxie_samples s JOIN moxie_runs r ON r.id=s.run_id WHERE r.release_id='{args.release}')={moxie_count}")
    conditions.append(f"(SELECT count(*) FROM experiment_summaries s JOIN moxie_runs r ON r.id=s.run_id WHERE r.release_id='{args.release}')=23")
    (args.output / "publish.sql").write_text(f"UPDATE data_releases SET status='published' WHERE id='{args.release}' AND status='staging' AND " + " AND ".join(conditions) + ";\n")
    report = {"release": args.release, "processing_version": VERSION + ("-bounded" if subset else ""),
              "source_products": db.execute("SELECT count(*) FROM source_products").fetchone()[0],
              "moxie_rows": db.execute("SELECT count(*) FROM moxie_samples").fetchone()[0],
              "meda_rows": sum(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in MEDA_TABLES.values()),
              "oxygen_g": totals[0], "archive_energy_wh": totals[1], "active_seconds": totals[2],
              "database_bytes": db_path.stat().st_size,
              "sql_bytes": (args.output / "release-data.sql").stat().st_size,
              "sql_sha256": digest(args.output / "release-data.sql"), "deployment_subset": subset}
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    db.close()


if __name__ == "__main__":
    main()
