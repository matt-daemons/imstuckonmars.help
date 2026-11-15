"""Scientific regression checks against the real, locally generated RAD companion release.

Run after prepare_rad.py with the pinned offline environment:
.cache/telemetry-venv/bin/python -m unittest discover -s scripts/telemetry -p 'test_prepare_rad.py'
"""

import json
import shutil
import sqlite3
import tempfile
import unittest

from acquire import ROOT, digest
from acquire_rad import MANIFEST, SPDF

OUTPUT = ROOT / "generated/radiation"
DOSES = ["dose_rate_b_ugy_day", "dose_rate_b_rtg_corrected_ugy_day", "dose_rate_e_ugy_day"]


class RadiationReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(f"file:{OUTPUT / 'radiation.sqlite'}?mode=ro", uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_sources_are_pinned_and_unaltered(self):
        sources = json.loads(MANIFEST.read_text())["sources"]
        self.assertEqual([s["logical_file_id"] + "_v" + s["data_version"] for s in sources],
                         ["msl_rad_obs-l2_2023157_v05", "msl_rad_obs-l2_2023158_v06"])
        for source in sources:
            self.assertTrue(source["url"].startswith(SPDF))
            self.assertEqual(digest(ROOT / source["path"]), source["sha256"])
        report = json.loads((OUTPUT / "report.json").read_text())
        self.assertEqual(digest(OUTPUT / "release-data.sql"), report["sql_sha256"])

    def test_counts_integrity_and_native_types(self):
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("SELECT sol,sample_count FROM source_products ORDER BY sol").fetchall(),
                         [(3850, 85), (3851, 84)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM rad_observations").fetchone()[0], 169)
        # numpy scalars would silently become BLOBs in SQLite.
        self.assertEqual(self.db.execute("SELECT DISTINCT typeof(utc_ms) FROM rad_observations").fetchall(), [("integer",)])
        self.assertEqual(self.db.execute("SELECT DISTINCT typeof(dose_rate_e_ugy_day) FROM rad_observations ORDER BY 1").fetchall(),
                         [("null",), ("real",)])

    def test_epochs_are_utc_observation_starts_covering_the_sol_816_moxie_run(self):
        first = self.db.execute("SELECT min(utc_ms),max(utc_ms) FROM rad_observations").fetchone()
        self.assertEqual(first, (1686010583000, 1686181439000))  # 2023-06-06T00:16:23Z, 2023-06-07T23:43:59Z
        moxie_start, moxie_stop = 1686064756000, 1686077188000  # MOXIE label 15:19:16Z to 18:43:08Z
        covering = self.db.execute("SELECT count(*) FROM rad_observations WHERE utc_ms BETWEEN ? AND ?",
                                   (moxie_start - 1800000, moxie_stop)).fetchone()[0]
        self.assertGreaterEqual(covering, 12)

    def test_flagged_and_invalid_values_are_masked_not_zeroed(self):
        self.assertEqual(self.db.execute("SELECT flag,count(*) FROM rad_observations WHERE flag IS NOT NULL GROUP BY flag ORDER BY flag").fetchall(),
                         [("Cmds", 6), ("DAN", 3)])
        for dose in DOSES:
            self.assertEqual(self.db.execute(f"SELECT count(*) FROM rad_observations WHERE flag IS NOT NULL AND {dose} IS NOT NULL").fetchone()[0], 0)
            self.assertEqual(self.db.execute(f"SELECT count(*) FROM rad_observations WHERE flag IS NULL AND {dose} IS NULL").fetchone()[0], 0)
            self.assertEqual(self.db.execute(f"SELECT count(*) FROM rad_observations WHERE {dose} <= 0").fetchone()[0], 0)
        # The 2023-06-06T04:32:32Z commanding observation has a negative source value (-28.6).
        self.assertEqual(self.db.execute("SELECT code FROM quality_issues WHERE field='dose_rate_b_rtg_corrected_ugy_day' AND start_row=16 ORDER BY code").fetchall(),
                         [("fill_or_outside_valid_range",), ("flagged_cmds",)])

    def test_usable_dose_rates_match_the_archive(self):
        stats = self.db.execute("SELECT count(dose_rate_b_ugy_day),round(min(dose_rate_b_ugy_day),2),round(max(dose_rate_b_ugy_day),2),"
                                "round(avg(dose_rate_b_rtg_corrected_ugy_day),2),round(avg(dose_rate_e_ugy_day),2) FROM rad_observations").fetchone()
        self.assertEqual(stats, (160, 180.47, 218.65, 136.19, 193.8))
        self.assertEqual(self.db.execute("SELECT DISTINCT unit FROM field_definitions WHERE field LIKE 'dose_rate_%'").fetchall(), [("uGy/day",)])
        warnings = self.db.execute("SELECT warnings_json FROM source_products LIMIT 1").fetchone()[0]
        self.assertIn("gale_crater", warnings)
        self.assertIn("not_dose_equivalent_or_crew_exposure", warnings)

    def test_partial_import_cannot_be_published(self):
        publish = (OUTPUT / "publish.sql").read_text()
        with tempfile.TemporaryDirectory(prefix="rad-release-test-", dir=ROOT / ".cache") as directory:
            for partial, expected in [(True, "staging"), (False, "published")]:
                clone = ROOT / directory / f"partial-{partial}.sqlite"
                shutil.copyfile(OUTPUT / "radiation.sqlite", clone)
                db = sqlite3.connect(clone)
                try:
                    if partial:
                        db.execute("DELETE FROM rad_observations WHERE source_row=1 AND "
                                   "product_id=(SELECT min(product_id) FROM rad_observations)")
                        db.commit()
                    db.executescript(publish)
                    self.assertEqual(db.execute("SELECT status FROM data_releases").fetchone()[0], expected)
                finally:
                    db.close()


if __name__ == "__main__":
    unittest.main()
