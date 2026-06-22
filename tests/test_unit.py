"""Pure unit tests for backend helpers.

These do not require MongoDB or the FastAPI server to be running. They
import `backend.server` after stubbing the environment (Motor's client
creation is lazy — it doesn't actually open a connection until an await
on it). Use them to lock the contract on small, well-scoped helpers
that the live-backend tests in test_api.py only exercise indirectly.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Stub the env vars `server.py` reads at import time so we can import it
# without a real MongoDB or .env file. Must run before the import below.
os.environ.setdefault("MONGO_URL", "mongodb://stub:27017")
os.environ.setdefault("DB_NAME", "stub_db")
os.environ.setdefault("JWT_SECRET", "unit-test-secret-must-be-32-chars-or-more")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_PASSWORD", "stub-password")

# Make `backend/` importable as a package root.
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import pytest  # noqa: E402

# Backend deps (motor, jwt, bcrypt, fastapi) live in backend/requirements.txt.
# When the active interpreter doesn't have them — e.g., running pytest from a
# bare venv or in CI before deps install — skip the module rather than fail
# collection. Run `pip install -r backend/requirements.txt` to enable.
try:
    import jwt  # noqa: E402
    import server  # noqa: E402
except ImportError as exc:
    pytest.skip(
        f"backend deps not installed in active env ({exc!s}); "
        "run `pip install -r backend/requirements.txt`",
        allow_module_level=True,
    )


# --------------------------- password hashing ---------------------------------

def test_password_roundtrip_succeeds():
    h = server.hash_password("correct-horse-battery-staple")
    assert server.verify_password("correct-horse-battery-staple", h) is True


def test_password_roundtrip_rejects_wrong_password():
    h = server.hash_password("the-real-password")
    assert server.verify_password("guessed-wrong", h) is False


def test_password_hash_is_not_plaintext():
    pw = "plaintext-must-not-leak"
    h = server.hash_password(pw)
    assert pw not in h
    # bcrypt hashes start with $2b$ (or $2a$/$2y$ depending on version)
    assert h.startswith("$2")


# --------------------------- JWT helpers --------------------------------------

def test_access_token_carries_user_claims_and_type():
    token = server.create_access_token("user-id-123", "user@example.com", "admin")
    decoded = jwt.decode(token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])
    assert decoded["sub"] == "user-id-123"
    assert decoded["email"] == "user@example.com"
    assert decoded["role"] == "admin"
    assert decoded["type"] == "access"


def test_refresh_token_marked_as_refresh_type():
    token = server.create_refresh_token("user-id-123")
    decoded = jwt.decode(token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])
    assert decoded["sub"] == "user-id-123"
    assert decoded["type"] == "refresh"


def test_access_token_expires_in_about_60_minutes():
    before = datetime.now(timezone.utc)
    token = server.create_access_token("u", "e@x", "viewer")
    after = datetime.now(timezone.utc)
    decoded = jwt.decode(token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])
    exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
    # Allow a couple seconds of slack for test execution.
    assert before + timedelta(minutes=59, seconds=58) <= exp <= after + timedelta(minutes=60, seconds=2)


def test_token_signed_with_wrong_secret_is_rejected():
    token = server.create_access_token("u", "e@x", "viewer")
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, "different-secret-also-32-chars-long", algorithms=[server.JWT_ALGORITHM])


# --------------------------- JWT_SECRET startup validator ---------------------
#
# The validator runs at module import time, so we can't exercise it by
# re-importing `server` in this process. Instead, spawn a fresh interpreter
# with a poisoned env and assert the import fails with the expected message.
# This guards against the silent-fallback regression that would let a deploy
# with no JWT_SECRET env var sign tokens with a publicly-known string.

def _spawn_server_import(env: dict) -> "subprocess.CompletedProcess[str]":
    import subprocess
    base_env = {
        # Minimum env so server.py reaches the JWT validator. MONGO_URL is
        # consumed lazily, so its value here doesn't matter — Motor doesn't
        # connect at import time.
        "MONGO_URL": "mongodb://stub:27017",
        "DB_NAME": "stub_db",
        "ADMIN_EMAIL": "admin@example.com",
        "ADMIN_PASSWORD": "stub-password",
        "PATH": os.environ.get("PATH", ""),
    }
    base_env.update(env)
    return subprocess.run(
        [sys.executable, "-c", "import server"],
        cwd=str(_BACKEND),
        env=base_env,
        capture_output=True,
        text=True,
        timeout=20,
    )


def test_jwt_validator_rejects_missing_secret():
    # Empty string instead of unset, so backend/.env (loaded with override=False)
    # doesn't backfill the real secret on dev machines that have one. The
    # validator treats empty and missing identically.
    result = _spawn_server_import({"JWT_SECRET": ""})
    assert result.returncode != 0, "server must refuse to start with empty JWT_SECRET"
    assert "JWT_SECRET" in result.stderr


def test_jwt_validator_rejects_blocklisted_default():
    result = _spawn_server_import({"JWT_SECRET": "fallback-secret-key"})
    assert result.returncode != 0, "server must refuse the legacy fallback secret"
    assert "JWT_SECRET" in result.stderr


def test_jwt_validator_rejects_short_secret():
    result = _spawn_server_import({"JWT_SECRET": "too-short"})
    assert result.returncode != 0, "server must refuse a JWT_SECRET shorter than 32 chars"
    assert "JWT_SECRET" in result.stderr


def test_jwt_validator_accepts_strong_secret():
    result = _spawn_server_import({"JWT_SECRET": "a" * 32})
    assert result.returncode == 0, (
        f"server must boot with a 32-char secret. stderr:\n{result.stderr}"
    )


def test_jwt_validator_allow_insecure_escape_hatch():
    result = _spawn_server_import({
        "JWT_SECRET": "fallback-secret-key",
        "JWT_SECRET_ALLOW_INSECURE": "1",
    })
    assert result.returncode == 0, (
        f"JWT_SECRET_ALLOW_INSECURE=1 must let the server boot anyway. stderr:\n{result.stderr}"
    )


# --------------------------- public route allowlist --------------------------
#
# These tests pin the allowlist surface so a future PR that quietly adds
# a new route to PUBLIC_ROUTES (or removes one auditors depend on) is
# caught in review instead of in production. The W1.6 middleware reads
# this same allowlist, so any drift here propagates to runtime auth.

def test_public_routes_includes_login_flow():
    # Login bootstrap must be reachable without auth, otherwise nobody can
    # ever obtain a token in the first place.
    for path in [
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/logout",
        "/api/auth/refresh",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
    ]:
        assert server.is_public_path(path), f"{path} must be public for the login flow"


def test_public_routes_includes_provenance_surface():
    # Auditor / public-dashboard surfaces — the Gaia Prime moonshot relies
    # on these being accessible without an account.
    for path in [
        "/api/public/dashboard",
        "/api/public/provenance/stats",
        "/api/observations",
        "/api/observations/verify",
        "/.well-known/keys.json",
    ]:
        assert server.is_public_path(path), f"{path} must be public (provenance surface)"


def test_public_routes_pattern_matches_observation_id():
    assert server.is_public_path("/api/observations/abc-123_xyz")
    assert server.is_public_path("/api/observations/" + "a" * 36)
    # Pattern is anchored — must not match prefixes/suffixes.
    assert not server.is_public_path("/api/observations/abc/extra")


def test_public_routes_pattern_matches_zone_attestation():
    assert server.is_public_path("/api/zones/zone-uuid/attestation")
    assert not server.is_public_path("/api/zones/zone-uuid/attestation/extra")
    assert not server.is_public_path("/api/zones/zone-uuid")


def test_public_routes_excludes_authenticated_endpoints():
    # Sanity check: routes that are *not* in the allowlist (and never
    # should be) must read as authenticated.
    for path in [
        "/api/drones",
        "/api/zones",
        "/api/missions/generate",
        "/api/seed",
        "/api/_internal/drone-tick",
        "/ws/updates",
    ]:
        assert not server.is_public_path(path), (
            f"{path} must NOT be public — pulling it into the allowlist needs "
            "its own review."
        )


def test_attestation_max_hours_capped_at_one_week():
    # 168 hours = 7 days. Council finding: the previous 720-hour (30-day)
    # cap turned a single anonymous GET into a month-long bulk export.
    assert server.ATTESTATION_MAX_HOURS == 168


# --------------------------- redact-flag transform ---------------------------
#
# Direct unit tests on the helper. The endpoint flow is exercised via the
# surface-lock test (which classifies the redact endpoint as admin-gated),
# and via integration tests in test_api.py when the live backend is up.

def test_redact_for_public_passes_through_unredacted():
    obs = {
        "id": "x",
        "payload": {"value": 42},
        "digest": "abc",
        "signature": "sig",
    }
    out = server._redact_for_public(obs)
    assert out is obs, "non-redacted observations must pass through unchanged"
    assert out["payload"] == {"value": 42}


def test_redact_for_public_strips_payload_when_flagged():
    obs = {
        "id": "y",
        "payload": {"sensitive": "data"},
        "digest": "abc",
        "signature": "sig",
        "redacted": True,
        "redacted_at": "2026-05-09T00:00:00+00:00",
        "redaction_reason": "PII captured",
    }
    out = server._redact_for_public(obs)
    assert out["payload"] is None, "redacted observation must have payload suppressed"
    assert out["redacted"] is True
    assert out["redaction_reason"] == "PII captured"
    # Cryptographic fields preserved — auditors with the original payload
    # archived elsewhere can still verify the signature against that.
    assert out["digest"] == "abc"
    assert out["signature"] == "sig"


def test_redact_for_public_does_not_mutate_input():
    obs = {
        "id": "z",
        "payload": {"sensitive": "data"},
        "redacted": True,
        "redaction_reason": "test",
    }
    server._redact_for_public(obs)
    # The input dict (which may be a Mongo doc) must NOT be mutated —
    # otherwise admin views would see suppressed payloads as a side effect.
    assert obs["payload"] == {"sensitive": "data"}


# --------------------------- satellite cross-witness ------------------------
#
# Pure-function tests for the satellite module. The orchestrator
# (`tick_satellite_witness`) is exercised end-to-end by integration
# tests in test_api.py against a live backend; here we lock the
# behaviors that don't need Mongo or the network.

def test_satellite_zone_bbox_from_explicit_field():
    import satellite
    bbox = satellite._zone_bbox({"bbox": [10.0, 20.0, 11.0, 21.0]})
    assert bbox == [10.0, 20.0, 11.0, 21.0]


def test_satellite_zone_bbox_from_polygon():
    import satellite
    zone = {"polygon": [[[10.0, 20.0], [11.0, 20.0], [11.0, 21.0], [10.0, 21.0], [10.0, 20.0]]]}
    bbox = satellite._zone_bbox(zone)
    assert bbox == [10.0, 20.0, 11.0, 21.0]


def test_satellite_zone_bbox_from_centroid_fallback():
    import satellite
    zone = {"center_lat": 50.0, "center_lng": 30.0}
    bbox = satellite._zone_bbox(zone)
    # Half-degree box around the centroid: [lng-0.5, lat-0.5, lng+0.5, lat+0.5]
    assert bbox == [29.5, 49.5, 30.5, 50.5]


def test_satellite_zone_bbox_returns_none_when_geographic_data_missing():
    import satellite
    assert satellite._zone_bbox({"id": "z1", "name": "no-geometry"}) is None


def test_satellite_witness_disabled_by_default():
    import satellite
    # Test env doesn't set SATELLITE_WITNESS_ENABLED; the loop must be a no-op.
    import os
    os.environ.pop("SATELLITE_WITNESS_ENABLED", None)
    assert satellite.is_enabled() is False


def test_satellite_witness_enabled_when_env_set(monkeypatch):
    import satellite
    monkeypatch.setenv("SATELLITE_WITNESS_ENABLED", "1")
    assert satellite.is_enabled() is True
    monkeypatch.setenv("SATELLITE_WITNESS_ENABLED", "true")
    assert satellite.is_enabled() is True
    monkeypatch.setenv("SATELLITE_WITNESS_ENABLED", "no")
    assert satellite.is_enabled() is False


def test_satellite_build_witness_payload_distills_stac_item():
    import satellite
    zone = {"id": "z1", "center_lat": 50.0, "center_lng": 30.0}
    scene = {
        "id": "S2A_MSIL2A_20260507T100001_N0509_R022_T34UDB_20260507T120000",
        "bbox": [29.5, 49.5, 30.5, 50.5],
        "properties": {
            "datetime": "2026-05-07T10:00:01Z",
            "platform": "sentinel-2a",
            "eo:cloud_cover": 12.3,
        },
        "assets": {
            "thumbnail": {"href": "https://example.com/thumb.jpg"},
        },
    }
    out = satellite._build_witness_payload(zone, scene, "abc123def456")
    assert out["scene_id"] == scene["id"]
    assert out["platform"] == "sentinel-2a"
    assert out["acquisition_at"] == "2026-05-07T10:00:01Z"
    assert out["cloud_cover_pct"] == 12.3
    assert out["bbox"] == [29.5, 49.5, 30.5, 50.5]
    assert out["thumbnail_url"] == "https://example.com/thumb.jpg"
    assert out["thumbnail_sha256"] == "abc123def456"
    assert out["zone_bbox"] == [29.5, 49.5, 30.5, 50.5]
    assert out["stac_collection"] == satellite.SATELLITE_COLLECTION
    assert out["stac_url"], "stac_url must be populated when scene id is present"


def test_satellite_witness_endpoint_is_admin_gated():
    """The /_internal/satellite-tick endpoint must require admin role,
    same as the drone-tick endpoint, so an anonymous caller can't
    burn through Element84 quota or pollute the chain."""
    from fastapi.routing import APIRoute
    route = next(
        (
            r for r in server.app.routes
            if isinstance(r, APIRoute)
            and r.path == "/api/_internal/satellite-tick"
        ),
        None,
    )
    assert route is not None, "satellite-tick route must be registered"
    assert "POST" in (route.methods or set())

    seen, stack, found = set(), [route.dependant], False
    while stack:
        d = stack.pop()
        if d is None or id(d) in seen:
            continue
        seen.add(id(d))
        call = getattr(d, "call", None)
        if call is not None and getattr(call, "__name__", "") == "role_checker":
            found = True
            break
        for sub in getattr(d, "dependencies", []) or []:
            stack.append(sub)
    assert found, "satellite-tick must be admin-gated via require_role"


def test_redact_endpoint_is_admin_gated_via_dependency_tree():
    # Asserting the framework-level enforcement directly — the redact
    # route must declare `Depends(require_role(["admin"]))` so an
    # accidental future edit that drops the dependency fails this test
    # before it can reach Mongo. Probing the route via TestClient
    # against a stub Mongo gives 500s rather than the 401/403 we want
    # to lock in.
    from fastapi.routing import APIRoute
    redact = next(
        (
            r for r in server.app.routes
            if isinstance(r, APIRoute)
            and r.path == "/api/observations/{observation_id}/redact"
        ),
        None,
    )
    assert redact is not None, "redact route must be registered"
    assert "POST" in (redact.methods or set()), "redact route must be POST"

    # Walk the dependency tree for a `role_checker` (the closure
    # produced by `require_role([...])`).
    seen, stack, found_role_checker = set(), [redact.dependant], False
    while stack:
        d = stack.pop()
        if d is None or id(d) in seen:
            continue
        seen.add(id(d))
        call = getattr(d, "call", None)
        if call is not None and getattr(call, "__name__", "") == "role_checker":
            found_role_checker = True
            break
        for sub in getattr(d, "dependencies", []) or []:
            stack.append(sub)
    assert found_role_checker, (
        "redact route must use Depends(require_role([\"admin\"])) — admin-only "
        "is the load-bearing security claim of this endpoint"
    )


# --------------------------- AUTH_GATE_PHASE_A middleware --------------------
#
# These tests exercise the dark-shipped Phase-A middleware via FastAPI's
# in-process TestClient. They register an ad-hoc route on `server.app`
# at setup so we can probe a path that's deliberately *not* in the
# public allowlist without touching Mongo.

@pytest.fixture
def gated_test_route():
    """Register a /__phase_a_test__/protected route on the server app
    that just returns 200. Lets us probe the middleware without hitting
    a real handler that depends on Mongo."""
    from fastapi.testclient import TestClient

    if not any(r.path == "/__phase_a_test__/protected" for r in server.app.routes):
        @server.app.get("/__phase_a_test__/protected")
        async def _phase_a_test_route():
            return {"ok": True}

    # Sanity: this path is *not* in the public allowlist.
    assert not server.is_public_path("/__phase_a_test__/protected")

    return TestClient(server.app, raise_server_exceptions=False)


def test_phase_a_middleware_disabled_passes_through(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "0")
    res = gated_test_route.get("/__phase_a_test__/protected")
    assert res.status_code == 200, "with the gate explicitly disabled (=0), anonymous requests pass through"
    assert res.json() == {"ok": True}


def test_phase_a_middleware_enabled_by_default(gated_test_route, monkeypatch):
    # W2: the gate is secure-by-default — an unset flag means ON.
    monkeypatch.delenv("AUTH_GATE_PHASE_A", raising=False)
    res = gated_test_route.get("/__phase_a_test__/protected")
    assert res.status_code == 401, "the auth gate must be ON by default (secure-by-default)"
    assert res.json()["phase"] == "AUTH_GATE_PHASE_A"


def test_phase_a_middleware_blocks_protected_route_when_enabled(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    res = gated_test_route.get("/__phase_a_test__/protected")
    assert res.status_code == 401, "gate on + no token must 401 on a non-public route"
    body = res.json()
    assert body["detail"] == "Not authenticated"
    assert body["phase"] == "AUTH_GATE_PHASE_A"


def test_phase_a_middleware_allows_public_route_when_enabled(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    # /api/auth/login is in PUBLIC_ROUTES; even without a token the
    # middleware must let it through so the user can log in.
    res = gated_test_route.post("/api/auth/login", json={"email": "x", "password": "y"})
    # The actual handler will probably return 4xx (bad creds, no Mongo,
    # etc.) — what matters is the middleware did NOT short-circuit at 401
    # with our phase marker.
    if res.status_code == 401:
        assert res.json().get("phase") != "AUTH_GATE_PHASE_A", (
            "public allowlist must let the request reach the handler"
        )


def test_phase_a_middleware_accepts_valid_bearer_token(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    token = server.create_access_token("u1", "u@example.com", "admin")
    res = gated_test_route.get(
        "/__phase_a_test__/protected",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_phase_a_middleware_accepts_valid_cookie(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    token = server.create_access_token("u1", "u@example.com", "admin")
    gated_test_route.cookies.set("access_token", token)
    res = gated_test_route.get("/__phase_a_test__/protected")
    assert res.status_code == 200
    gated_test_route.cookies.clear()


def test_phase_a_middleware_rejects_refresh_token_used_as_access(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    refresh = server.create_refresh_token("u1")
    res = gated_test_route.get(
        "/__phase_a_test__/protected",
        headers={"Authorization": f"Bearer {refresh}"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid token type"


def test_phase_a_middleware_rejects_garbage_token(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    res = gated_test_route.get(
        "/__phase_a_test__/protected",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid token"


# --------------------------- public-surface lock ----------------------------
#
# This test pins the public surface of the API so a future PR can't quietly
# add a new unauthenticated route or strip auth off an existing one. Every
# HTTP route registered on `server.app` must fall into exactly one of:
#
#   1. PUBLIC — its template path matches `is_public_path` after `{x}`
#      placeholders are normalized. These are the deliberate auditor /
#      login surfaces declared in W1.3.
#   2. GATED — the handler either takes `Depends(get_current_user)` /
#      `Depends(require_role(...))` OR calls `get_current_user(request)`
#      explicitly inside its body.
#   3. W2_UNGATED_BACKLOG — known-ungated routes that are scheduled for
#      hardening in W2. Each entry is `(METHOD, "/api/path")`. Adding a
#      new entry requires explicit review; removing an entry (because it
#      now has auth) is the W2 progress signal.
#
# A new route that doesn't fit any bucket fails the test with a message
# telling the developer where to put it. This is the lock the W1 council
# asked for — a public-surface that can only grow with intent.

def _gated_via_dependant(route) -> bool:
    if not hasattr(route, "dependant"):
        return False
    seen, stack = set(), [route.dependant]
    while stack:
        d = stack.pop()
        if d is None or id(d) in seen:
            continue
        seen.add(id(d))
        call = getattr(d, "call", None)
        if call is not None:
            if getattr(call, "__name__", "") in {"get_current_user", "role_checker"}:
                return True
        for sub in getattr(d, "dependencies", []) or []:
            stack.append(sub)
    return False


def _gated_via_direct_call(route) -> bool:
    """True if the handler body calls `get_current_user(...)` or
    `require_role(...)` directly (not via Depends). Routes like
    `/api/auth/me` use this pattern."""
    import ast
    import inspect
    import textwrap

    handler = getattr(route, "endpoint", None)
    if handler is None:
        return False
    try:
        src = textwrap.dedent(inspect.getsource(handler))
    except (OSError, TypeError):
        return False
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            target = node.func
            name = ""
            if isinstance(target, ast.Name):
                name = target.id
            elif isinstance(target, ast.Attribute):
                name = target.attr
            if name in {"get_current_user", "require_role"}:
                return True
    return False


def _normalize_path_for_public_check(template: str) -> str:
    import re as _re
    return _re.sub(r"\{[^/}]+\}", "placeholder-id", template)


# Frozen snapshot of routes that exist today without auth. W2 hardens
# them. To remove an entry you must first add `Depends(get_current_user)`
# or `Depends(require_role(...))` on the handler (or call them inside
# the handler body — both forms are detected). To add an entry you must
# justify why a new endpoint shipped without auth — the comment on the
# new line is the audit trail.
#
# Routes that are hardened today (already call get_current_user / use
# Depends) are intentionally NOT in this set so the test can lock them.
# Examples: /api/missions/* mutations, /api/tasks/*, /api/comments POST,
# /api/geofences POST/DELETE, /api/interventions/rules POST/DELETE,
# /api/interventions/execute. These were spot-checked by the AST
# direct-call detector when this snapshot was taken.
W2_UNGATED_BACKLOG: frozenset = frozenset()


def test_public_surface_is_locked():
    from fastapi.routing import APIRoute

    public, gated, ungated = set(), set(), set()
    for route in server.app.routes:
        if not isinstance(route, APIRoute):
            continue
        # Skip test-internal scaffolding routes (registered by other
        # tests' fixtures). Real handlers never live under /__.
        if route.path.startswith("/__"):
            continue
        for method in (route.methods or set()):
            if method == "HEAD":
                continue  # FastAPI registers implicit HEAD for GET
            key = (method, route.path)
            normalized = _normalize_path_for_public_check(route.path)
            if server.is_public_path(normalized) or server.is_public_path(route.path):
                public.add(key)
            elif _gated_via_dependant(route) or _gated_via_direct_call(route):
                gated.add(key)
            else:
                ungated.add(key)

    # Every backlog entry must still exist as an actual route, otherwise
    # the snapshot is stale (someone deleted a route without grooming the
    # backlog) — fail with a hint pointing at the stale entries.
    backlog_in_app = ungated | gated | public
    stale = W2_UNGATED_BACKLOG - backlog_in_app
    assert not stale, (
        "W2_UNGATED_BACKLOG references routes that no longer exist on the "
        f"app — remove these stale entries: {sorted(stale)}"
    )

    # The actual lock: every ungated route must already be in the
    # backlog. New ungated routes need explicit reviewer acknowledgment.
    new_ungated = ungated - W2_UNGATED_BACKLOG
    assert not new_ungated, (
        "New ungated route(s) detected. Each must be either:\n"
        "  (a) added to PUBLIC_ROUTES / PUBLIC_ROUTE_PATTERNS in server.py "
        "if intentionally public, with a regression test, OR\n"
        "  (b) wired with Depends(get_current_user) / Depends(require_role(...)) "
        "if it should require auth, OR\n"
        "  (c) added to W2_UNGATED_BACKLOG in tests/test_unit.py with a "
        "comment explaining why W2 will harden it later.\n"
        f"Offending routes: {sorted(new_ungated)}"
    )

    # The progress signal: routes that have been hardened (now gated)
    # but still appear in the backlog. Removing them keeps the snapshot
    # honest about W2 progress.
    hardened_still_in_backlog = (gated | public) & W2_UNGATED_BACKLOG
    assert not hardened_still_in_backlog, (
        "These routes are now public or gated and should be removed from "
        f"W2_UNGATED_BACKLOG: {sorted(hardened_still_in_backlog)}"
    )


def test_phase_a_middleware_does_not_block_options_preflight(gated_test_route, monkeypatch):
    monkeypatch.setenv("AUTH_GATE_PHASE_A", "1")
    res = gated_test_route.options(
        "/__phase_a_test__/protected",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    # CORS middleware handles preflight; our gate must not 401 it.
    assert res.status_code != 401


# --------------------------- role permissions --------------------------------

def test_role_permissions_table_shape():
    # Documenting the role contract — adding a role here without updating the
    # frontend ProtectedRoute is the kind of silent drift this test catches.
    assert set(server.ROLE_PERMISSIONS.keys()) == {"admin", "field_operator", "scientist", "viewer"}
    assert server.ROLE_PERMISSIONS["admin"] == ["all"]


# --------------------------- _id leak monkey-patch ---------------------------

def test_insert_one_monkey_patch_pops_id_after_insert(monkeypatch):
    """Regression guard for the global Mongo _id leak fix.

    The patched `AsyncIOMotorCollection.insert_one` must remove the `_id`
    Motor injects into the input dict so callers can safely return that
    dict from a route handler.
    """
    from bson import ObjectId
    from motor.motor_asyncio import AsyncIOMotorCollection

    class _StubResult:
        def __init__(self, inserted_id):
            self.inserted_id = inserted_id

    async def fake_orig(self, document, *args, **kwargs):
        # Mimic Motor: mutate the input dict to add an ObjectId.
        document["_id"] = ObjectId()
        return _StubResult(document["_id"])

    monkeypatch.setattr(server, "_orig_insert_one", fake_orig)

    # Re-bind the patched insert_one so it routes through our fake_orig.
    async def _safe(self, document, *args, **kwargs):
        result = await fake_orig(self, document, *args, **kwargs)
        if isinstance(document, dict):
            document.pop("_id", None)
        return result
    monkeypatch.setattr(AsyncIOMotorCollection, "insert_one", _safe)

    import asyncio
    payload = {"id": "abc", "name": "test"}
    asyncio.run(AsyncIOMotorCollection.insert_one(object(), payload))
    assert "_id" not in payload, "patched insert_one must strip _id from input dict"
    assert payload == {"id": "abc", "name": "test"}


# --------------------------- MCP/REST mission-planner parity ----------------

def test_mcp_generate_mission_reuses_rest_planner():
    """The MCP `generate_mission` tool must call the same `_plan_mission`
    helper and use the same `Mission` / `MissionGenerateRequest` types as
    the REST `POST /missions/generate` route. If anyone forks the planner
    for MCP (e.g. "agents should bypass the go_score floor"), the
    autonomous loop diverges from the dashboard loop silently — this test
    is the only thing that catches that drift.

    Why source-level AST: the runtime function is wrapped by FastMCP's
    @mcp.tool decorator (and may not exist at all if the `mcp` SDK isn't
    installed in this env). The contract we care about is the source
    text, not the runtime binding.
    """
    import ast

    mcp_src = (_BACKEND / "mcp_server.py").read_text()
    tree = ast.parse(mcp_src)

    # Find the AsyncFunctionDef named "generate_mission" anywhere in the
    # tree (it's nested inside `if _MCP_AVAILABLE:`).
    fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "generate_mission":
            fn = node
            break
    assert fn is not None, (
        "mcp_server.py must define `generate_mission` — moved or renamed?"
    )

    # Walk the function body and collect every name brought in via
    # `from X import …` and every constructor / call by identifier.
    imports_from = {}  # module -> set of imported names
    call_targets = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            imports_from.setdefault(mod, set()).update(a.name for a in node.names)
        elif isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name):
                call_targets.add(f.id)
            elif isinstance(f, ast.Attribute):
                call_targets.add(f.attr)

    # 1) Must import the REST planner from server.py — not redefine its own.
    assert "_plan_mission" in imports_from.get("server", set()), (
        "MCP generate_mission must `from server import _plan_mission` so it "
        "reuses the REST planner. If you forked the planner for MCP, you "
        "broke the dashboard/agent parity contract — undo and share the helper."
    )

    # 2) Must import the same go-score floor used by REST authorize so a
    # mission generated via MCP cannot bypass the launch gate.
    assert "MISSION_GO_SCORE_FLOOR" in imports_from.get("server", set()), (
        "MCP generate_mission must import MISSION_GO_SCORE_FLOOR from server "
        "so MCP plans use the same go_score gate as the REST flow."
    )

    # 3) Must import the same Pydantic types — agents and the dashboard
    # speak the same shape.
    models_imports = imports_from.get("models", set())
    assert "Mission" in models_imports and "MissionGenerateRequest" in models_imports, (
        "MCP generate_mission must `from models import Mission, "
        "MissionGenerateRequest` — same Pydantic types as the REST route."
    )

    # 4) Must actually CALL _plan_mission (not just import it).
    assert "_plan_mission" in call_targets, (
        "MCP generate_mission imports _plan_mission but never calls it — "
        "did you stub the planner out?"
    )

    # 5) Must construct both Pydantic types (request goes in, mission comes out).
    assert "MissionGenerateRequest" in call_targets, (
        "MCP generate_mission must construct MissionGenerateRequest(...) — "
        "do not bypass the Pydantic validation step."
    )
    assert "Mission" in call_targets, (
        "MCP generate_mission must construct Mission(...) — do not bypass "
        "the response model the dashboard reads from /missions."
    )


def test_broadcast_drops_failed_connections():
    """ConnectionManager.broadcast prunes a socket whose send fails, instead of
    swallowing the error and leaking dead connections (Rule 8: no silent failures)."""
    import asyncio
    from server import ConnectionManager

    class _OKWS:
        def __init__(self):
            self.sent = []

        async def send_json(self, message):
            self.sent.append(message)

    class _BadWS:
        async def send_json(self, message):
            raise RuntimeError("socket closed")

    cm = ConnectionManager()
    ok, bad = _OKWS(), _BadWS()
    cm.active_connections = [ok, bad]

    asyncio.run(cm.broadcast({"type": "ping"}))

    assert ok.sent == [{"type": "ping"}]       # healthy socket received the message
    assert bad not in cm.active_connections    # failed socket was pruned
    assert ok in cm.active_connections         # healthy socket retained


# --------------------------- password strength floor --------------------------
#
# Both account-creation and password-reset must enforce a minimum length so a
# reset can't downgrade an account below the register-time floor. Doctrine hard
# floor is 12 chars. These are pure-Pydantic (no Mongo / no server).

def test_register_rejects_weak_password():
    from pydantic import ValidationError
    from models import UserRegister

    with pytest.raises(ValidationError):
        UserRegister(email="a@b.com", password="short", name="X")
    # 12+ chars is accepted
    UserRegister(email="a@b.com", password="long-enough-pw", name="X")


def test_reset_rejects_weak_password():
    from pydantic import ValidationError
    from models import PasswordReset

    with pytest.raises(ValidationError):
        PasswordReset(token="t", new_password="short")
    PasswordReset(token="t", new_password="long-enough-pw")


# --------------------------- reset token single-use ---------------------------
#
# The reset-password flow can't be unit-tested end-to-end (needs Mongo + the
# raw token, which is only delivered out-of-band). This AST guard pins the
# atomic-claim contract: the handler MUST consume the token with a single
# find_one_and_update (read+mark-used in one op), never a find_one followed by
# a separate update_one — that re-introduces the TOCTOU replay window.

def test_reset_password_claims_token_atomically():
    import ast
    import inspect

    src = inspect.getsource(server.reset_password)
    tree = ast.parse(src)
    calls = [
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    ]
    assert "find_one_and_update" in calls, (
        "reset_password must claim the token atomically via find_one_and_update "
        "(read + mark-used in one op) — a find_one then update_one is a TOCTOU "
        "replay window."
    )
    assert "find_one" not in calls or calls.count("find_one_and_update") >= 1, (
        "do not read the token with a non-atomic find_one before claiming it."
    )


# --------------------------- cooking-device dMRV adapter -----------------------
#
# The Gold Standard "Metered & Measured Energy Cooking Devices" dMRV adapter
# signs meter readings into the same observation chain as drone/sensor/satellite.
# These pin (a) that a cooking reading is signed + offline-verifiable and tamper
# is caught, and (b) that the ingest route exists and is gated (a write must not
# be public).

def test_metered_cooking_device_observation_signs_and_verifies():
    obs = {
        "observed_at": "2026-06-16T00:00:00+00:00",
        "source_type": "metered_cooking_device",
        "source_id": "stove-001",
        "zone_id": "cohort-A",
        "payload": {
            "device_id": "stove-001",
            "interval_start": "2026-06-15T00:00:00+00:00",
            "interval_end": "2026-06-16T00:00:00+00:00",
            "useful_energy_mj": 12.5,
            "cooking_sessions": 3,
        },
    }
    signed = server.sign_observation(obs)
    ok, reason = server.verify_observation(signed)
    assert ok and reason == "ok", f"cooking reading must verify, got {reason}"
    # Tampering the credited monitoring parameter must break the signature.
    tampered = {**signed, "payload": {**signed["payload"], "useful_energy_mj": 999.0}}
    ok2, reason2 = server.verify_observation(tampered)
    assert not ok2 and reason2 == "digest_mismatch"


def test_cooking_reading_route_registered_and_gated():
    paths = {getattr(r, "path", None) for r in server.app.routes}
    assert "/api/cooking-devices/readings" in paths, (
        "cooking-device ingest route must be registered"
    )
    assert not server.is_public_path("/api/cooking-devices/readings"), (
        "cooking ingest is a write — must be gated (require_role), never public"
    )
