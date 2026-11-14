"""Scientific regression checks against the real, locally generated NASA release.

Run after prepare.py: python3 -m unittest discover -s scripts/telemetry -p 'test_*.py'
"""

import json
import shutil
import sqlite3
import tempfile
import unittest

from acquire import DATA, ROOT, digest
from prepare import MEDA_TABLES, metadata, milliseconds

OUTPUT = ROOT / "generated/telemetry"


class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(f"file:{OUTPUT / 'telemetry.sqlite'}?mode=ro", uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_immutable_source_hashes_and_export(self):
        sources = json.loads((DATA / "sources.json").read_text())["sources"]
        self.assertEqual(len(sources), 132)
        for source in sources:
            self.assertEqual(digest(ROOT / source["path"]), source["sha256"])
            self.assertTrue(source["url"].startswith("https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/"))
        report = json.loads((OUTPUT / "report.json").read_text())
        self.assertEqual(digest(OUTPUT / "release-data.sql"), report["sql_sha256"])
        with (OUTPUT / "release-data.sql").open("rb") as stream:
            for statement in stream:
                self.assertLessEqual(len(statement), 90003)  # comma and terminating semicolon/newline

    def test_integrity_and_all_product_counts(self):
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("SELECT count(*) FROM source_products").fetchone()[0], 55)
        for sensor, table in MEDA_TABLES.items():
            counts = self.db.execute(f"SELECT p.sample_count,count(s.source_row) FROM source_products p LEFT JOIN {table} s ON s.product_id=p.id WHERE p.sensor=? AND p.instrument='meda' GROUP BY p.id", (sensor.lower(),)).fetchall()
            self.assertTrue(counts)
            self.assertTrue(all(a == b for a, b in counts), counts)
        self.assertEqual(sum(self.db.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in MEDA_TABLES.values()), 459920)

    def test_moxie_inclusive_archive_totals(self):
        total = self.db.execute("SELECT sum(oxygen_g),sum(archive_energy_wh),sum(active_seconds),max(max_energy_residual_wh),max(max_power_residual_w) FROM experiment_summaries").fetchone()
        self.assertAlmostEqual(total[0], 122.27199526472222, places=9)
        self.assertAlmostEqual(total[1], 11348.795281, places=6)
        self.assertEqual(total[2], 72799)
        self.assertLess(total[3], 0.105)
        self.assertLess(total[4], 0.00501)
        self.assertEqual(self.db.execute("SELECT count(*) FROM moxie_samples").fetchone()[0], 235992)

    def test_unresolved_times_and_counter_reset_are_not_fabricated(self):
        self.assertEqual(self.db.execute("SELECT source_row,segment_id,elapsed_ms,oxygen_rate_g_h,sclk_ms,utc_ms FROM moxie_samples WHERE run_id='nasa-v1-moxie-00901' AND source_row IN (7518,7519)").fetchall(),
                         [(7518, 0, 7517000, None, None, None), (7519, 1, 0, None, None, None)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM moxie_samples WHERE run_id='nasa-v1-moxie-00096' AND (sclk_ms IS NOT NULL OR utc_ms IS NOT NULL)").fetchone()[0], 0)
        self.assertIsNone(self.db.execute("SELECT oxygen_g FROM experiment_summaries WHERE run_id='nasa-v1-moxie-00901'").fetchone()[0])

    def test_meda_fill_values_and_coincident_humidity_artifacts(self):
        label = next((DATA / "meda/measurements/sol_0816").glob("*DER_PS_*.xml"))
        meta = metadata(label)
        times = [milliseconds(row["SCLK"]) for row in meta["rows"] if row["PRESSURE"] == "999999999"]
        self.assertEqual(len(times), 2)
        for time in times:
            self.assertIsNone(self.db.execute("SELECT s.pressure FROM meda_ps_samples s JOIN source_products p ON p.id=s.product_id WHERE p.processing_level='derived' AND s.sclk_ms=?", (time,)).fetchone()[0])
            self.assertIsNone(self.db.execute("SELECT s.local_relative_humidity FROM meda_rhs_samples s JOIN source_products p ON p.id=s.product_id WHERE p.processing_level='derived' AND s.sclk_ms=?", (time,)).fetchone()[0])
        self.assertEqual(self.db.execute("SELECT count(*) FROM meda_tirs_samples WHERE downward_lw_irradiance IS NOT NULL OR air_temp IS NOT NULL").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM meda_ancillary_samples WHERE masthead_azimuth IS NOT NULL OR masthead_elevation IS NOT NULL").fetchone()[0], 0)

    def test_labels_units_and_schema_exceptions_are_exposed(self):
        self.assertEqual(self.db.execute("SELECT DISTINCT unit FROM field_definitions WHERE field='volume_mixing_ratio'").fetchall(), [("ppm",)])
        self.assertEqual(self.db.execute("SELECT unit FROM field_definitions WHERE field='pressure_uncertainty'").fetchall(), [(None,)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM field_definitions WHERE field='humidity_local_temp_uncertainty'").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM field_definitions WHERE field='upward_lw_irradiance_uncertainty'").fetchone()[0], 2)

    def test_partial_import_cannot_be_published(self):
        with tempfile.TemporaryDirectory(prefix="release-test-", dir=ROOT / ".cache/telemetry") as directory:
            clone = ROOT / directory / "test.sqlite"
            shutil.copyfile(OUTPUT / "telemetry.sqlite", clone)
            db = sqlite3.connect(clone)
            try:
                publish = (OUTPUT / "publish.sql").read_text()
                db.executescript(publish)
                self.assertEqual(db.execute("SELECT status FROM data_releases").fetchone()[0], "published")
                db.execute("UPDATE data_releases SET status='staging'")
                db.execute("DELETE FROM moxie_samples WHERE run_id='nasa-v1-moxie-00816' AND source_row=1")
                db.commit()
                db.executescript(publish)
                self.assertEqual(db.execute("SELECT status FROM data_releases").fetchone()[0], "staging")
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
