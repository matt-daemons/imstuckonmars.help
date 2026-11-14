"""Exercise the real packaged Worker and its populated local D1 over HTTP.

Run with MISSION_WRITE_KEY set and the preview listening on localhost:8787.
Only disposable missions created by this test are deleted.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("ARES_TEST_URL", "http://localhost:8787")
KEY = os.environ["MISSION_WRITE_KEY"]
ROOT = Path(__file__).resolve().parents[2]


def request(path, body=None, token=None, method=None, expected=200, extra_headers=None):
    headers = {"Content-Type": "application/json", **(extra_headers or {})}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            status, value = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, value = error.code, json.loads(error.read())
    assert status == expected, (path, status, value)
    return value


def main():
    request("/api/health")
    products = request("/api/telemetry/products")["products"]
    assert len(products) == 55
    comparison = request("/api/telemetry/moxie/comparison")["experiments"]
    assert len(comparison) == 23
    assert abs(sum(row["oxygen_g"] or 0 for row in comparison) - 122.27199526472222) < 1e-8
    missing = next(row for row in comparison if row["directory_sol"] == 901)
    assert missing["oxygen_g"] is None
    page = request("/api/telemetry/moxie/runs/nasa-v1-moxie-00901/samples?after_row=7517&limit=3")
    assert [row["segment_id"] for row in page["samples"]] == [0, 1, 1]
    weather = request("/api/telemetry/environment?sensor=ats&limit=3")
    assert len(weather["samples"]) == 3
    request("/api/telemetry/environment?sensor=ats&fields=not_a_field", expected=400)
    request("/api/missions", {"config": {}}, expected=401)
    preset = json.loads((ROOT / "lib/mission/demo-preset.json").read_text())
    created = request("/api/missions", {"config": preset}, KEY, expected=201)
    path, token = "/api/missions/" + created["id"], created["token"]
    revision = 0

    def command(kind, **args):
        nonlocal revision
        body = {"type": kind, "expected_revision": revision, "command_id": str(uuid.uuid4()), **args}
        result = request(path + "/commands", body, token)
        revision = result["revision"]
        return body, result

    try:
        request(path, expected=401)
        initial = request(path, token=token)
        assert initial["state"]["elapsed_s"] == 0
        assert initial["observed"]["environment"]["status"] != "unavailable"
        _, state = command("seek", at_s=1800)
        saved = state["state"]
        body, _ = command("pause")
        retry = request(path + "/commands", body, token)
        assert retry["idempotent_replay"] and retry["revision"] == revision
        request(path + "/commands", {**body, "type": "reset"}, token, expected=409)
        request(path + "/commands", {"type": "pause", "expected_revision": 0, "command_id": "stale"}, token, expected=409)
        _, state = command("seek", at_s=0)
        assert state["state"]["oxygen"]["base"]["produced_g"] == 0
        _, state = command("seek", at_s=1800)
        assert state["state"] == saved
        command("reset")
        command("speed", speed=10)
        command("play")
        time.sleep(0.15)
        _, paused = command("pause")
        assert paused["state"]["elapsed_s"] > 1
        frozen = request(path, token=token)["state"]
        assert frozen == request(path, token=token)["state"]
        explanation = request(path + "/diagnostics", {"mode": "deterministic"}, token)
        assert explanation["mode"] == "deterministic" and explanation["revision"] == revision
        unavailable = request(path + "/diagnostics", {"mode": "ai", "question": "Why did output change?"}, token,
                              expected=503, extra_headers={"X-Diagnostics-Authorization": "Bearer " + KEY})
        assert unavailable["error"]["code"] == "ai_not_configured"
        command("reset")
        command("event", event={"id": "future-failure", "type": "battery_failure", "target": "eva", "value": 0, "at_s": 1})
        route = {"id": "external-planner", "revision": "r1", "mission_revision": revision,
                 "base_id": preset["base"]["id"], "evaluated_at_s": 0, "status": "ok",
                 "legs": [{"activity": "return", "duration_s": 100}], "warnings": []}
        assessed = request(path + "/assess-return", {"route": route, "at_s": 0}, token)
        assert assessed["status"] == "unknown", assessed
        assert "future_scenario_events_not_projected" in assessed["reasons"]
        _, failed = command("seek", at_s=2)
        assert failed["state"]["battery"]["eva"]["remaining_wh"] == 0
        command("reset")
        candidates = [{"type": "seek", "at_s": 5, "expected_revision": revision, "command_id": str(uuid.uuid4())},
                      {"type": "seek", "at_s": 6, "expected_revision": revision, "command_id": str(uuid.uuid4())}]

        def race(body):
            try:
                return request(path + "/commands", body, token)
            except AssertionError as error:
                assert error.args[0][1] == 409, error
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(race, candidates))
        assert sum(result is not None for result in results) == 1
        other_config = {**preset, "run_id": "nasa-v1-moxie-00096", "duration_s": 100,
                        "schedule": [{"start_s": 0, "end_s": 100, "activity": "base"}]}
        other = request("/api/missions", {"config": other_config}, KEY, expected=201)
        other_path = "/api/missions/" + other["id"]
        try:
            other_state = request(other_path, token=other["token"])
            assert other_state["observed"]["environment"]["status"] == "unavailable"
            assert other_state["observed"]["moxie"]["utc_ms"] is None
        finally:
            request(other_path, token=other["token"], method="DELETE")
        print(json.dumps({"status": "passed", "products": len(products), "experiments": len(comparison),
                          "checks": "provenance, MEDA replay, missing output, reset segment, capabilities, replay, seek, clock, scenarios, stale revisions, concurrent commands, return uncertainty, deterministic diagnostics, missing AI credentials"}))
    finally:
        request(path, token=token, method="DELETE")


if __name__ == "__main__":
    main()
