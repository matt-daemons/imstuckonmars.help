"""Publish an immutable release using the same R2 REST operation as Wrangler.

Uses a loopback Wrangler binding bridge, or Cloudflare credentials kept out of logs.
"""

import concurrent.futures
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import time
import threading
import tomllib
import urllib.error
import urllib.parse
import urllib.request


config = json.loads(Path("pipelines/map-release.json").read_text())
root = Path(config["directory"])
account = config["accountId"]
bucket = config["bucket"]
version = config["version"]
token = os.environ.get("CLOUDFLARE_API_TOKEN")
local_uploader = os.environ.get("R2_LOCAL_UPLOADER")
if local_uploader and local_uploader != "http://127.0.0.1:5294":
    raise SystemExit("Uploader must be the documented loopback endpoint")
if not token and not local_uploader:
    auth = Path.home() / ".config/.wrangler/config/default.toml"
    token = tomllib.loads(auth.read_text())["oauth_token"]
if not (root / "catalog.json").is_file():
    raise SystemExit("Release catalog missing. Run maps:prepare first.")
catalog = json.loads((root / "catalog.json").read_text())
if catalog["sourceBytes"] > config["sourceDownloadLimitBytes"]:
    raise SystemExit("Approved source download budget exceeded.")

files = sorted(
    path
    for path in root.rglob("*")
    if path.is_file()
    and path.name not in {"release.json", "upload-inventory.json"}
    and path.suffix in {".png", ".jpg", ".json", ".tif", ".img", ".lbl", ".md5"}
)
manifest = []
for path in files:
    data = path.read_bytes()
    manifest.append({
        "path": path.relative_to(root).as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
if not files:
    raise SystemExit("No release files. Run maps:prepare first.")

rate_lock = threading.Lock()
last_request = 0.0


def rate_limit():
    global last_request
    with rate_lock:
        remaining = (0.02 if local_uploader else 1.0) - (time.monotonic() - last_request)
        if remaining > 0:
            time.sleep(remaining)
        last_request = time.monotonic()


def publish(entry):
    key = version + "/" + entry["path"]
    url = (
        "https://api.cloudflare.com/client/v4/accounts/" + account
        + "/r2/buckets/" + bucket + "/objects/"
        + urllib.parse.quote(key, safe="/")
    )
    if local_uploader:
        url = local_uploader + "/" + key
    data = (root / entry["path"]).read_bytes()
    content_type = mimetypes.guess_type(entry["path"])[0] or "application/octet-stream"
    if entry["path"].endswith((".lbl", ".md5")):
        content_type = "text/plain; charset=utf-8"
    for attempt in range(4):
        rate_limit()
        headers = {
            "Content-Type": content_type,
            "Cache-Control": "public, max-age=31536000, immutable",
    "User-Agent": "ARES offline map release",
        }
        if token and not local_uploader:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(url, data=data, method="PUT", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status not in (200, 201):
                    raise RuntimeError("Unexpected upload status")
            return entry
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise RuntimeError("Upload failed for " + key) from None
            time.sleep(2 ** attempt)


# A release prefix is write-once. Re-running is allowed only with identical bytes.
release_path = root / "release.json"
release = {
    "version": version,
    "objectCount": len(manifest),
    "totalBytes": sum(entry["bytes"] for entry in manifest),
    "objects": manifest,
}
inventory_path = root / "upload-inventory.json"
if inventory_path.exists() and json.loads(inventory_path.read_text()) != release:
    raise SystemExit("Upload inventory changed. Choose a new version before publishing.")
inventory_path.write_text(json.dumps(release, indent=2) + "\n")
existing_url = config["publicOrigin"] + "/" + version + "/release.json"
try:
    request = urllib.request.Request(existing_url, headers={"User-Agent": "ARES map publisher"})
    with urllib.request.urlopen(request, timeout=20) as response:
        existing = json.load(response)
    if existing != release:
        raise SystemExit("Release already exists with different bytes. Choose a new version.")
    print("Identical release already published; no objects overwritten.")
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for _ in executor.map(publish, manifest):
            completed += 1
            if completed % 100 == 0:
                print(f"Uploaded {completed}/{len(manifest)} objects", flush=True)
    release_path.write_text(json.dumps(release, indent=2) + "\n")
    data = release_path.read_bytes()
    publish({
        "path": "release.json",
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
    print(f"Published {len(manifest)} objects, {release['totalBytes']} bytes")
