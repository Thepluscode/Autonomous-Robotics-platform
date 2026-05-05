# Auditor Walkthrough — Verifying a Restoration Claim

This document walks a third-party reviewer (Verra, Gold Standard, Climate Action Reserve, regulator, in-house compliance) through verifying that a restoration claim made by the Autonomous Robotics Platform is **cryptographically defensible** — independently, offline, without trusting our servers.

You will need: `curl`, `python3`, ~10 minutes.

---

## What you are verifying

For any restoration claim of the shape *"Robot R dropped 5 kg of native seed mix in zone Z on day D; biodiversity index moved from X to Y"*, you can confirm:

1. The platform signed the **before**, **action**, and **after** observations with its private key
2. The signature on each observation matches the platform's published public key
3. The observations have not been tampered with since they were signed
4. The aggregate state of the zone is internally consistent (no orphan or replayed entries)

If any of those checks fail, the claim is invalid. If all pass, the claim is as defensible as the strength of Ed25519 (which is the same algorithm used for signing TLS certificates, SSH keys, and Apple Sign-In tokens).

---

## Step 1 — Get the platform's public key

The platform publishes its Ed25519 verification key at the standard JWK discovery path. **There is no auth on this endpoint by design.** Anyone can fetch it.

```bash
curl https://backend-production-0e26.up.railway.app/.well-known/keys.json
```

You should see exactly this shape:

```json
{
  "keys": [{
    "kty": "OKP",
    "crv": "Ed25519",
    "use": "sig",
    "alg": "EdDSA",
    "kid": "31b2557ddc5de62a",
    "x": "<32-byte raw public key, base64url>"
  }]
}
```

Save this. The `kid` (key ID) is how every observation references this key. If you see a different `kid` on observations than the one published here, **something is wrong** — either the platform rotated its key (acceptable, with notice) or somebody is trying to spoof signatures (unacceptable).

---

## Step 2 — Walk the chain for one zone

Pick any zone you want to verify. The zones API is public:

```bash
curl https://backend-production-0e26.up.railway.app/api/zones | python3 -m json.tool
```

Pick a zone id and fetch its 24-hour attestation:

```bash
ZONE_ID=<paste-zone-id>
curl "https://backend-production-0e26.up.railway.app/api/zones/$ZONE_ID/attestation?hours=24" \
  | python3 -m json.tool
```

The response shape:

```json
{
  "zone_id": "...",
  "since": "2026-05-04T...",
  "count": 314,
  "aggregate_root": "947bd54c924b5cbfd7ce782910d87e9a39a1d4fbc1cb744068eee93d8ffc2cff",
  "key_id": "31b2557ddc5de62a",
  "observations": [
    {"id": "...", "digest": "...", "signature": "...", "key_id": "...", "observed_at": "...", "source_type": "..."},
    ...
  ]
}
```

**Verify the aggregate root yourself.** It is a SHA-256 over the sorted list of observation digests, joined with `\n`:

```python
import hashlib, json, sys
data = json.load(sys.stdin)
digests = sorted(o["digest"] for o in data["observations"] if o.get("digest"))
expected = hashlib.sha256("\n".join(digests).encode()).hexdigest()
print("server says   :", data["aggregate_root"])
print("we recomputed :", expected)
print("match         :", expected == data["aggregate_root"])
```

If `match = True`, the zone's full observation set is internally consistent. If not, somebody added/removed/altered an observation since the response was generated.

---

## Step 3 — Verify a single observation's signature

Pick any observation from the attestation. The platform's signing scheme is deterministic and reproducible:

- The signed body is the canonical JSON of `{observed_at, source_type, source_id, zone_id, payload}`
  - Sort keys, no spaces, UTF-8, `json.dumps(body, sort_keys=True, separators=(",", ":"))`
- `digest` = SHA-256 of that canonical body
- `signature` = Ed25519 of that canonical body, base64-encoded
- The verifying key is the `x` field from `/.well-known/keys.json`, base64url-decoded to 32 raw bytes

Verify in Python (zero network calls — pure offline):

```python
import base64, hashlib, json
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# 1. paste the public key (x field) from /.well-known/keys.json
PUBKEY_B64URL = "<paste-x-field>"
pub = Ed25519PublicKey.from_public_bytes(
    base64.urlsafe_b64decode(PUBKEY_B64URL + "==")
)

# 2. paste one observation from the attestation response
obs = {...}

# 3. recompute the canonical body
body_dict = {k: obs[k] for k in ("observed_at", "source_type", "source_id", "zone_id", "payload") if k in obs}
body = json.dumps(body_dict, sort_keys=True, separators=(",", ":")).encode()

# 4. check digest matches
assert hashlib.sha256(body).hexdigest() == obs["digest"], "digest tampered"

# 5. check signature
pub.verify(base64.b64decode(obs["signature"]), body)   # raises if invalid
print("OK — observation is genuine and intact")
```

The platform also provides a verification endpoint as a convenience (does the same math server-side), but **your own offline verification is what makes the chain trustless**:

```bash
curl -X POST https://backend-production-0e26.up.railway.app/api/observations/verify \
  -H 'content-type: application/json' \
  -d @observation.json
```

---

## Step 4 — Walk a restoration claim end-to-end

A restoration claim is anchored by an `Intervention` document. List recent ones:

```bash
curl https://backend-production-0e26.up.railway.app/api/interventions | python3 -m json.tool
```

Pick one and fetch it directly:

```bash
INTERVENTION_ID=<paste>
curl "https://backend-production-0e26.up.railway.app/api/interventions/$INTERVENTION_ID" \
  | python3 -m json.tool
```

Each intervention links three observation IDs:

```json
{
  "id": "0256fc0b-...",
  "action": "drop_seed_pod",
  "robot_id": "...",
  "zone_id": "...",
  "params": {"seed_mix_kg": 5.0},
  "before_observation_id": "d35e25b8-...",
  "action_observation_id": "a98e370e-...",
  "after_observation_id":  "28d520d4-...",
  "delta_applied":  {"biodiversity_index": 0.01, "vegetation_coverage": 0.005},
  "delta_observed": {"biodiversity_index": 0.01, ...},
  "verifications": [
    {"phase": "before", "valid": true, "reason": "ok", "digest": "..."},
    {"phase": "action", "valid": true, "reason": "ok", "digest": "..."},
    {"phase": "after",  "valid": true, "reason": "ok", "digest": "..."}
  ]
}
```

**Verify all three observations yourself** using Step 3's procedure. The semantics:

- **before**: the zone state at intent time. Establishes the baseline biodiversity / soil / etc.
- **action**: the verb itself, attributed to the operator or AI agent (`actor_user_name`). Locks intent.
- **after**: the zone state post-action. The `delta_observed` field is the auditable change.

A claim of the form *"we improved biodiversity by 0.01 in zone Z"* is valid iff:

1. All three signatures verify against the platform's published key.
2. The `delta_observed` is consistent with `after_state - before_state` from the linked observations' payloads.
3. The intervention's `created_at` is between the `before` and `after` observed_at timestamps (no time-travel).
4. The robot id and zone id in the action observation match the intervention record (no swap).

If all four hold: the claim is defensible.

---

## What can go wrong

| Symptom | What it means |
|---|---|
| `digest_mismatch` on any observation | The payload was edited after signing. Reject. |
| `signature_invalid` | Either the wrong key was used, or the signature was forged with a different key. Reject. |
| `key_id` on observation ≠ `kid` at `/.well-known/keys.json` | Key rotation happened. The platform should publish historical keys at `/.well-known/keys.json` (each entry in the `keys` array). If only one key is published and the historical `kid` isn't there, treat as suspicious. |
| `aggregate_root` doesn't recompute | The observation list returned was modified or filtered. Re-fetch directly; if the mismatch persists, escalate. |
| Intervention's `delta_applied` ≠ `delta_observed` | The intent and the result diverged. Could be legitimate (action partially failed) or fraud. Investigate via the action's audit log. |
| All three observations have valid signatures but `before_state` and `after_state` show no zone change | The action ran but the recovery model is too generous. Audit the action params and `compute_zone_delta` against the published code at `backend/server.py`. |

---

## Independent verification — minimum viable script

The whole verification fits in 30 lines of Python with zero proprietary dependencies. Save as `verify_claim.py`:

```python
import base64, hashlib, json, sys, urllib.request
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

BASE = "https://backend-production-0e26.up.railway.app"

def fetch(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())

# 1. get key
key = fetch("/.well-known/keys.json")["keys"][0]
pub = Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(key["x"] + "=="))

# 2. fetch intervention by id (passed as argv)
intv = fetch(f"/api/interventions/{sys.argv[1]}")

# 3. for each phase, fetch the linked observation and verify
for phase in ("before", "action", "after"):
    oid = intv[f"{phase}_observation_id"]
    obs = fetch(f"/api/observations/{oid}")
    body_dict = {k: obs[k] for k in ("observed_at","source_type","source_id","zone_id","payload") if k in obs}
    body = json.dumps(body_dict, sort_keys=True, separators=(",", ":")).encode()
    assert hashlib.sha256(body).hexdigest() == obs["digest"], f"{phase}: digest_mismatch"
    pub.verify(base64.b64decode(obs["signature"]), body)
    print(f"  {phase}: OK")

print("CLAIM VERIFIED")
```

Run:

```bash
python3 verify_claim.py <intervention-id>
```

If it prints `CLAIM VERIFIED`, the restoration claim is real, signed by the platform, and untampered — independently confirmed by your own infrastructure, without trusting our servers, in under one second.

---

## Contact

For audit-level questions about the chain, the implementation, or the schema, contact the platform team. The full source for the signing implementation lives at `backend/provenance.py` in the platform repo. The signing scheme is intentionally minimal so it can be audited in an afternoon.
