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
RELEASE = os.environ.get("ARES_TEST_RELEASE", "nasa-v1")
BOUNDED = os.environ.get("ARES_TEST_BOUNDED") == "1"
ROOT = Path(__file__).resolve().parents[2]


def request(path, body=None, token=None, method=None, expected=200, extra_headers=None):
    headers = {"Content-Type": "application/json", "User-Agent": "ARES-Backend-E2E/1.0", **(extra_headers or {})}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            status, value = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, value = error.code, json.loads(error.read())
    assert status in (expected if isinstance(expected, tuple) else (expected,)), (path, status, value)
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
    radiation = request("/api/telemetry/radiation")
    assert len(radiation["products"]) == 2 and len(radiation["observations"]) == 169, radiation["release_id"]
    assert "Gale crater" in radiation["proxy"]
    flagged = [row for row in radiation["observations"] if row["flag"]]
    assert len(flagged) == 9 and all(row["dose_rate_e_ugy_day"] is None for row in flagged)
    assert all(row["dose_rate_e_ugy_day"] is not None for row in radiation["observations"] if not row["flag"])
    window = request("/api/telemetry/radiation?from_ms=1686064756000&to_ms=1686077188000")["observations"]
    assert 11 <= len(window) <= 13 and all(1686064756000 <= row["utc_ms"] < 1686077188000 for row in window)
    request("/api/telemetry/radiation?from_ms=2&to_ms=1", expected=400)
    rad_quality = request("/api/telemetry/products/" + radiation["products"][0]["id"] + "/quality")
    assert {issue["code"] for issue in rad_quality["issues"]} >= {"flagged_cmds"}
    page = request(f"/api/telemetry/moxie/runs/{RELEASE}-moxie-00901/samples?after_row=7517&limit=3")
    if BOUNDED:
        assert page["samples"] == [] and page["run"]["sample_count"] == 0
    else:
        assert [row["segment_id"] for row in page["samples"]] == [0, 1, 1]
    weather = request("/api/telemetry/environment?sensor=ats&limit=3")
    assert len(weather["samples"]) == 3
    for sensor in ["ps", "rhs", "tirs", "rds", "eng", "ancillary"]:
        sample_page = request("/api/telemetry/environment?sensor=" + sensor + "&limit=3")
        assert len(sample_page["samples"]) == (3 if sample_page["product"]["sample_count"] else 0), sensor
    quality = request("/api/telemetry/products/" + weather["product"]["id"] + "/quality")
    assert quality["fields"] and "source_field" in quality["fields"][0]
    bucket = weather["product"]["first_sclk_ms"] // 60000 * 60000
    rollups = request("/api/telemetry/environment?sensor=ats&fields=ats_local_temp1&resolution=60s&from_ms=" + str(bucket))
    assert rollups["samples"] and rollups["samples"][0]["count"] > 0
    request("/api/telemetry/environment?sensor=ats&fields=not_a_field", expected=400)
    request("/api/missions", {"config": {}}, expected=401)
    preset = json.loads((ROOT / "lib/mission/demo-preset.json").read_text())
    preset["run_id"] = f"{RELEASE}-moxie-00816"
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
        # Radiation follows the replay by UTC: the latest RAD observation started at or before it.
        aligned = state["observed"]["radiation"]
        assert aligned["status"] in ("observation_available", "observation_flagged"), aligned
        assert aligned["mission_utc_ms"] == state["observed"]["moxie"]["utc_ms"]
        assert 0 <= aligned["mission_utc_ms"] - aligned["observation"]["utc_ms"] <= 1800000
        assert aligned["observation"]["utc_ms"] != initial["observed"]["radiation"]["observation"]["utc_ms"]
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
        assert explanation["context"]["radiation"]["proxy"] == radiation["proxy"]
        # Locally AI is unconfigured. With ARES_TEST_AI=any (production), accept a grounded answer
        # or a sanitized provider failure; AI must never change mission state.
        any_ai = os.environ.get("ARES_TEST_AI") == "any"
        ai = request(path + "/diagnostics", {"mode": "ai", "question": "Why did output change?"}, token,
                     expected=(200, 503) if any_ai else 503,
                     extra_headers={"X-Diagnostics-Authorization": "Bearer " + KEY})
        if "error" in ai:
            allowed = {"ai_not_configured", "ai_unavailable"} if any_ai else {"ai_not_configured"}
            assert ai["error"]["code"] in allowed, ai
        else:
            assert ai["mode"] == "ai_explanation" and ai["evidence"] and "Unverified" in ai["warning"], ai
            print(json.dumps({"ai": "answered", "model": ai["model"], "tools": [e["tool"] for e in ai["evidence"]]}))
        assert request(path, token=token)["revision"] == revision
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
        older_retry = request(path + "/commands", body, token)
        assert older_retry["idempotent_replay"] and older_retry["revision"] > older_retry["applied_revision"]
        other_config = {**preset, "run_id": f"{RELEASE}-moxie-00096", "duration_s": 100,
                        "schedule": [{"start_s": 0, "end_s": 100, "activity": "base"}]}
        if BOUNDED:
            request("/api/missions", {"config": other_config}, KEY, expected=422)
        else:
            other = request("/api/missions", {"config": other_config}, KEY, expected=201)
            other_path = "/api/missions/" + other["id"]
            try:
                other_state = request(other_path, token=other["token"])
                assert other_state["observed"]["environment"]["status"] == "unavailable"
                assert other_state["observed"]["moxie"]["utc_ms"] is None
                assert other_state["observed"]["radiation"]["status"] == "time_unresolved"
            finally:
                request(other_path, token=other["token"], method="DELETE")
        print(json.dumps({"status": "passed", "products": len(products), "experiments": len(comparison),
                          "checks": "provenance, seven MEDA sensors, RAD radiation release and UTC alignment, quality metadata, rollups, missing output, reset segment, capabilities, replay, seek, clock, scenarios, historical retries, stale revisions, concurrent commands, return uncertainty, deterministic diagnostics, missing AI credentials"}))
    finally:
        request(path, token=token, method="DELETE")


if __name__ == "__main__":
    main()
