# dMRV Solution and Implementation Plan — ThePlus-Tech Signed-Evidence Layer

> **Target programme:** Gold Standard dMRV Pilot Programme (Pilot v0.1).
> **Submit to:** methodology@goldstandard.org, subject "dMRV Proposal" (English, Word format).
> **Status of this file:** DRAFT for review. `[PROVIDE: …]` marks inputs only the project team can supply (project identity, real cost figures, pilot data). Paste into the official `t-dmrv-solution-implementation-plan-pilot-v0.1.docx` before submitting. Delete all bracketed guidance.
>
> **Scope of this submission (read first):** This is a **Monitoring + Verification data-integrity layer**, scoped as a *digitised alternative to a specific monitoring parameter*. It does **not** propose new quantification or change emission-factor math. It makes the methodology's existing monitoring data **cryptographically tamper-evident and independently verifiable offline**.

---

## 1 | Project Background Information

- **1.1 Methodology:** Metered & Measured Energy Cooking Devices (Gold Standard for the Global Goals — Clean Cooking / CSA scope). *(On the dMRV priority list, Q4-2024 schedule.)*
- **1.2 Version Number:** `[PROVIDE: methodology version in force for the chosen project]`
- **1.3 Project Title:** `[PROVIDE: full title of the registered cookstove project being piloted]`
- **1.4 Project's GS ID:** `[PROVIDE: GS ID of the project/programme and VPAs]` — **the key open item: a registered project must be lined up.**
- **1.5 Project Status:** `[PROVIDE: listed / certified design / certified]`
- **1.6 Project Developer:** ThePlus-Tech (dMRV solution provider). `[PROVIDE: the carbon project developer partner, per the cover letter to GS]`
- **1.7 Scope:** Digitisation of the **metered useful-energy / device-usage monitoring parameter** for an energy-cooking-device project — specifically a cryptographic chain-of-custody and offline-verifiability layer over the meter telemetry.
- **1.8 Geographic Location:** `[PROVIDE: country/region of the chosen project]`

---

## 2 | Proposed Solution

### 2.1 Overview of the dMRV solution
A cryptographic measurement-evidence and chain-of-custody layer. Every raw observation (here, a cooking-device meter reading) is serialised canonically, SHA-256 digested, and **Ed25519-signed** with a key whose public half is published at `/.well-known/keys.json`. Any third party — a VVB, Gold Standard, or a regulator — can verify the integrity and authenticity of every reading **offline, without trusting our servers**, using ~30 lines of standard-library Python. The layer raises the accuracy, transparency, and tamper-resistance of the metered-energy monitoring data feeding the methodology, without altering how emission reductions are calculated.

### 2.2 Scope of dMRV Solution Application
**Problem:** metered-cookstove crediting depends on trusting device-usage / useful-energy data that today is typically exported from device dashboards or aggregators with no independent, tamper-evident chain of custody. Usage over-statement and post-hoc data editing are recognised integrity risks. **Scope of MRV activities digitised:** **Monitoring + Verification** (the reading is signed at capture; verification is open and offline). Reporting remains in the methodology's existing format, now backed by verifiable evidence.

### 2.3 dMRV Solution Application
- **Digitised MRV activities:** capture-time signing of each meter reading; per-zone/per-device aggregate roots; independent cross-witness (satellite where spatially relevant; for cookstoves, optional independent telemetry sources).
- **Data collection & management:** readings ingested as signed `observation` records (append-only; signed bytes never change).
- **Data analytics & automation:** automated digest + signature on every record; automated aggregate-root computation per device/cohort per window.
- **Standardised reporting:** public endpoints expose observations, single-observation verification, per-cohort attestation roots, and chain statistics.

### 2.4 Key Technologies and Methodologies
| Technology | Role | Maturity |
|---|---|---|
| **Ed25519 (RFC 8032) signatures** | Authenticity + integrity of every reading | Same primitive as TLS 1.3 / SSH; ~100µs verify |
| **SHA-256 canonical-JSON digest** | Tamper-evidence; auditor re-derives without our code | Standard |
| **Published JWK (`/.well-known/keys.json`)** | Offline key discovery for verifiers | RFC 8037 |
| **Append-only signed chain (per-record `prev_hash`/`entry_hash`)** | Ordering + non-repudiation of the evidence ledger | Production |
| **Independent cross-witness** (Sentinel-2 STAC today; pluggable) | A witness the operator does not control | Production (satellite); generalisable |
| **Aggregate root per cohort/window** | Single verifiable digest over a set of readings | v1 sorted-hash; Merkle in v2 |

> **Honest note for reviewers:** this is a **signed append-only ledger with published keys**, *not* a blockchain or token. We deliberately do not tokenize — see Risk section. "Distributed ledger" in the template's examples is intentionally **not** used.

### 2.5 Digitization and Automation of MRV Activities
- **Scope of digitisation:** the metered-energy / device-usage monitoring parameter (and any sensor-derived parameter the methodology relies on).
- **Automation level:** signing, digesting, chaining, aggregate-root, and verification are **fully automated**. Device→platform ingestion is automated via the meter/aggregator API. Sampling design, baseline setting, and physical device audits remain manual (Section 3.3).
- **Data flow:** meter → signed `observation` at capture → append-only chain → public verification + attestation endpoints. No step mutates a signed record.

### 2.6 Digital Technologies Integration
Digital signatures (Ed25519); cryptographic hashing (SHA-256); JOSE key publication; append-only evidence chain; remote-sensing cross-witness (ESA Sentinel-2 via Element84 STAC, free, no key); cloud hosting (Railway) with NTP-synced timestamps. Each component is independently auditable; the verification path uses only `cryptography` + stdlib.

### 2.7 Technology Maturity Level
Live in production with a public, offline-verifiable surface today (drone/sensor/satellite source-types). The **`metered_cooking_device` source-type and gated ingest route (`POST /api/cooking-devices/readings`) are implemented and tested** — meter readings sign into the same chain as every other observation and verify offline identically. Suggested **TRL 6–7** (system demonstrated in an operational environment) — `[PROVIDE: confirm the TRL you wish to claim; evidence = the live endpoints + auditor walkthrough]`. Data collection is fully digital, internet-connected, API-ingested.

### 2.8 Expected Outcomes and Impact
- **Integrity:** every credited reading is tamper-evident and attributable to a published key — editing a payload invalidates its signature.
- **Independent verifiability:** a VVB confirms any reading/claim offline in **~10 minutes** with `curl + python3` (see `AUDITOR_WALKTHROUGH.md`); per-signature verify is ~100µs.
- **Lower audit cost/time:** verification is reproducible and remote, reducing manual data-trust checks and site-trip dependence.
- **Quantitative MRV metrics vs conventional MRV:** `[PROVIDE: target accuracy/completeness/conservativeness figures for the chosen project — state as targets, not measured, until pilot data exists]`.

---

## 3 | Revisions/Updates to the Applied Methodology

### 3.1 Methodology Revisions for dMRV Implementation
**No change to quantification, emission factors, or crediting math.** The solution is offered as a **digitised, tamper-evident alternative for the monitoring parameter** (metered useful energy / device usage): the parameter is captured, signed, and made independently verifiable. Justification: it strengthens the *evidentiary* basis of the existing parameter without altering the methodology's intent or outputs.

### 3.2 Extent of MRV Digitization
- **Fully automated:** signing, integrity digest, chain linkage, aggregate-root, public verification of the monitoring parameter.
- **Partially digitised:** ingestion depends on the meter/aggregator's own capture fidelity (we sign what we ingest; garbage-in is out of scope — mitigated by cross-checks in Section 4).
- **Efficiency/accuracy gains:** elimination of post-capture editability; reproducible third-party verification.

### 3.3 Manual Human Involvement
Still manual, by design: device sampling design, baseline/usage-survey work, physical device authentication, and any lab/field calibration. These are **inputs to** the signed chain, not replaced by it. Human-attested observations are a planned source-type (`human_inspection`) so manual steps can also be signed.

### 3.4 Integration of Digital and Manual Processes
Manual results (calibration, audits, surveys) enter as signed observations alongside automated meter readings, giving auditors one verifiable ledger spanning both. Limitation: the layer guarantees *integrity and provenance of recorded data*, not the physical truth of a reading — addressed by independent cross-witness and sampling.

---

## 4 | Data Collection and Management
- **Parameters measured:** metered useful energy / device-usage events `[PROVIDE: exact parameter names + units from the methodology]`. Quantification is unchanged (per methodology).
- **Data sources & collection:** cooking-device meter / aggregator API → ingested as signed `observation` records at capture time.
- **QA/QC:** (a) per-record SHA-256 digest + Ed25519 signature; (b) append-only chain with `prev_hash` linkage (no silent reordering/deletion); (c) per-cohort aggregate root recomputable by any auditor; (d) independent cross-witness where applicable; (e) published key + `kid` so signer identity is fixed.
- **Reporting:** public endpoints — list observations, verify a single observation, per-cohort attestation root (capped lookback), chain stats. Frequency: continuous.
- **Storage & security:** MongoDB with cryptographic integrity over records; signing-key handling per `provenance.py` (env-injected raw key in production, HKDF-derived fallback in dev); timestamps NTP-synced. Keys are never embedded in records; only the public key is published.

---

## 5 | Risk Assessment and Mitigation
(See `THREAT_MODEL.md` for the full analysis.)

| Risk | Mitigation |
|---|---|
| **Insider edits a recorded reading** | Signature over canonical bytes invalidates on any edit; append-only chain; offline re-verification by the VVB |
| **Database tamper / row deletion** | Per-record `prev_hash` linkage + per-cohort aggregate root expose gaps/reorders |
| **Signing-key compromise** | Key rotation with historical `kid` publication; production key env-injected, not in code; `[PROVIDE: key custody/rotation policy]` |
| **Garbage-in (meter mis-reports before signing)** | Cross-witness / independent telemetry; sampling + physical audit; explicit scope statement that we attest provenance, not physical truth |
| **Time manipulation** | NTP-synced server timestamps; external time-anchor (OpenTimestamps/Roughtime) is a v2 hardening item |
| **Tokenization/financialization failure modes** | Deliberately avoided — no token, no on-chain stake |

---

## 6 | Scalability and Replicability
- **Expansion:** the chain is **methodology-agnostic** — the same signing/verification applies to any monitoring parameter via new source-types. One layer serves many GS scopes (cooking, rice, biogas, landfill, water, nature).
- **Adaptability:** adding a sector = adding a source-type + an ingest adapter; no change to the cryptographic core.
- **Scaling cost-effectiveness:** verification is O(1) per signature (~100µs); satellite cross-witness uses free ESA Sentinel-2. Marginal cost per signed reading is negligible.
- **Financial capacity:** `[PROVIDE: infrastructure + maintenance budget plan]`.
- **Skilled workforce:** `[PROVIDE: team/operations plan]` — verification requires only standard crypto libraries, lowering reviewer-side skill requirements.

---

## 7 | Sustainability and Accessibility

### 7.1 Sustainability Performance
Low compute (hashing + Ed25519 are microsecond-scale; no proof-of-work). Avoided-emissions case: reproducible **remote** verification reduces audit-related travel vs site-trip-heavy conventional MRV `[PROVIDE: quantify avoided travel for the chosen project if claiming]`. No mining, no token, minimal e-waste (software layer over existing meters).

### 7.2 Transparency and Auditability
This is the solution's core. **Raw data access:** public observation + attestation endpoints. **Verifying calculations/algorithms:** the signing scheme is fully specified (`METHODOLOGY_v0.1.md`) and reproducible with stdlib; the 30-line `verify_claim.py` walks a claim cold. **System architecture/data flow:** documented in `ARCHITECTURE.md` / `METHODOLOGY_v0.1.md`. The layer lets a VVB **certify integrity independently** rather than trusting the operator. IT/cybersecurity: `[PROVIDE: hosting security posture, access controls, key custody]`.

### 7.3 Supporting Ecosystem
Open verification path (no proprietary dependency); auditor walkthrough + methodology docs; live endpoints. `[PROVIDE: support/maintenance commitment, training for the project developer + VVB, technology partnerships]`.

### 7.4 Accessibility
A reviewer needs only `curl` + `python3` and ~10 minutes. The public key is at a standard JWK path; verification uses any JOSE-compatible library. No specialist knowledge or platform access required to confirm a claim.

---

## List of supporting documents (attach with submission)
- `METHODOLOGY_v0.1.md` — what is signed, key publication, cross-witness, cryptographic primitives.
- `AUDITOR_WALKTHROUGH.md` — step-by-step independent verification + `verify_claim.py`.
- `THREAT_MODEL.md` — adversary analysis (insider, DB tamper, key compromise, spoofing).
- Live verifiable system: `https://backend-production-0e26.up.railway.app` (`/.well-known/keys.json`, `/api/observations`, `/api/observations/verify`, per-cohort attestation).
- `[PROVIDE: cover letter to Gold Standard; registered project documentation; meter/aggregator integration spec.]`

---

## Open items the team must close before submitting
1. **Line up a registered GS4GG metered-cookstove project** + obtain its GS ID/title/status/location (Section 1). *This is the gating dependency.*
2. ~~Build the `metered_cooking_device` ingest adapter~~ **Done** — `POST /api/cooking-devices/readings` signs readings into the chain (unit + integration tests). Remaining: connect a real meter/aggregator API and capture **real pilot readings** to populate Proof-of-Concept and the MRV metrics in 2.8.
3. **Cost-benefit analysis** (Economic Viability) and **financial/workforce** plans (Sections 6, guidelines §4).
4. **Key custody/rotation + IT-security write-up** (Sections 5, 7.2).
5. Confirm the **methodology version** and the **exact monitoring parameter name/units**.
6. Paste into the official `.docx` template, delete bracket guidance, attach the supporting docs, email to methodology@goldstandard.org.
