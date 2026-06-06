# Measurement Specification v0.1 — R3 (Measurement Transparency)

> **Purpose.** Companion to `METHODOLOGY_v0.1.md`. Closes the "measurement-layer transparency" gap (R3) for a Gold Standard **dMRV Solution & Implementation Plan** submission: *what is measured, by what instrument, at what cadence, to what accuracy, and how raw capture becomes a signed, reported record.* The platform **digitises the M+V of an applied host methodology**; it does **not** compute quantification or ecological uplift — that stays with the host methodology (consistent with the dMRV template §3 "Revisions/Updates to the Applied Methodology").
>
> **Honesty note.** Current-build status is stated per row. Where a source is **simulated** today, this doc specifies the **production sensor requirement** a real deployment must meet — labelled as such, never passed off as live. This mirrors `THREAT_MODEL.md`: disclosed gaps are a credibility asset.

---

## 1. Scope of digitisation (per dMRV template §2.2)

| MRV stage | Digitised? | Owner |
|---|---|---|
| **Monitoring** (capture of raw observations) | ✅ Yes — signed at capture | This platform |
| **Verification** (independent integrity check) | ✅ Yes — Ed25519 + public key, offline-verifiable | This platform |
| **Reporting** (quantification → claim) | ❌ No — by design | **Host methodology** (VM0048 / GS MRV / etc.) |

Automation level: capture→sign→store is **fully automated**; methodology selection, project binding, and quantification are **manual / host-methodology**.

---

## 2. Per-source-type measurement table (the R3 core)

For each `source_type` (defined in `provenance.py` / `METHODOLOGY_v0.1.md §2`): the measurand, the instrument, the accuracy that bounds trust in the record, sampling cadence + justification, and current-build status.

| `source_type` | Measurand (units) | Instrument — current → **production requirement** | Accuracy / precision | Cadence + justification | Status |
|---|---|---|---|---|---|
| `drone_telemetry` | Position (lat/lon °), battery (%), mission state, heading | Simulator → **GNSS module on UAV** (consumer ±2–5 m; **RTK-GPS ±2 cm** for siting-critical claims) | Bounded by GNSS spec above; timestamp = server clock (NTP) | Per patrol tick (sim 5 s; **prod: per waypoint / ≤1 min**) — fast enough to evidence presence, not so fast it floods the chain | **Simulated** (`simulator.py`) |
| `species_identification` | Species class + confidence ∈ [0,1] | `deterministic-v1` taxonomy → **BioCLIP vision model** (`SPECIES_IDENTIFIER=bioclip`) | deterministic-v1: **none (curated, not a model)**; BioCLIP: publish top-1/top-5 accuracy on a held-out biome set per deployment | Per camera-trap / drone image event | **Deterministic default; BioCLIP plumbed, off** — every record carries `method` so a reviewer filters to `method=="bioclip"` |
| `intervention_before` / `_action` / `_after` | Zone state snapshot pre/post + action params | Operator + bracketing sensor stream | Inherits the accuracy of the bracketing sensors | Once per intervention (the load-bearing triple) | Operator-recorded |
| `satellite_image_hash` | Sentinel-2 L2A scene ref + thumbnail SHA-256 + cloud-cover % | **Element84 earth-search STAC (Sentinel-2 L2A, ESA)** — **real** | ESA L2A: **10 m** GSD (visible/NIR), documented geometric/radiometric accuracy; cross-witness the operator cannot rewrite | Default 6 h poll (Sentinel-2 revisits ~5 d, so faster wastes quota) | **Real**, default-OFF (`SATELLITE_WITNESS_ENABLED=1` in prod) |

**[OPEN] v0.2 measurands:** `human_inspection` (attested visit), `lab_assay` (soil/water lab report) — both carry their own instrument + accuracy fields.

---

## 3. Raw → signed → reported data flow (per template §2.3 "Data flow")

```
[sensor/satellite/classifier]  →  raw payload
   → canonical JSON {observed_at, source_type, source_id, zone_id, payload}
   → SHA-256 body digest  →  Ed25519 signature (key K)
   → append to chain (Mongo, immutable signed bytes)
   → published: /api/observations, /.well-known/keys.json, per-zone aggregate root
   → host methodology consumes verified records → quantification → claim  (NOT us)
```

No transformation occurs between capture and signing — the signed bytes **are** the raw measurand. Any later correction is a **redact flag** (admin-gated, still participates in the aggregate root → tamper-via-redaction is detectable; `METHODOLOGY §6`, R9).

---

## 4. Conservativeness, uncertainty & level of assurance (template §2.8)

- **Conservative by construction:** the platform makes only *local, signed, timestamped* claims ("sensor X reported value V") and **no ecological inference** — it cannot over-claim uplift because it computes none (`METHODOLOGY §1`).
- **Uncertainty surfaced:** species records carry a confidence score and `method`; cloud-cover % on satellite scenes; **[OPEN]** per-`source_type` uncertainty is not yet a formal field (R5 PARTIAL — v0.2).
- **Level of assurance vs conventional MRV:** independent third party verifies every record **offline, without trusting platform servers** (public key + 30-line `verify_claim.py`, ~10 min). Conventional MRV requires trusting the proponent's data pipeline; this does not. **This is the platform's strongest axis (R2).**

---

## 5. Technology Readiness Level (template §2.7)

| Subsystem | TRL | Note |
|---|---|---|
| Cryptographic chain of custody (sign / verify / aggregate root) | **7–8** | Deployed, offline-verifiable, regression-tested |
| Satellite cross-witness (Sentinel-2) | **6** | Real source, shipped, default-OFF |
| Physical sensing (drone/in-situ) | **3–4** | **Simulated** today; production sensor integration is the main TRL gap |
| Species vision model | **4** | BioCLIP plumbed, not default |

---

## 6. Residual gaps (disclosed — cross-ref `THREAT_MODEL.md`)

1. **Physical sensing simulated** — production deployment with real GNSS/sensor specs is the precondition for a real submission (§5).
2. **No device attestation** — `drone_telemetry` records what the device *said*, not hardware-authenticated identity (THREAT_MODEL §4.4, largest unmitigated vector).
3. **Server-issued timestamps, no external time anchor** (METHODOLOGY §4 [OPEN]).
4. **Per-observation uncertainty not yet a formal field** (R5 PARTIAL).

---

## 7. Maps to the dMRV "Solution & Implementation Plan" template

| Template section | Covered by |
|---|---|
| §2.2 Scope of dMRV application (M/M+R/M+R+V) | §1 here |
| §2.4 Key technologies & methodologies | §2 (instruments) + `METHODOLOGY §3` (crypto) |
| §2.5/2.6 Digitisation & automation, data flow | §3 here |
| §2.7 Technology maturity (TRL) | §5 here |
| §2.8 Expected outcomes & MRV performance / level of assurance | §4 here |
| §7.2 Transparency & auditability | `AUDITOR_WALKTHROUGH.md` (R2/R9) |

---

*v0.1 — 2026-06-06. Prerequisite to a GS dMRV submission per gap-analysis §8.4 (R3 was submission-blocking). Requires a bound host methodology + a GS-registered project (gap-analysis §8.2) before it is submission-ready; this doc closes the measurement-transparency axis only.*
