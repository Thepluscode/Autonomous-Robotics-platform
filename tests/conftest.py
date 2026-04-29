"""Pytest fixtures for the Autonomous Ecosystem Architect API.

These tests run against a *live* backend (so they exercise MongoDB, JWT, and
background tasks for real). Set BACKEND_URL to point at a different host;
default is http://localhost:8001. The whole module is skipped if the backend
is unreachable so a missing dev server doesn't masquerade as a test failure.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests


def _base_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="session")
def base_url() -> str:
    return _base_url()


@pytest.fixture(scope="session")
def _require_live_backend(base_url: str) -> None:
    """Skip the test if the backend isn't responding.

    Pulled in via the `api` fixture so HTTP-driven tests skip when the dev
    server is down, but pure unit tests (which never request `api`) continue
    to run.

    Verifies the response shape too — port 8001 is a popular dev port and
    a different FastAPI app answering on it would return 200 for `/api/`
    but with the wrong payload, leading to confusing test failures.
    """
    try:
        r = requests.get(f"{base_url}/api/", timeout=3)
        r.raise_for_status()
        payload = r.json()
        if "Autonomous Ecosystem Architect" not in payload.get("message", ""):
            raise RuntimeError(
                f"server at {base_url} responded but is not this project's "
                f"backend (got: {payload!r})"
            )
    except Exception as exc:
        pytest.skip(f"Backend not reachable at {base_url} ({exc!s})", allow_module_level=True)


@pytest.fixture(scope="session")
def api(base_url: str, _require_live_backend) -> "ApiClient":
    return ApiClient(base_url)


@pytest.fixture(scope="session")
def seeded(api: "ApiClient", admin_token: str) -> None:
    """POST /api/seed once per session so list endpoints aren't empty.

    /seed is admin-gated, so we attach the session admin token here rather
    than asking every test to pass auth headers explicitly.
    """
    api.post("/seed", headers={"Authorization": f"Bearer {admin_token}"})


@pytest.fixture(scope="session")
def admin_token(api: "ApiClient") -> str:
    """Log in as admin (created on backend startup) and return the access token."""
    email = os.environ.get("ADMIN_EMAIL", "admin@ecosystem.com")
    password = os.environ.get("ADMIN_PASSWORD", "EcoAdmin2024!")
    res = api.post("/auth/login", json={"email": email, "password": password})
    if res.status_code != 200:
        pytest.skip(f"Admin login failed ({res.status_code}): {res.text[:200]}")
    return res.json()["access_token"]


@pytest.fixture
def auth_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


class ApiClient:
    """Thin wrapper that prefixes /api and tracks created resources for cleanup."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self._cleanup: list[tuple[str, str]] = []  # (method, path)

    def _url(self, path: str) -> str:
        if path.startswith("/api"):
            return f"{self.base_url}{path}"
        return f"{self.base_url}/api{path if path.startswith('/') else '/' + path}"

    def get(self, path, **kw):
        return self.session.get(self._url(path), timeout=15, **kw)

    def post(self, path, **kw):
        return self.session.post(self._url(path), timeout=30, **kw)

    def put(self, path, **kw):
        return self.session.put(self._url(path), timeout=15, **kw)

    def delete(self, path, **kw):
        return self.session.delete(self._url(path), timeout=15, **kw)

    def track(self, method: str, path: str) -> None:
        self._cleanup.append((method.upper(), path))


@pytest.fixture
def unique_name() -> str:
    return f"pytest-{uuid.uuid4().hex[:8]}"
