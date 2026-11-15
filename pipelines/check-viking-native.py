"""Validate the complete native-color tile pyramid without loading source pixels."""

import hashlib
import json
from pathlib import Path
import struct


def jpeg_size(data):
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("Not a JPEG")
    index = 2
    while index < len(data):
        if data[index] != 255:
            raise ValueError("Invalid JPEG marker")
        while index < len(data) and data[index] == 255:
            index += 1
        if index >= len(data):
            raise ValueError("Truncated JPEG marker")
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack_from(">H", data, index)[0]
        if length < 2 or index + length > len(data):
            raise ValueError("Invalid JPEG segment")
        if marker in {0xC0, 0xC1, 0xC2}:
            height, width = struct.unpack_from(">HH", data, index + 3)
            return width, height
        index += length
    raise ValueError("JPEG dimensions missing")


def verify():
    config = json.loads(Path("pipelines/viking-native-release.json").read_text())
    root = Path(config["directory"])
    manifest = json.loads((root / "catalog.json").read_text())
    assets = {asset["path"]: asset for asset in manifest["assets"]}
    expected_count = (4 ** (config["maxZoom"] + 1) - 1) // 3
    if len(assets) != expected_count:
        raise RuntimeError("Incomplete or duplicated native-color pyramid")
    total_bytes = 0
    for zoom in range(config["maxZoom"] + 1):
        for x in range(2 ** zoom):
            for y in range(2 ** zoom):
                path = f"tiles/{zoom}/{x}/{y}.jpg"
                asset = assets[path]
                data = (root / path).read_bytes()
                if len(data) != asset["bytes"]:
                    raise RuntimeError("Size mismatch: " + path)
                if hashlib.sha256(data).hexdigest() != asset["sha256"]:
                    raise RuntimeError("Hash mismatch: " + path)
                if jpeg_size(data) != (config["tileSize"], config["tileSize"]):
                    raise RuntimeError("Dimensions mismatch: " + path)
                total_bytes += len(data)
    if total_bytes > config["outputLimitBytes"]:
        raise RuntimeError("Output exceeds approved budget")
    print(f"Verified {len(assets)} tiles, {total_bytes} bytes, dimensions and SHA-256")


if __name__ == "__main__":
    verify()
