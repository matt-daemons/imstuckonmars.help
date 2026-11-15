"""Check published objects against the immutable release manifest, including CORS."""

import concurrent.futures
import hashlib
import json
import time
import urllib.error
import urllib.request


root = "https://tiles.imstuckonmars.help/mars-v2"
request = urllib.request.Request(root + "/release.json", headers={"User-Agent": "ARES map verifier"})
with urllib.request.urlopen(request, timeout=30) as response:
    release = json.load(response)


def verify(entry):
    request = urllib.request.Request(
        root + "/" + entry["path"],
        headers={"Origin": "https://imstuckonmars.help", "User-Agent": "ARES map verifier"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                digest = hashlib.sha256()
                length = 0
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
                    length += len(chunk)
                if length != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
                    raise RuntimeError("Remote object differs: " + entry["path"])
                if response.headers.get("Access-Control-Allow-Origin") not in {
                    "*", "https://imstuckonmars.help"
                }:
                    raise RuntimeError("CORS missing: " + entry["path"])
                if "immutable" not in response.headers.get("Cache-Control", ""):
                    raise RuntimeError("Immutable cache policy missing: " + entry["path"])
            return
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    for index, _ in enumerate(executor.map(verify, release["objects"]), 1):
        if index % 250 == 0:
            print(f"Verified {index}/{len(release['objects'])}", flush=True)
print(f"Verified {len(release['objects'])} published objects byte-for-byte, CORS and cache headers.")
