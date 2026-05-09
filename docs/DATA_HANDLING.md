# Data Handling — What We Collect, Where It Lives, What's Public

> **Audience.** Pilot partners, prospective partners, anyone whose data might end up in the chain. **Goal:** be honest about what's public-by-design, what stays private, what we retain, and what we delete.
>
> **This is not a legal document.** It's a candid technical description of platform behavior so you can decide whether the trade-offs work for your project. If your jurisdiction or institution requires a formal DPA / GDPR record / IRB-style data plan, ping us and we'll draft one.

---

## 1. What we collect

| Category | Examples | Where it's stored |
| --- | --- | --- |
| **Account data** | Email address, hashed password (bcrypt), display name, role, last-login timestamp | `users` collection in MongoDB. Never written to the public observation chain. |
| **Zone definitions** | Zone name, polygon coordinates, biome classification, priority, the user who created it | `zones` collection. **Public-readable** — listed on `/api/zones` (currently ungated; subject to future Phase A auth gate). |
| **Observations** | Source type, timestamp, zone link, payload (varies by type), Ed25519 signature, key id, content digest | `observations` collection. **Public-readable** — that's the whole point of the chain. |
| **Camera-trap / drone imagery** | Image bytes you upload via `POST /api/species/identify-upload` | Currently **content-hashed and signed** (the hash is in the chain), but the raw image bytes are also persisted server-side for re-classification. Raw image storage location: same MongoDB instance. |
| **Operational telemetry** | Drone positions, battery, sensor readings | Same `observations` collection. Public. |
| **Logs** | Server access logs, audit trail of state-changing actions | Server-side only. Retained per Railway's default log retention. Not in the chain. |

If a category isn't on this list and you think it should be, ask. We'll either add it or correct the doc.

---

## 2. What's public, what's private

### Public by design (the chain is the product)

These are reachable without authentication, by anyone with the URL, today and as long as the platform exists:

- The Ed25519 verification key (`/.well-known/keys.json`)
- The list of observations and their signatures (`/api/observations`, `/api/observations/{id}`)
- Per-zone aggregate roots (`/api/zones/{id}/attestation`)
- Aggregate chain stats (`/api/public/provenance/stats`)
- Zone names, biomes, polygons (today; the surface lock test currently allows this)
- Public dashboard summary (`/api/public/dashboard`)

If any of the above being public is a problem for your pilot, **stop and tell us before kickoff**. We can scope around it (private zones are a v0.2 feature) but we cannot quietly hide observations after the fact — every signed record is meant to be findable.

### Private (auth-gated)

These require an authenticated session and are scoped to your role:

- Account credentials (email, hashed password)
- User management (`/api/auth/users` and role assignment)
- Operational telemetry beyond what's signed into the chain
- Internal admin endpoints (`/api/seed`, `/api/_internal/drone-tick`)

When `AUTH_GATE_PHASE_A` flips on (W2 work, currently default-off), the boundary becomes mechanical — anything not in `PUBLIC_ROUTES` returns 401 to anonymous callers.

---

## 3. Sensitive data — what to redact before submission

The chain is publicly verifiable, which means anything you sign is potentially read by anyone. Some kinds of data should be redacted *before* you upload them:

- **Poaching-relevant geographic data.** Camera-trap GPS coordinates of endangered species attract poachers. If your zone has rhinos, pangolins, jaguars, or anything similarly sensitive, **fuzz the coordinates to a 5-10 km grid** before submission, or use a zone-level polygon rather than per-observation GPS. We have a `fuzz_geo` flag in design (not shipped yet); for now, redact client-side.
- **Personally identifying information in imagery.** If your camera traps occasionally capture humans (rangers, researchers, accidental tourists, poachers themselves), do not submit those frames. There's no legitimate reason for the chain to carry human imagery, and several reasons not to.
- **Sensor readings that map back to individual humans.** Acoustic sensor recordings that include human voices, GPS traces of named rangers, etc. Same logic — out of scope for the chain.

If you accidentally submit something that should have been redacted, **tell us immediately**. The signed observation cannot be retroactively unsigned (that's the point of the chain), but we can mark the observation as `redacted=true` so consumers know to ignore it. The signature stays valid; the content stays in the chain; downstream systems are expected to honor the flag.

---

## 4. Retention

| Data | Retention |
| --- | --- |
| Signed observations | **Permanent** — append-only chain. We cannot delete them without breaking integrity. This is the load-bearing property of the platform. |
| Raw image / sensor bytes (the input that produced an observation) | Retained indefinitely by default. Pilot partners can request **30-day retention only** at onboarding; after 30 days we keep the content hash in the chain but discard the raw bytes. |
| Account data | Retained while the account is active. On account deletion, retained 30 days for backup recovery, then deleted from the live database. Backup tapes (if any) follow Railway's retention. |
| Server logs | Railway default (~30 days for stdout-style logs at time of writing). |

---

## 5. Deletion

- **Account deletion:** request via email; we delete the account row and revoke all sessions within 7 business days. Your historical observations remain in the chain (signed by your zone, attributable to it via `source_id`), but the account that created them is removed.
- **Zone deletion:** we mark the zone `deleted=true` rather than removing the row, so historical observations referring to it remain interpretable. The zone disappears from `/gaia-prime` and the public dashboard within ~5 minutes.
- **Observation deletion:** **not supported by design**. The chain is append-only. The closest equivalent is the `redacted=true` flag from §3 above.
- **Public-key rotation:** if our private key is ever compromised, we publish a new key id at `/.well-known/keys.json` and announce the rotation. Observations signed under the old key remain verifiable using the historic key (which we keep published in a `revoked` array). Any observations signed *after* the announced rotation date with the old key are not legitimate.

---

## 6. Sharing — who else sees your data

- **The public**, via the endpoints in §2. This is intentional.
- **Us**, the operators of the platform, for the purpose of running the platform. We do not sell, trade, or feed pilot data to third-party advertising/analytics platforms.
- **Subprocessors:** MongoDB (storage), Railway (hosting), OpenAI / Anthropic *only if* you have a real API key wired in (the species classifier and AI advisor; default-off). We do not call out to LLM APIs with your data unless explicitly enabled.
- **Auditors and reviewers:** anyone, by design — that's the chain. They see what's in §2.

We do not have a "partner data lake" or "anonymous dataset" we sell. If we ever build one, it ships with explicit opt-in and a price tag.

---

## 7. Open questions / what we don't yet handle

In the spirit of `METHODOLOGY_v0.1.md` §6 — these gaps exist:

1. **No formal DPA.** If your institution requires a Data Processing Addendum to commit to a pilot, we'll draft one. We have not pre-built a generic template.
2. **No SOC 2, ISO 27001, or similar certifications.** Pre-revenue. Realistic on a Series A timeline.
3. **No region-specific hosting.** All data sits in Railway's default region. If your jurisdiction (EU, UK, Canada, etc.) requires data residency, raise it before kickoff — we can self-host on a regional cloud for an enterprise pilot but it's not part of the standard offering.
4. **No PII redaction tooling on the platform itself.** §3 above relies on client-side redaction. v0.2 candidate: server-side redact-on-ingest filters.

If any of these is a blocker, tell us before kickoff. None of them is hidden; we'd rather walk away from a pilot than over-promise on data handling.

---

*Last updated: 2026-05-09.*
