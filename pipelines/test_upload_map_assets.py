"""Exercise the real publisher without writing to remote storage."""

import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error


SCRIPT = Path(__file__).with_name("upload-map-assets.py")


class Response:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class SiteUpload(unittest.TestCase):
    def test_publishes_webp_geojson_and_slope_with_correct_types(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "catalog.json").write_text(json.dumps({"sourceBytes": 10}))
            (root / "sites.geojson").write_text('{"type":"FeatureCollection","features":[]}')
            (root / "image.webp").write_bytes(b"webp fixture")
            (root / "terrain.png").write_bytes(b"png fixture")
            (root / "slope.tif").write_bytes(b"tiff fixture")
            with (root / "large.tif").open("wb") as large:
                large.truncate(40_000_001)
            (root / "._image.webp").write_bytes(b"mac metadata")
            config = root / "config.txt"
            config.write_text(json.dumps({
                "directory": str(root), "accountId": "test", "bucket": "test",
                "version": "sites-v1", "publicOrigin": "https://example.test",
                "sourceDownloadLimitBytes": 100, "uploadIntervalSeconds": 0,
            }))
            uploads = {}

            def request(req, timeout):
                if req.get_method() == "GET":
                    raise urllib.error.HTTPError(req.full_url, 404, "Not found", {}, None)
                uploads[req.full_url.rsplit("/", 1)[-1]] = req
                return Response()

            with patch.dict(os.environ, {
                "MAP_RELEASE_CONFIG": str(config),
                "R2_LOCAL_UPLOADER": "http://127.0.0.1:5294",
            }), patch("urllib.request.urlopen", side_effect=request), patch(
                "subprocess.run", return_value=SimpleNamespace(returncode=0)
            ) as direct, contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(SCRIPT), run_name="__main__")

            self.assertIn("image.webp", uploads)
            self.assertNotIn("._image.webp", uploads)
            self.assertEqual(uploads["sites.geojson"].get_header("Content-type"), "application/geo+json")
            self.assertEqual(uploads["image.webp"].get_header("Content-type"), "image/webp")
            self.assertEqual(uploads["slope.tif"].get_header("Content-type"), "image/tiff")
            self.assertEqual(json.loads(uploads["release.json"].data)["objectCount"], 6)
            direct.assert_called_once()
            self.assertIn("test/sites-v1/large.tif", direct.call_args.args[0])
            self.assertIn("--remote", direct.call_args.args[0])
            self.assertNotIn("large.tif", uploads)


if __name__ == "__main__":
    unittest.main()
