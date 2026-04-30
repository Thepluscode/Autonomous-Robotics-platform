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
    assert body.get("robots", 0) > 0


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


def test_me_requires_auth(base_url, _require_live_backend):
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


# --------------------------- Robots ------------------------------------------

def test_robots_full_crud_and_task(api, seeded, unique_name):
    zones = api.get("/zones").json()
    assert zones, "seed should provide zones"

    payload = {
        "name": unique_name,
        "robot_type": "ground",
        "status": "idle",
        "battery": 88,
        "health": 91,
        "autonomy_level": 0.76,
        "capabilities": ["soil_sampling", "payload_delivery"],
    }
    created = api.post("/robots", json=payload)
    assert created.status_code == 200, created.text
    robot = created.json()
    robot_id = robot["id"]
    assert robot["robot_type"] == "ground"

    listed = api.get("/robots?robot_type=ground")
    assert listed.status_code == 200
    assert any(r["id"] == robot_id for r in listed.json())

    updated = api.put(f"/robots/{robot_id}", json={"status": "mapping", "battery": 81})
    assert updated.status_code == 200
    assert updated.json()["status"] == "mapping"

    tasked = api.post(
        f"/robots/{robot_id}/task",
        json={"zone_id": zones[0]["id"], "mission_type": "soil_sampling", "status": "assigned", "notes": "pytest task"},
    )
    assert tasked.status_code == 200, tasked.text
    assert tasked.json()["zone_id"] == zones[0]["id"]
    assert tasked.json()["mission_type"] == "soil_sampling"

    deleted = api.delete(f"/robots/{robot_id}")
    assert deleted.status_code == 200
    assert api.get(f"/robots/{robot_id}").status_code == 404


def test_robots_reject_invalid_type(api, unique_name):
    created = api.post("/robots", json={"name": unique_name, "robot_type": "dragon"})
    assert created.status_code == 422


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


# --------------------------- Missions -----------------------------------------

def _create_mission_ready_fixture(api, unique_name, auth_headers, suffix=""):
    zone = api.post(
        "/zones",
        json={
            "name": f"{unique_name}-mission-zone{suffix}",
            "zone_type": "forest",
            "priority": "critical",
            "center_lat": 1.0,
            "center_lng": 2.0,
            "radius_km": 8,
            "biodiversity_index": 0.35,
            "soil_health": 0.4,
            "predator_prey_balance": 0.5,
            "vegetation_coverage": 0.45,
        },
    )
    assert zone.status_code == 200, zone.text
    zone_id = zone.json()["id"]

    created_drones = []
    for index in range(2):
        drone = api.post(
            "/drones",
            json={
                "name": f"{unique_name}-mission-drone-{index}{suffix}",
                "status": "idle",
                "battery": 98 - index,
                "latitude": 1.0 + index * 0.01,
                "longitude": 2.0 + index * 0.01,
            },
        )
        assert drone.status_code == 200, drone.text
        created_drones.append(drone.json())

    mission = api.post(
        "/missions/generate",
        headers=auth_headers,
        json={
            "zone_id": zone_id,
            "mission_type": "patrol",
            "max_drones": 2,
            "notes": "pytest lifecycle mission",
        },
    )
    assert mission.status_code == 200, mission.text
    body = mission.json()
    assert body["status"] == "ready"
    assert body["drone_ids"]
    assert body["go_score"] >= 0.6
    return body, zone_id, [d["id"] for d in created_drones]


def test_mission_lifecycle_authorize_and_complete(api, auth_headers, unique_name):
    mission, zone_id, drone_ids = _create_mission_ready_fixture(api, unique_name, auth_headers)
    mission_id = mission["id"]

    listed = api.get("/missions", headers=auth_headers)
    assert listed.status_code == 200
    assert any(item["id"] == mission_id for item in listed.json())

    fetched = api.get(f"/missions/{mission_id}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == mission_id

    premature_complete = api.post(f"/missions/{mission_id}/complete", headers=auth_headers)
    assert premature_complete.status_code == 400

    authorized = api.post(f"/missions/{mission_id}/authorize", headers=auth_headers)
    assert authorized.status_code == 200, authorized.text
    active = authorized.json()
    assert active["status"] == "active"
    assert active["launch_result"]["deployed_count"] > 0
    assert any(event["action"] == "authorized" for event in active["audit_trail"])

    double_authorize = api.post(f"/missions/{mission_id}/authorize", headers=auth_headers)
    assert double_authorize.status_code == 400

    completed = api.post(f"/missions/{mission_id}/complete", headers=auth_headers)
    assert completed.status_code == 200, completed.text
    done = completed.json()
    assert done["status"] == "completed"
    assert done["post_mission_summary"]
    report = done["post_mission_report"]
    assert report["mission_id"] == mission_id
    assert report["zone_id"] == zone_id
    assert report["status"] == "completed"
    assert report["drones"], "completed mission report should include drone evidence"
    assert "restoration_impact" in report
    assert "biodiversity_delta_7d_estimate" in report["restoration_impact"]
    assert "audit_trail" in report and report["audit_trail"]
    assert "recommendations" in report and report["recommendations"]
    assert any(event["action"] == "completed" for event in done["audit_trail"])

    abort_completed = api.post(
        f"/missions/{mission_id}/abort",
        headers=auth_headers,
        json={"reason": "pytest should not abort completed missions"},
    )
    assert abort_completed.status_code == 400

    for drone_id in drone_ids:
        api.delete(f"/drones/{drone_id}")
    api.delete(f"/zones/{zone_id}")


def test_mission_abort_requires_active_and_reason(api, auth_headers, unique_name):
    mission, zone_id, drone_ids = _create_mission_ready_fixture(api, unique_name, auth_headers, suffix="-abort")
    mission_id = mission["id"]

    abort_ready = api.post(
        f"/missions/{mission_id}/abort",
        headers=auth_headers,
        json={"reason": "pytest abort before active"},
    )
    assert abort_ready.status_code == 400

    missing_reason = api.post(f"/missions/{mission_id}/abort", headers=auth_headers)
    assert missing_reason.status_code == 422

    authorized = api.post(f"/missions/{mission_id}/authorize", headers=auth_headers)
    assert authorized.status_code == 200, authorized.text

    aborted = api.post(
        f"/missions/{mission_id}/abort",
        headers=auth_headers,
        json={"reason": "pytest active abort"},
    )
    assert aborted.status_code == 200, aborted.text
    body = aborted.json()
    assert body["status"] == "aborted"
    assert any(event["action"] == "aborted" and event["detail"] == "pytest active abort" for event in body["audit_trail"])

    complete_aborted = api.post(f"/missions/{mission_id}/complete", headers=auth_headers)
    assert complete_aborted.status_code == 400

    for drone_id in drone_ids:
        api.delete(f"/drones/{drone_id}")
    api.delete(f"/zones/{zone_id}")


def test_mission_draft_cannot_authorize(api, auth_headers, unique_name):
    zone = api.post("/zones", json={"name": f"{unique_name}-draft-zone"})
    assert zone.status_code == 200, zone.text
    zone_id = zone.json()["id"]

    mission = api.post(
        "/missions/generate",
        headers=auth_headers,
        json={"zone_id": zone_id, "mission_type": "inspect", "max_drones": 0},
    )
    assert mission.status_code == 200, mission.text
    body = mission.json()
    assert body["status"] == "draft"

    authorized = api.post(f"/missions/{body['id']}/authorize", headers=auth_headers)
    assert authorized.status_code == 400

    api.delete(f"/zones/{zone_id}")


def test_mission_generate_assigns_robot_assets(api, seeded, auth_headers):
    zones = api.get("/zones").json()
    assert zones, "seed should provide zones"

    mission = api.post(
        "/missions/generate",
        headers=auth_headers,
        json={
            "zone_id": zones[0]["id"],
            "mission_type": "patrol",
            "max_robots": 3,
            "max_drones": 2,
            "notes": "pytest robotics mission",
        },
    )
    assert mission.status_code == 200, mission.text
    body = mission.json()
    assert body["robot_ids"], "mission planner should assign robotics assets when available"
    assert "drone_ids" in body, "legacy drone assignments remain part of the mission contract"
    assert any(item["label"] == "robots_available" for item in body["readiness"])
    assert body["evidence"]["selected_robots"]


def test_missions_route_rejects_non_uuid_path(api, auth_headers):
    r = api.get("/missions/not-a-uuid", headers=auth_headers)
    assert r.status_code == 422


# --------------------------- Mission planner contract ------------------------
# These lock behaviors the moonshot demo depends on: planner picks the right
# zone unprompted, surfaces a counterfactual, filters drones by readiness,
# and writes a monotonically-growing audit trail. If any of these regress,
# the "AI Mission Control Mode" pitch falls apart.

def test_planner_auto_picks_lowest_biodiversity_zone_when_zone_id_omitted(
    api, auth_headers, seeded, unique_name
):
    # Plant a clearly-worst zone so we can assert the planner finds it.
    target = api.post("/zones", json={
        "name": f"{unique_name}-worst",
        "biodiversity_index": 0.05,
        "priority": "critical",
        "center_lat": 0.0, "center_lng": 0.0, "radius_km": 5.0,
    })
    assert target.status_code == 200, target.text
    target_id = target.json()["id"]

    drone = api.post("/drones", json={
        "name": f"{unique_name}-worst-drone",
        "status": "idle", "battery": 95,
    })
    assert drone.status_code == 200
    drone_id = drone.json()["id"]

    plan = api.post("/missions/generate", headers=auth_headers,
                    json={"mission_type": "patrol", "max_drones": 1})
    assert plan.status_code == 200, plan.text
    body = plan.json()
    assert body["zone_id"] == target_id, "planner should pick the lowest-biodiversity zone"

    api.delete(f"/drones/{drone_id}")
    api.delete(f"/zones/{target_id}")


def test_planner_evidence_carries_counterfactual_and_rejection_reasons(
    api, auth_headers, unique_name
):
    zone = api.post("/zones", json={
        "name": f"{unique_name}-evidence",
        "biodiversity_index": 0.3, "priority": "high",
        "center_lat": 0.0, "center_lng": 0.0, "radius_km": 5.0,
    })
    zone_id = zone.json()["id"]

    # Mix of rejectable and acceptable drones — rejections must surface.
    drones = []
    for i, (status, battery) in enumerate([("idle", 95), ("idle", 30), ("patrolling", 90)]):
        d = api.post("/drones", json={
            "name": f"{unique_name}-ev-{i}", "status": status, "battery": battery,
        })
        drones.append(d.json()["id"])

    plan = api.post("/missions/generate", headers=auth_headers,
                    json={"zone_id": zone_id, "mission_type": "intervene", "max_drones": 5})
    assert plan.status_code == 200, plan.text
    body = plan.json()

    cf = body["evidence"]["counterfactual"]
    assert "if_no_deploy_7d" in cf and "if_deploy_7d" in cf
    assert cf["if_no_deploy_7d"]["biodiversity_index_delta"] <= 0, "no-deploy should be flat or worse"
    assert cf["if_deploy_7d"]["biodiversity_index_delta"] > 0, "deploy should improve"

    rejected = {r["id"]: r["reason"] for r in body["evidence"]["rejected_drones"]}
    assert any("battery=" in r for r in rejected.values()), "low-battery drone must be rejected with reason"
    assert any("status=patrolling" in r for r in rejected.values()), "non-idle drone must be rejected with reason"

    for d in drones:
        api.delete(f"/drones/{d}")
    api.delete(f"/zones/{zone_id}")


def test_planner_evidence_carries_counterfactual_trajectories_with_ci(
    api, auth_headers, unique_name
):
    """The chart that closes the Series A: planner evidence must surface a
    full no-deploy vs with-deploy trajectory with confidence bands so the
    Mission Control launch screen can render a real chart, not just a
    one-line delta."""
    zone = api.post("/zones", json={
        "name": f"{unique_name}-traj",
        "biodiversity_index": 0.3, "priority": "high",
        "center_lat": 0.0, "center_lng": 0.0, "radius_km": 5.0,
    })
    zone_id = zone.json()["id"]
    drone_id = api.post("/drones", json={"name": f"{unique_name}-traj-d", "status": "idle", "battery": 90}).json()["id"]

    plan = api.post("/missions/generate", headers=auth_headers,
                    json={"zone_id": zone_id, "mission_type": "intervene", "max_drones": 1})
    assert plan.status_code == 200, plan.text
    cf = plan.json()["evidence"]["counterfactual"]
    traj = cf["trajectories"]
    assert traj["horizon_days"] == 14
    assert len(traj["points"]) == 15  # day 0 through day 14 inclusive
    # Schema sanity on the first point.
    p0 = traj["points"][0]
    for key in ("day", "no_deploy_value", "no_deploy_lo", "no_deploy_hi",
                "with_deploy_value", "with_deploy_lo", "with_deploy_hi"):
        assert key in p0, f"missing point key: {key}"
    # CI bands must surround the mean.
    p_mid = traj["points"][7]
    assert p_mid["no_deploy_lo"] <= p_mid["no_deploy_value"] <= p_mid["no_deploy_hi"]
    assert p_mid["with_deploy_lo"] <= p_mid["with_deploy_value"] <= p_mid["with_deploy_hi"]
    # Intervention beats no-action by the horizon end.
    assert traj["summary"]["with_deploy_final"] > traj["summary"]["no_deploy_final"]
    # `fit_quality` is honest about the placeholder model.
    assert 0 <= traj["fit_quality"] <= 1

    api.delete(f"/drones/{drone_id}")
    api.delete(f"/zones/{zone_id}")


def test_counterfactual_endpoint_returns_chart_data(api, unique_name):
    zone = api.post("/zones", json={
        "name": f"{unique_name}-cfep",
        "biodiversity_index": 0.4, "priority": "critical",
        "center_lat": 0.0, "center_lng": 0.0, "radius_km": 5.0,
    })
    zone_id = zone.json()["id"]

    r = api.post(f"/forecasts/counterfactual/{zone_id}?mission_type=intervene&horizon_days=21")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["horizon_days"] == 21
    assert len(body["points"]) == 22
    assert body["zone_id"] == zone_id
    assert body["mission_type"] == "intervene"
    # Determinism: same zone + same params produce the same numbers.
    r2 = api.post(f"/forecasts/counterfactual/{zone_id}?mission_type=intervene&horizon_days=21")
    assert r2.json()["points"] == body["points"]

    # Bounds enforcement.
    bad = api.post(f"/forecasts/counterfactual/{zone_id}?horizon_days=200")
    assert bad.status_code == 422
    missing = api.post(f"/forecasts/counterfactual/00000000-0000-4000-8000-000000000000")
    assert missing.status_code == 404

    api.delete(f"/zones/{zone_id}")


def test_audit_trail_grows_monotonically_across_state_transitions(
    api, auth_headers, unique_name
):
    mission, zone_id, drone_ids = _create_mission_ready_fixture(
        api, unique_name, auth_headers, suffix="-audit"
    )
    mission_id = mission["id"]

    after_generate = api.get(f"/missions/{mission_id}", headers=auth_headers).json()
    n_after_generate = len(after_generate["audit_trail"])

    api.post(f"/missions/{mission_id}/authorize", headers=auth_headers)
    after_authorize = api.get(f"/missions/{mission_id}", headers=auth_headers).json()
    n_after_authorize = len(after_authorize["audit_trail"])

    api.post(f"/missions/{mission_id}/complete", headers=auth_headers)
    after_complete = api.get(f"/missions/{mission_id}", headers=auth_headers).json()
    n_after_complete = len(after_complete["audit_trail"])

    assert n_after_generate >= 1
    assert n_after_authorize > n_after_generate, "authorize must append entries"
    assert n_after_complete > n_after_authorize, "complete must append an entry"

    actions = [e["action"] for e in after_complete["audit_trail"]]
    assert actions[0] == "generated"
    assert "authorized" in actions and "launched" in actions and "completed" in actions

    for d in drone_ids:
        api.delete(f"/drones/{d}")
    api.delete(f"/zones/{zone_id}")


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
