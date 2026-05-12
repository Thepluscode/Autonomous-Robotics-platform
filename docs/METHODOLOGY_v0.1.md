# Methodology v0.1 — What We Claim, How We Measure

> **Audience.** Reviewers from Verra, Gold Standard, Climate Action Reserve, regen.network, Pachama, Sylvera, in-house compliance, or any third party deciding whether the platform's restoration claims are defensible. This document is the *methodology* companion to `AUDITOR_WALKTHROUGH.md` (the *verification procedure*) and `THREAT_MODEL.md` (the *adversary analysis*).
>
> **Status.** v0.1 — pre-review. This is the document we want feedback on. Sections deliberately left thin are marked **[OPEN]** so reviewers can prioritize.

---

## 1. Scope of the claim

The platform is a **chain of custody** for restoration evidence. It does *not* compute carbon credits, sequestration math, biodiversity uplift estimates, or any other claim about ecological outcomes. It produces **cryptographically defensible records of what happened** so that a downstream methodology (Verra VM0048, Gold Standard's own MRV, etc.) has trustworthy inputs.

What that means concretely:

| The platform claims | The platform does NOT claim |
| --- | --- |
| "Robot R reported soil_moisture=0.42 at zone Z, time T, signed by key K" | "Soil moisture in zone Z is healthy" |
| "Camera trap C captured an image hash H at zone Z, classified as species S with confidence 0.88" | "Species S is present in zone Z" |
| "Intervention I was authorized at T₀, executed at T₁, post-state recorded at T₂; all three observations signed" | "Intervention I produced a 14% biodiversity uplift" |
| "Aggregate root over 7-day signed-observation digests for zone Z is `<sha256>`" | "Zone Z is on track to sequester N tonnes CO₂e" |

The claims we make are **local, signed, timestamped, and hashed**. The claims we *do not* make are the model-derived inferences that depend on a methodology framework — which is what we want a real auditor to choose, not what we want to invent.

---

## 2. Source-witness types

Every record in the chain has a `source_type` declaring what kind of observation it is. Mixing across types is what makes a claim defensible — a single source can lie; three independent sources signing about the same event are exponentially harder to fake.

Current types (verifiable in code at `backend/server.py` and `backend/provenance.py`):

| `source_type` | What it is | Independence rationale |
| --- | --- | --- |
| `drone_telemetry` | Position, battery, mission, zone heading from a deployed drone tick | Physical asset reports its own state |
| `species_identification` | Output of the species classifier on a camera-trap or drone image | Image content + classifier output, both signed |
| `intervention_before` | State snapshot of zone Z immediately before action A is executed | Independent witness of pre-state |
| `intervention_action` | The action itself (kind, parameters, executing robot) | Operator-side record |
| `intervention_after` | State snapshot of zone Z immediately after action A | Independent witness of post-state |
| `satellite_image_hash` | Sentinel-2 L2A scene reference: scene id, acquisition timestamp, cloud cover, thumbnail SHA-256, canonical Element84 STAC URL | **Cross-witness from a source the platform operator does not control.** Fetched from Element84's earth-search STAC API, signed with the same Ed25519 key as every other observation. |

The intervention triple (`before` / `action` / `after`) is the load-bearing primitive for *intervention* claims: any restoration intervention is reducible to one of these triples plus the signed sensor stream that brackets it. `satellite_image_hash` is the load-bearing primitive for *cross-witness* — auditors verify the platform's claims against a public satellite record that we cannot rewrite.

The satellite witness loop is **default-OFF** (`SATELLITE_WITNESS_ENABLED=1` to enable). Production deploys turn it on; local dev leaves it off so `pytest` doesn't make network calls. Cadence is 6 hours by default (Sentinel-2 revisits each location every 5 days, so faster polling wastes free API quota without surfacing new data). The auditor verification flow for a satellite witness: fetch the canonical STAC item from `payload.stac_url`, recompute the body digest, verify the signature, then independently download the thumbnail from `payload.thumbnail_url` and confirm `SHA-256` matches `payload.thumbnail_sha256`.

**[OPEN]** v0.2 candidates: `human_inspection` (human-attested visit), `lab_assay` (e.g., soil sample lab report).

---

## 3. Cryptographic primitives

All choices are deliberately boring — algorithms with multi-decade safety records and broad library support, so any auditor's existing tooling works.

| Primitive | Choice | Why |
| --- | --- | --- |
| Digital signature | **Ed25519** (RFC 8032) | Same algorithm as TLS 1.3, SSH, Apple Sign-In. Constant-time, no parameter choices, 100µs to verify on commodity hardware. |
| Public key publication | **JWK at `/.well-known/keys.json`** (RFC 8037 OKP/Ed25519) | Standard discovery path; works with every JOSE-compatible library. |
| Body digest | **SHA-256** of canonical-JSON serialization of `{observed_at, source_type, source_id, zone_id, payload}` | Matches the body the signature commits to — auditors can re-derive without our code. |
| Aggregate root (per zone) | `SHA-256` of the **sorted, newline-joined** list of observation digests within the lookback window | Order-independent, O(n), v1; v2 will upgrade to a real Merkle tree once N grows. |
| Key derivation (default) | **HKDF-SHA256** from `JWT_SECRET` | Stable across server restarts without storing a separate key file. |
| Key override | `OBSERVATION_PRIVATE_KEY_B64` env var (raw 32-byte Ed25519) | Production deployments use this; HKDF fallback is for dev. |

The aggregate-root choice (sorted-and-hashed) is intentional v1 simplicity. The reviewer should note it produces a deterministic root but does NOT support inclusion proofs (you can't prove a single observation is in the root without listing all of them). That's a v2 upgrade to a real Merkle tree, scoped only when N per zone per window passes ~10⁴.

---

## 4. Time and lookback

- **Timestamps** are ISO-8601 UTC, written by the server at observation creation. Clock skew is bounded by the host clock (Railway production = NTP-synced). [OPEN] We do not yet timestamp-anchor to an external time source (e.g., Roughtime, OpenTimestamps).
- **Lookback window** for the public attestation endpoint (`GET /api/zones/{id}/attestation?hours=N`) is capped at **`ATTESTATION_MAX_HOURS = 168`** (7 days). The cap exists so an unauthenticated request cannot bulk-export the entire chain in one call. Auditors needing longer windows paginate via `since`/`until`.

---

## 5. What's verifiable end-to-end today

| Check | Endpoint | Auth | Status |
| --- | --- | --- | --- |
| Public key published | `GET /.well-known/keys.json` | None | ✅ |
| List recent observations | `GET /api/observations?zone_id=&since=&limit=` | None | ✅ |
| Single observation + verification | `GET /api/observations/{id}` | None | ✅ |
| Verify any signed payload | `POST /api/observations/verify` | None | ✅ |
| Zone aggregate root (last 7 d) | `GET /api/zones/{id}/attestation?hours=N` | None | ✅ |
| Chain stats (counts by source) | `GET /api/public/provenance/stats` | None | ✅ |
| End-to-end auditor walkthrough | `docs/AUDITOR_WALKTHROUGH.md` | — | ✅ |

The auditor walkthrough has a **30-line `verify_claim.py`** that runs offline using only `cryptography` and walks an intervention triple cold. Time-to-verify for a reviewer with `curl + python3` installed: ~10 minutes.

---

## 6. Known limitations (in v0.1)

These are listed *because* they're known. An auditor reading this should compare against industry-standard MRV requirements and tell us which gaps matter most.

1. **Single-operator chain.** The platform is the only signer. A v2 that admits multiple operators with separate keys, cross-signing each other's observations, would be substantially harder to spoof — but that's a coordination problem we haven't yet solved.
2. **Species classifier is `deterministic-v1`.** The default is a curated 25-species biome taxonomy with content-hash variation, not a real vision model. BioCLIP is plumbed (`SPECIES_IDENTIFIER=bioclip` env) but disabled by default. Every species observation records its `method` field, so a reviewer can filter by `method == "bioclip"` to see only model-grade IDs.
3. **Satellite cross-witness shipped, but Sentinel-2 only.** The chain now records `satellite_image_hash` observations from Element84's earth-search STAC API (Sentinel-2 L2A, ESA-operated, free, no API key required). Planet Labs / Maxar / commercial high-resolution sources are not yet integrated — that's a v0.2 candidate when the cost case justifies it. For most rewilding claims at zone-scale, Sentinel-2's 10-meter resolution and 5-day revisit are sufficient.
4. **No external time anchor.** Server-issued timestamps are trust-but-verify against the NTP-synced host. Anchoring to Roughtime or OpenTimestamps would close that gap.
5. **No on-chain mirror.** The chain is a Mongo collection with cryptographic integrity, not a blockchain. We deliberately do *not* tokenize or stake — premature tokenization is the dominant failure mode in this space. A read-only mirror to a public ledger (e.g., Bitcoin OP_RETURN, IPFS CID pinning) is a defensible additive primitive for v2.
6. **Aggregate root is not a Merkle tree.** See Section 3. Inclusion proofs require listing all observations; v2 should upgrade.

---

## 7. Versioning and change discipline

- This document is **`METHODOLOGY_v0.1`**. Breaking changes (definition of `source_type`, what fields are signed, aggregate-root algorithm) bump the major version and are explicitly noted.
- Any change that would invalidate previously-signed observations is **forbidden** — the chain is append-only and the signed bytes never change. New rules apply only to observations from the version-bump timestamp forward.
- The current methodology version is exposed via `GET /api/public/provenance/stats` (planned for v0.2 — flagged here so reviewers can ask for it).

---

## 8. What feedback we want

A 30-minute review by someone who has actually written or audited an MRV methodology is the next high-leverage step for this project. Specifically:

1. **Which of the v0.1 limitations are blockers, and which are acceptable in a credit-issuance context?** We assume satellite cross-witness is a blocker for forest carbon claims and acceptable for biodiversity-only claims. Confirm or correct.
2. **Is the intervention triple primitive sufficient for the methodologies you've worked with?** If not, what's the next required primitive (e.g., human-witnessed inspection? lab assay attachment?).
3. **Aggregate-root v1 or Merkle v2 first?** For the use cases you've seen, does inclusion-proof support matter today, or is the sorted-hash v1 acceptable as a starting point?
4. **What language convention should we use?** Specifically: do reviewers in your space expect "attestation," "evidence," "claim," "MRV record," or some other term as the load-bearing noun? We've been promiscuous; would like to standardize.
5. **What documentation are you missing?** Anything in your normal review flow you couldn't find in this doc + `AUDITOR_WALKTHROUGH.md` + the live endpoints.

A reviewer who returns this with even *partial* answers to those five questions converts the platform from "interesting demo" to "auditor-grade" — and lands a name on the homepage that changes the investor conversation.

---

*Last updated: 2026-05-09.*
