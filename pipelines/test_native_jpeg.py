import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "native_check", Path(__file__).with_name("check-viking-native.py")
)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class JpegDimensions(unittest.TestCase):
    def test_reads_sof_dimensions_after_metadata(self):
        data = bytes.fromhex("ffd8 ffe0 0004 0000 ffc0 000b 08 0400 0400 01 011100 ffd9")
        self.assertEqual(checker.jpeg_size(data), (1024, 1024))

    def test_rejects_other_formats(self):
        with self.assertRaises(ValueError):
            checker.jpeg_size(b"not a jpeg")

    def test_rejects_truncated_header(self):
        with self.assertRaises((ValueError, IndexError, checker.struct.error)):
            checker.jpeg_size(bytes.fromhex("ffd8 ffe0 0020"))

    def test_rejects_truncated_marker(self):
        with self.assertRaises(ValueError):
            checker.jpeg_size(bytes.fromhex("ffd8 ff"))


if __name__ == "__main__":
    unittest.main()
