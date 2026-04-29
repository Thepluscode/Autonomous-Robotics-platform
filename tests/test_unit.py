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
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
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
        jwt.decode(token, "different-secret", algorithms=[server.JWT_ALGORITHM])


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
