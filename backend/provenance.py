"""Signed observation chain — the foundation of the verifiable rewilding layer.

Every observation we record (drone telemetry, robot status, sensor reading,
zone state transition) is hashed with SHA-256 over a canonical serialization
and signed with an Ed25519 key. The public key is exposed at
``/.well-known/keys.json`` so external verifiers — credit issuers (Verra,
Gold Standard), regulators, downstream auditors — can independently confirm
that an observation came from this platform and hasn't been tampered with,
without trusting our servers.

Key management
--------------
Order of preference for the signing key (deterministic across restarts):

1. ``OBSERVATION_PRIVATE_KEY_B64`` env var — raw 32-byte Ed25519 private key
   in base64. Set this once in production and never rotate without
   coordinating with downstream verifiers (rotation breaks the chain).

2. Fallback: HKDF-derive from ``JWT_SECRET``. Keeps the key stable across
   restarts as long as JWT_SECRET is. Rotating JWT_SECRET also rotates the
   chain — intentional, but document this so prod operators know.

The key id is the first 16 hex chars of SHA-256(public_key_bytes), which
makes it stable, deterministic, and small enough to embed in observations.

Why this is a moat
------------------
Software competitors can clone the dashboard in three months. They cannot
clone six months of *signed* zone observations. Once this log exists, the
platform IS the source of truth for the zones it covers — and conservation
credits issue against trusted measurement, not pretty charts.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Optional, Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


_PRIVATE_KEY: Optional[Ed25519PrivateKey] = None
_KEY_ID: Optional[str] = None


def _derive_key_from_secret(seed: bytes) -> Ed25519PrivateKey:
    """HKDF-derive an Ed25519 private key from a shared secret."""
    raw = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"observation-chain-v1",
        info=b"ed25519-signing-key",
    ).derive(seed)
    return Ed25519PrivateKey.from_private_bytes(raw)


def _load_signing_key() -> Ed25519PrivateKey:
    explicit = os.environ.get("OBSERVATION_PRIVATE_KEY_B64", "").strip()
    if explicit:
        return Ed25519PrivateKey.from_private_bytes(base64.b64decode(explicit))
    jwt_secret = os.environ.get("JWT_SECRET", "").encode("utf-8")
    if not jwt_secret:
        raise RuntimeError(
            "observation signing key unavailable: set OBSERVATION_PRIVATE_KEY_B64 "
            "or JWT_SECRET (used to derive a stable signing key via HKDF)."
        )
    return _derive_key_from_secret(jwt_secret)


def _get_private_key() -> Ed25519PrivateKey:
    global _PRIVATE_KEY
    if _PRIVATE_KEY is None:
        _PRIVATE_KEY = _load_signing_key()
    return _PRIVATE_KEY


def public_key_bytes() -> bytes:
    return _get_private_key().public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def get_key_id() -> str:
    global _KEY_ID
    if _KEY_ID is None:
        _KEY_ID = hashlib.sha256(public_key_bytes()).hexdigest()[:16]
    return _KEY_ID


def public_key_jwk() -> dict:
    """JWK-shaped public key for /.well-known/keys.json. Compatible with
    standard JOSE / JWT verifiers — Ed25519 is OKP/Ed25519 in JWK terms."""
    pub = public_key_bytes()
    return {
        "kty": "OKP",
        "crv": "Ed25519",
        "use": "sig",
        "alg": "EdDSA",
        "kid": get_key_id(),
        "x": base64.urlsafe_b64encode(pub).rstrip(b"=").decode("ascii"),
    }


def _canonical_body(observation: dict) -> bytes:
    """Canonical serialization over the *content* fields only.

    `id`, `digest`, `signature`, `key_id`, and `alg` are explicitly NOT
    part of the signed body — they describe the observation, they don't
    define it. Sort keys + tight separators give a deterministic byte
    string that any language can reproduce.
    """
    body = {k: observation[k] for k in ("observed_at", "source_type", "source_id", "zone_id", "payload") if k in observation}
    return json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_observation(observation: dict) -> dict:
    """Returns the observation enriched with `digest`, `signature`,
    `key_id`, and `alg`. The input is not mutated."""
    body = _canonical_body(observation)
    digest = hashlib.sha256(body).hexdigest()
    sig = _get_private_key().sign(body)
    return {
        **observation,
        "digest": digest,
        "signature": base64.b64encode(sig).decode("ascii"),
        "key_id": get_key_id(),
        "alg": "Ed25519",
    }


def verify_observation(
    observation: dict, public_key: Optional[Ed25519PublicKey] = None
) -> Tuple[bool, str]:
    """Returns (ok, reason). Reasons: ok | digest_mismatch |
    missing_signature | signature_invalid. Audit-friendly."""
    body = _canonical_body(observation)
    expected_digest = hashlib.sha256(body).hexdigest()
    if observation.get("digest") != expected_digest:
        return False, "digest_mismatch"
    sig_b64 = observation.get("signature")
    if not sig_b64:
        return False, "missing_signature"
    pk = public_key or _get_private_key().public_key()
    try:
        pk.verify(base64.b64decode(sig_b64), body)
    except Exception:
        return False, "signature_invalid"
    return True, "ok"


async def record_observation(
    db,
    *,
    source_type: str,
    source_id: str,
    payload: dict,
    zone_id: Optional[str] = None,
    observed_at: Optional[str] = None,
) -> dict:
    """Sign and persist an observation. Returns the stored document
    (digest is the canonical reference; surface it from
    `mission.evidence.source_hashes` so downstream code can prove its
    inputs)."""
    import uuid
    from datetime import datetime, timezone as _tz
    obs = {
        "id": str(uuid.uuid4()),
        "observed_at": observed_at or datetime.now(_tz.utc).isoformat(),
        "source_type": source_type,
        "source_id": source_id,
        "zone_id": zone_id,
        "payload": payload,
    }
    signed = sign_observation(obs)
    await db.observations.insert_one(signed)
    return signed
