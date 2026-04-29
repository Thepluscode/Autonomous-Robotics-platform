"""Integration tests against the live FastAPI app.

Only covers endpoints that actually exist in backend/server.py. Run with:

    BACKEND_URL=http://localhost:8001 pytest tests/

Tests are auto-skipped if the backend isn't reachable.
"""
from __future__ import annotations

import pytest


# --------------------------- Health / root ------------------------------------

def test_root_returns_version(api):
    r = api.get("/")
    assert r.status_code == 200
    body = r.json()
    assert "Autonomous Ecosystem Architect" in body.get("message", "")
    assert body.get("version")


def test_seed_populates_data(api, auth_headers):
    r = api.post("/seed", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body.get("zones", 0) > 0
    assert body.get("drones", 0) > 0


def test_seed_rejects_unauthenticated(api):
    r = api.post("/seed")
    assert r.status_code == 401


# --------------------------- Auth ---------------------------------------------

def test_admin_login_returns_tokens(api):
    r = api.post(
        "/auth/login",
        json={"email": "admin@ecosystem.com", "password": "EcoAdmin2024!"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["role"] == "admin"


def test_register_then_me(api, unique_name):
    email = f"{unique_name}@example.com"
    r = api.post(
        "/auth/register",
        json={"email": email, "password": "Hunter2!", "name": "Test User", "role": "viewer"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    me = api.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == email
    # Server downgrades non-admin/non-field_operator on register.
    assert me.json()["role"] in {"viewer", "scientist"}


def test_register_admin_role_is_downgraded(api, unique_name):
    """The server silently rewrites privileged role requests to 'viewer'."""
    email = f"{unique_name}-priv@example.com"
    r = api.post(
        "/auth/register",
        json={"email": email, "password": "Hunter2!", "name": "Sneaky", "role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "viewer"


def test_me_requires_auth(base_url):
    """Use a fresh client — login on the shared session sets a cookie that would
    silently authenticate this call and hide the 401 path."""
    import requests

    r = requests.get(f"{base_url}/api/auth/me", timeout=5)
    assert r.status_code == 401


# --------------------------- Dashboard ----------------------------------------

def test_dashboard_stats(api, seeded):
    r = api.get("/dashboard/stats")
    assert r.status_code == 200
    stats = r.json()
    for key in (
        "total_drones",
        "active_drones",
        "total_zones",
        "total_sensors",
        "unread_alerts",
        "avg_biodiversity",
        "avg_soil_health",
    ):
        assert key in stats, f"missing dashboard stat: {key}"


def test_dashboard_trends(api, seeded):
    r = api.get("/dashboard/trends")
    assert r.status_code == 200
    body = r.json()
    assert "biodiversity" in body and isinstance(body["biodiversity"], list)
    assert "soil_health" in body and isinstance(body["soil_health"], list)


# --------------------------- Drones -------------------------------------------

def test_drones_full_crud(api, unique_name):
    payload = {
        "name": unique_name,
        "latitude": 40.7128,
        "longitude": -74.0060,
        "altitude": 100.0,
        "status": "idle",
    }
    created = api.post("/drones", json=payload)
    assert created.status_code == 200, created.text
    drone = created.json()
    drone_id = drone["id"]
    assert drone["name"] == unique_name

    listed = api.get("/drones")
    assert listed.status_code == 200
    assert any(d["id"] == drone_id for d in listed.json())

    fetched = api.get(f"/drones/{drone_id}")
    assert fetched.status_code == 200

    updated = api.put(f"/drones/{drone_id}", json={"status": "deployed", "battery": 85})
    assert updated.status_code == 200
    assert updated.json()["status"] == "deployed"

    deleted = api.delete(f"/drones/{drone_id}")
    assert deleted.status_code == 200

    missing = api.get(f"/drones/{drone_id}")
    assert missing.status_code == 404


def test_drone_deploy_requires_existing_zone_and_drone(api, seeded, unique_name):
    drones = api.get("/drones").json()
    zones = api.get("/zones").json()
    assert drones and zones, "seed should provide drones and zones"

    deploy = api.post(
        "/drones/deploy",
        json={
            "drone_ids": [drones[0]["id"]],
            "zone_id": zones[0]["id"],
            "mission_type": "monitoring",
        },
    )
    assert deploy.status_code == 200, deploy.text


def test_drone_feeds_endpoint(api, seeded):
    """Regression: /drones/feeds was previously shadowed by /drones/{drone_id}.
    Keep this test to ensure the literal route stays registered first."""
    r = api.get("/drones/feeds")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --------------------------- Zones --------------------------------------------

def test_zones_full_crud(api, unique_name):
    payload = {
        "name": unique_name,
        "description": "pytest zone",
        "zone_type": "forest",
        "priority": "medium",
        "center_lat": 40.0,
        "center_lng": -74.0,
        "radius_km": 5.0,
        "biodiversity_index": 0.6,
        "soil_health": 0.7,
        "predator_prey_balance": 0.5,
        "vegetation_coverage": 0.8,
    }
    created = api.post("/zones", json=payload)
    assert created.status_code == 200, created.text
    zone_id = created.json()["id"]

    fetched = api.get(f"/zones/{zone_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == unique_name

    updated = api.put(f"/zones/{zone_id}", json={"priority": "high", "biodiversity_index": 0.9})
    assert updated.status_code == 200
    assert updated.json()["priority"] == "high"

    assert api.delete(f"/zones/{zone_id}").status_code == 200


# --------------------------- Sensors ------------------------------------------

def test_sensor_create_and_list(api, unique_name):
    payload = {
        "name": unique_name,
        "sensor_type": "temperature",
        "latitude": 40.0,
        "longitude": -74.0,
        "status": "active",
        "current_value": 25.5,
        "unit": "C",
    }
    created = api.post("/sensors", json=payload)
    assert created.status_code == 200, created.text
    listed = api.get("/sensors").json()
    assert any(s["id"] == created.json()["id"] for s in listed)


# --------------------------- Alerts -------------------------------------------

def test_alerts_lifecycle(api, unique_name):
    created = api.post(
        "/alerts",
        json={
            "title": unique_name,
            "message": "pytest alert",
            "severity": "warning",
            "alert_type": "system",
        },
    )
    assert created.status_code == 200
    alert_id = created.json()["id"]

    unread = api.get("/alerts?unread_only=true").json()
    assert any(a["id"] == alert_id for a in unread)

    assert api.put(f"/alerts/{alert_id}/read").status_code == 200
    assert api.put("/alerts/read-all").status_code == 200


# --------------------------- AI Analysis --------------------------------------

def test_ai_analyze_general(api, seeded):
    r = api.post("/ai/analyze", json={"analysis_type": "general"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("recommendations")
    assert body.get("analysis_type") == "general"

    history = api.get("/ai/history")
    assert history.status_code == 200
    assert isinstance(history.json(), list)


# --------------------------- Patrols ------------------------------------------

def test_patrols_generate_and_complete(api, seeded, unique_name):
    drones = api.get("/drones").json()
    assert drones, "seed should provide drones"

    gen = api.post(
        "/patrols/generate",
        json={
            "name": unique_name,
            "drone_ids": [d["id"] for d in drones[:2]],
            "schedule_type": "daily",
            "optimization_priority": "balanced",
        },
    )
    assert gen.status_code == 200, gen.text
    patrol = gen.json()
    assert patrol.get("waypoints"), "patrol should be generated with waypoints"
    assert patrol.get("ai_reasoning")
    patrol_id = patrol["id"]

    completed = api.post(f"/patrols/{patrol_id}/complete")
    assert completed.status_code == 200
    report = completed.json()
    for field in ("patrol_id", "patrol_name", "ai_summary", "wildlife_sightings"):
        assert field in report

    reports = api.get("/patrols/reports").json()
    assert any(r.get("patrol_id") == patrol_id for r in reports)

    api.delete(f"/patrols/{patrol_id}")


# --------------------------- Public dashboard ---------------------------------

def test_public_dashboard_no_auth(api, seeded):
    r = api.get("/public/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert "overview" in body
    assert "zone_summary" in body
    assert "last_updated" in body


# --------------------------- Weather ------------------------------------------

def test_weather_listing(api, seeded):
    r = api.get("/weather")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --------------------------- Notifications -----------------------------------
# /api/notifications/subscribe takes QUERY params (email, name) — not a JSON body.
# (The legacy backend_test.py was wrong about this.)

def test_notifications_subscribe_via_query_params(api, unique_name):
    email = f"{unique_name}@notify.test"
    r = api.post(f"/notifications/subscribe?email={email}&name={unique_name}")
    assert r.status_code == 200, r.text
    subs = api.get("/notifications/subscriptions").json()
    assert any(s.get("email") == email for s in subs)


# --------------------------- Species ------------------------------------------

def test_species_stats_endpoint(api):
    r = api.get("/species/stats")
    assert r.status_code == 200
    stats = r.json()
    for key in ("total_identifications", "unique_species", "endangered_count", "vulnerable_count"):
        assert key in stats


def test_species_identify_returns_parsed_structured_fields(api):
    """The endpoint used to hardcode species_name='Identified Species' / confidence=0.85.
    Now it asks the LLM for JSON and parses the actual fields. In offline mode the
    fallback JSON still satisfies the schema so the dashboard never sees None."""
    r = api.post("/species/identify?image_url=https://example.com/fox.jpg")
    assert r.status_code == 200, r.text
    body = r.json()

    assert isinstance(body.get("species_name"), str) and body["species_name"]
    assert isinstance(body.get("scientific_name"), str)
    assert isinstance(body["confidence"], (int, float))
    assert 0.0 <= body["confidence"] <= 1.0
    assert body["conservation_status"] in {"LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"}
    # The legacy hardcoded values must not leak through any longer.
    assert body["species_name"] != "Identified Species"
    assert body["scientific_name"] != "Species scientifica"


def test_species_identify_accepts_image_upload(api):
    import base64

    tiny_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
        b"\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?"
        b"\x00\x05\xfe\x02\xfeA\xe2&\x0b\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    image_data_url = f"data:image/png;base64,{base64.b64encode(tiny_png).decode('ascii')}"
    r = api.post(
        "/species/identify-upload",
        json={
            "image_data_url": image_data_url,
            "image_filename": "field-observation.png",
            "image_content_type": "image/png",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["image_source"] == "upload"
    assert body["image_filename"] == "field-observation.png"
    assert body["image_content_type"] == "image/png"
    assert body["image_url"].startswith("data:image/png;base64,")
    assert isinstance(body.get("species_name"), str) and body["species_name"]
    assert 0.0 <= body["confidence"] <= 1.0


# --------------------------- Negative paths -----------------------------------

@pytest.mark.parametrize(
    "method,path",
    [
        # Drone path is regex-constrained to UUIDs, so a non-existent-but-
        # well-formed UUID exercises the handler's 404 branch (rather than
        # the path-validator's 422). Zone path is unconstrained.
        ("get", "/drones/00000000-0000-4000-8000-000000000000"),
        ("get", "/zones/does-not-exist"),
    ],
)
def test_unknown_resource_returns_404(api, method, path):
    r = getattr(api, method)(path)
    assert r.status_code == 404


def test_drones_feeds_not_swallowed_by_uuid_route(api):
    # Regression guard for the historical route-ordering trap. The literal
    # `/drones/feeds` must always resolve to the feeds handler, not be
    # captured as `drone_id`. The UUID Path regex enforces this at the
    # routing layer.
    r = api.get("/drones/feeds")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_drones_route_rejects_non_uuid_path(api):
    r = api.get("/drones/not-a-uuid")
    assert r.status_code == 422


# --------------------------- Mongo _id leak regression ------------------------
# Several create endpoints used to return the dict that was passed to insert_one,
# which `motor` mutates with a non-serializable ObjectId. Each fix is now a one-
# liner via insert_and_return(); this test guards the entire class of bugs.

def _no_underscore_id(payload):
    if isinstance(payload, dict):
        assert "_id" not in payload, f"response leaked Mongo _id: keys={list(payload.keys())}"
        for v in payload.values():
            _no_underscore_id(v)
    elif isinstance(payload, list):
        for v in payload:
            _no_underscore_id(v)


def test_no_id_leak_across_create_endpoints(api, seeded, unique_name):
    drones = api.get("/drones").json()
    zones = api.get("/zones").json()
    assert drones and zones

    creates = [
        ("POST", "/drones", {"name": f"{unique_name}-drone", "latitude": 0, "longitude": 0}),
        ("POST", "/zones", {"name": f"{unique_name}-zone"}),
        ("POST", "/sensors", {"name": f"{unique_name}-sensor", "sensor_type": "temperature"}),
        ("POST", "/alerts", {"title": unique_name, "message": "x"}),
        ("POST", "/ai/analyze", {"analysis_type": "general"}),
        ("POST", "/patrols/generate",
            {"name": unique_name, "drone_ids": [drones[0]["id"]],
             "schedule_type": "daily", "optimization_priority": "balanced"}),
        ("POST", f"/forecasts/generate/{zones[0]['id']}", None),
    ]
    for method, path, body in creates:
        r = api.post(path, json=body) if body is not None else api.post(path)
        assert r.status_code == 200, f"{method} {path} → {r.status_code} {r.text[:200]}"
        _no_underscore_id(r.json())


# --------------------------- Drone simulator dynamics ------------------------
# Replaces the random-jitter movement: deployed drones must converge toward
# their assigned zone center. This is exposed via /api/_internal/drone-tick so
# the test runs in milliseconds instead of waiting for the 5s background loop.

def test_drone_simulator_moves_toward_assigned_zone(api, seeded, auth_headers, unique_name):
    import math

    zones = api.get("/zones").json()
    drones = api.get("/drones").json()
    assert zones and drones

    # Place a drone far from the zone so direction-of-movement is unambiguous.
    target_zone = zones[0]
    drone = api.post("/drones", json={
        "name": f"{unique_name}-sim",
        "latitude": target_zone["center_lat"] + 5.0,
        "longitude": target_zone["center_lng"] + 5.0,
        "status": "patrolling",
        "zone_id": target_zone["id"],
    }).json()

    initial = drone
    initial_dist = math.hypot(
        initial["latitude"] - target_zone["center_lat"],
        initial["longitude"] - target_zone["center_lng"],
    )

    tick = api.post("/_internal/drone-tick", headers=auth_headers)
    assert tick.status_code == 200, tick.text
    assert tick.json()["updated"] >= 1

    after = api.get(f"/drones/{drone['id']}").json()
    new_dist = math.hypot(
        after["latitude"] - target_zone["center_lat"],
        after["longitude"] - target_zone["center_lng"],
    )

    assert new_dist < initial_dist, (
        f"drone did not move toward zone — initial_dist={initial_dist:.4f}, "
        f"new_dist={new_dist:.4f}"
    )
    # Battery must drain monotonically when the drone moves.
    assert after["battery"] < initial["battery"]

    api.delete(f"/drones/{drone['id']}")
