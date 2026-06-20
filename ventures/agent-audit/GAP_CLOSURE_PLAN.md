# Gap-Closure Plan — Agent-Decision Audit Ledger (pilot build)

Scoped against the **actual** code in `backend/provenance.py` and `backend/server.py`.
Goal: turn the existing rewilding signing layer into a generic, externally-anchored
**agent-decision audit ledger** ready for one pilot customer — with the minimum build,
not a rewrite.

## What already exists (reuse verbatim — do not rebuild)

| Capability | Where | State |
|---|---|---|
| Ed25519 signing over canonical JSON | `backend/provenance.py:124` `sign_observation` | Works. Body = `observed_at, source_type, source_id, zone_id, payload` (`_canonical_body`, line 112). **Already domain-agnostic.** |
| Sign + persist | `backend/provenance.py:159` `record_observation(db, *, source_type, source_id, payload, zone_id=None, observed_at=None)` | Works. `zone_id` already optional → repurpose as `tenant_id`/`workspace_id` for the pilot. |
| Offline verification | `backend/provenance.py:139` `verify_observation` + `POST /api/observations/verify` (`server.py:3338`) | Works. Returns `(ok, reason)`. |
| Public key publication | `public_key_jwk()` (line 98) + `GET /.well-known/keys.json` | Works. Standard JWK/OKP — any JOSE verifier reads it. |
| Aggregate root (per `zone_id`) | `GET /api/zones/{zone_id}/attestation` (`server.py:3353`) | Works. `SHA-256(sorted, newline-joined digests)`. This is the natural anchoring unit. |
| List / single fetch | `GET /api/observations` (`server.py:3200`), `GET /api/observations/{id}` (`server.py:3269`) | Works, paginated. |

**Implication:** ~70% of the pilot is already shipped. The signing/verify/publish loop is real and tested.

## The three real builds

### Build 1 — Generic authenticated ingestion endpoint  *(S, ~1–2 days)*

Today, observations are created only through typed routes (intervention triple, species,
cooking). There is **no** generic authenticated "record a decision" endpoint — the `POST`
under `/observations` is verify, the `GET` is list.

- Add `POST /api/agent-decisions` (new prefix; keep the rewilding routes untouched).
- Model in `models.py`: `AgentDecisionIn { workflow_id: str, decision_id: str, actor: str, payload: dict, tenant_id: str, observed_at: str | None }`. Validate at the boundary (Pydantic).
- Handler calls existing `record_observation(db, source_type="agent_decision", source_id=decision_id, payload={workflow_id, actor, ...}, zone_id=tenant_id, observed_at=observed_at)`.
- Gate it: `Depends(require_role([...]))` or a per-tenant API key. **Not** public — this is write.
- Rate-limit it (limiter decorator) and return the `{success, data, error}` envelope.
- **Test:** `tests/` — POST a decision → 200 + signed envelope; GET it back → `verification.valid == true`; POST with a missing field → 422.

> `ponytail:` reuse `record_observation` as-is; the only new surface is the route + model. No new signing code.

### Build 2 — External time-anchoring (OpenTimestamps)  *(M, ~3–5 days) — THE differentiator*

This is the one gap that turns "self-signed (forgeable by the operator)" into
"externally anchored (backdating is detectable)". It is what makes the ledger credible
to an auditor rather than only to a UI-clone competitor.

- **Don't anchor every decision** (slow, and Bitcoin-anchor confirmation is ~hours). Anchor the **per-tenant aggregate root** on a schedule. One OTS proof commits to every decision up to that point.
- New module `backend/anchoring.py`:
  - `tick_anchor(db, tenant_id)`: compute the aggregate root (reuse the attestation digest logic from `server.py:3353`), submit its SHA-256 to OpenTimestamps calendar servers (`opentimestamps` PyPI / `ots stamp`), store the returned `.ots` proof in `db.anchors` keyed by `(tenant_id, root_hash, created_at)`.
  - Supervised background loop `run_anchor_loop(db)` (mirror `satellite.py`'s pattern: try/except body, `asyncio.wait_for` on the network call, explicit interval `ANCHOR_INTERVAL_S`, default-OFF behind `ANCHOR_ENABLED=1`). A crashing loop must not take down the API.
- Expose `GET /api/anchors?tenant_id=…` (the `.ots` proof + the root it commits to) and a `POST /api/_internal/anchor-tick` (admin) for deterministic tests.
- Upgrade verification: extend the offline tool so the auditor (a) verifies the Ed25519 signature on a decision, (b) confirms its digest is inside an anchored aggregate root, (c) runs `ots verify` on the proof → Bitcoin block timestamp. All three offline.
- **Test:** stamp a root → store proof → `ots verify` (or a mocked calendar in CI) confirms the proof commits to that exact root; a decision inserted *after* a root was anchored is provably absent from that root.

> `ponytail:` aggregate-root anchoring, not per-event. Known ceiling: O(n) inclusion check (list all decisions to prove one is in a root). Upgrade path → Merkle tree for O(log n) inclusion proofs (defer until a tenant exceeds ~10k decisions; noted, not built).

### Build 3 — Integrity observability  *(S, ~half day)*

An operator could silently disable anchoring; an auditor wouldn't know. Close it cheaply.

- Add to a stats endpoint (extend the existing `/api/public/provenance/stats` pattern, `server.py:3146`): `last_anchor_at`, `anchor_count`, `unanchored_decision_count` per tenant.
- **Test:** after an anchor tick, `last_anchor_at` advances and `unanchored_decision_count` drops to 0.

## Deliberately NOT in the pilot (write it down so it can't creep)

- **HSM / KMS key custody.** Pilot signs with `OBSERVATION_PRIVATE_KEY_B64` (env). Note the ceiling: env-var leak = forge-anything. Roadmap item, priced separately — name it to the buyer, don't hide it.
- **Multi-signer / multi-operator attestation.** Single signer for the pilot. Roadmap.
- **Multi-tenancy as SaaS.** One dedicated instance per pilot customer. `tenant_id` exists in the data but RLS/per-tenant isolation is not hardened — fine for a single-customer deployment, blocker for self-serve.
- **Execution / HITL acting on decisions.** Out. This records; it does not act.
- **EAB deliberation board.** The multi-agent review upsell reuses EAB's hash-chained event store later; not in the first pilot.

## Honest readiness math

- New code: ~1 route + 1 model (Build 1), ~1 module + 1 loop + 2 endpoints (Build 2), ~1 stat field (Build 3). Roughly **8–12 working days** for a pilot-grade vertical slice, signing/verify/publish reused intact.
- Risk concentrated in Build 2 (OpenTimestamps integration + the offline-verify UX). De-risk first: spike `ots stamp` / `ots verify` against a calendar server on day 1 before promising the timeline.
- Every build above lands with one runnable check (doctrine Rule 2; ponytail "one check behind non-trivial logic"). No new check needed for trivial wiring.

## First action

Day-1 spike: `pip install opentimestamps-client`, stamp an arbitrary SHA-256, confirm `ots verify` returns a Bitcoin attestation. If that works end-to-end, the differentiating claim in `PILOT_OFFER.md` is real and the rest is plumbing.
