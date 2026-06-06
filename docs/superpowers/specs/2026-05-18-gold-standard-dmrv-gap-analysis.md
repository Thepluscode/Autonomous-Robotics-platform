# Gold Standard dMRV Pilot — Gap Analysis & Submission Path

- **Date:** 2026-05-18
- **Status:** Draft (research output — awaiting user review). §0–§4 are the background research agent's analysis (network-denied sandbox, Section 1 reconstructed). **§5 is the main-session reconciliation against the live Gold Standard documents — read §5 first; it corrects and anchors §0–§1.** §6 is the positioning decision; **§7 records Gold Standard's 2026-06-02 answers to the three gating questions and is the current head of this analysis — read §7 with §6.**
- **Scope:** Market/standards research only. No code or product changes.
- **Trigger:** Gold Standard replied to outreach. No calls (small org). They accept *specific written questions* about standard documents/requirements/pilot programmes. Submission path is the **dMRV Submission Guidelines** on the **dMRV Pilot Programme** page.

---

## 0. Research limitation (agent's original caveat — partially superseded by §5)

The background agent's sandbox denied all network access, so its Section 1 is a **reconstruction**, tagged `[GS-PUBLIC]` (consistent with Gold Standard's durable public principles) or `[INFERENCE]` (standard across registry dMRV onboarding). The main session **did** have network and located the live documents — see §5 for confirmed document inventory, the real submission-package contents, the real submission schedule, and a strategic finding the reconstruction could not surface. Treat §1 as the analytical checklist and §5 as the source-anchored correction. The full requirement *bodies* of the Requirements PDF remain un-transcribed (font-encoded; no PDF text tooling fits the current disk) — §5 lists the document's section structure and the URLs to re-derive from.

---

## 1. dMRV requirements summary (reconstructed — see §0 and §5)

**R1 — Data integrity & tamper-evidence.** Measurement data demonstrably unaltered between capture and reporting; modification detectable. `[GS-PUBLIC]` `[INFERENCE]` cryptographic integrity, append-only/tamper-evident storage, documented chain of custody sensor→report.

**R2 — Independent third-party verifiability.** A VVB or Gold Standard must independently confirm data without trusting the proponent's infrastructure. `[GS-PUBLIC]` `[INFERENCE]` published keys/methods, machine-readable export, reproducible procedure.

**R3 — Methodology / measurement transparency.** What is measured, how, with what instruments, at what cadence/accuracy, and how raw becomes reported. `[GS-PUBLIC]` `[INFERENCE]`

**R4 — Provenance & chain of custody.** Each datum traces to an identified source with trustworthy timestamp; source→record→report auditable. `[INFERENCE]`

**R5 — Conservativeness & uncertainty.** Bias toward under-claiming; surface uncertainty. `[GS-PUBLIC]`

**R6 — Independence from proponent / anti-gaming.** Reduce selective reporting, fabrication, suppression; expect cross-witnessing + threat model. `[INFERENCE]`

**R7 — Methodology fit.** dMRV plugs into a Gold Standard methodology/recognised activity; it is an evidence layer, not a methodology substitute. `[GS-PUBLIC]`

**R8 — Security, governance & key management.** Documented key custody, rotation, compromise/recovery, access governance. `[INFERENCE]`

**R9 — Auditability of corrections/redactions.** Hiding/correcting must itself be logged; original integrity proof must remain verifiable. `[INFERENCE]`

**R10 — Pilot operational fit.** Submission follows the dMRV Submission Guidelines: scope, technology description, evidence package, named contact, candidate site/activity. `[INFERENCE — now confirmed, see §5]`

---

## 2. Gap analysis (repo methodology vs. reconstructed requirements)

Evidence base: `docs/METHODOLOGY_v0.1.md`, `docs/THREAT_MODEL.md`, `docs/AUDITOR_WALKTHROUGH.md`, Architecture/provenance sections of `CLAUDE.md`. SATISFIED only where the methodology demonstrably covers the requirement end-to-end.

| Req | Verdict | Evidence / what's missing |
|---|---|---|
| **R1 integrity** | **SATISFIED (stored records)** | SHA-256 over canonical JSON `{observed_at, source_type, source_id, zone_id, payload}`, Ed25519-signed (METHODOLOGY §3). Edit breaks digest+sig; AUDITOR_WALKTHROUGH Step 3 reproduces offline. Caveat: holds from signing forward, not from physical capture (see R4). |
| **R2 verifiability** | **SATISFIED** | Public key at `/.well-known/keys.json` (JWK/RFC 8037); offline `verify_claim.py` using only `cryptography`; per-zone aggregate root recomputable from public `/api/observations`. Does not require trusting platform servers. Strongest part. |
| **R3 measurement transparency** | **PARTIAL** | Crypto method/signed-body/source taxonomy documented. Missing: sensor specs, per-`source_type` accuracy/precision, sampling-cadence justification, raw→reported mapping. Methodology scopes ecological inference out (§1) — defensible for an evidence layer, thin on measurement-layer transparency. |
| **R4 provenance / custody** | **PARTIAL** | Strong from signing on. Gaps: server-issued timestamps, no external time anchor (§6.4); `drone_telemetry` records what the drone said, not device authenticity — no device attestation (THREAT_MODEL §4.4, "largest known unmitigated vector"). |
| **R5 conservativeness** | **PARTIAL** | Scope discipline conservative by design (no uplift claim). But species classifier defaults to `deterministic-v1`; per-observation uncertainty not formally surfaced (§6.2). |
| **R6 anti-gaming** | **PARTIAL** | Sentinel-2 cross-witness signs scenes the operator doesn't control. Residuals: single-operator chain, operator picks witnessed zones (omission fraud), satellite loop default-OFF and disable-able, freshness not published. Threat model names these itself. |
| **R7 methodology fit** | **GAP (by design — must address; see §5 strategic finding)** | Platform implements no GS methodology; positioned beneath Verra VM0048 / GS MRV. Submission must name which GS methodology/activity + concrete pilot zone. Largest readiness gap — and §5 shows it is worse than "just name one." |
| **R8 key management** | **PARTIAL → leans GAP** | Key custody documented; **THREAT_MODEL §4.1: "No key rotation procedure documented"**, no HSM/KMS. A standard-setter will treat an unrotatable single key as material. |
| **R9 redaction auditability** | **SATISFIED** | Redaction admin-gated; redacted digest still participates in aggregate root → tamper-via-redaction detectable. Residual: hard-deleted (not redacted) observation drops from root unless auditor snapshotted (THREAT_MODEL §4.7 [OPEN]) → Q6. |
| **R10 pilot fit** | **GAP → now defined in §5** | Submission package contents were unknown to the agent; §5 supplies them from the live Submission Guidelines. |

**Summary:** R2 + R9 pilot-grade. R1 strong for stored records. Weak axes: physical chain (R4 device authenticity, R8 key rotation/HSM) and methodology linkage (R7) — none hidden; the threat model surfaces them, which is a credibility asset.

---

## 3. Draft written questions for Gold Standard

Answerable by a standard-setter; not project-eligibility (which they refuse). Send as a numbered list to the contact who replied.

1. **Submission Guidelines version.** Confirm the current version/date of the dMRV Submission Guidelines and whether the required package is still {technology description, verifiability evidence, nominated methodology, activity, site, contact}, or point to the current enumerated contents.
2. **Evidence-layer framing.** Our system is a cryptographic measurement-evidence / chain-of-custody layer that signs raw observations and does **not** compute quantification or ecological uplift. Does the pilot accept a submission scoped purely as an MRV data-integrity/verifiability layer feeding an existing GS methodology, or must it also propose quantification?
3. **Methodology binding timing.** Must the dMRV system be bound to a specific named GS methodology/activity *at submission*, or can a technology be accepted and matched during the pilot?
4. **Independent-verification bar.** Is a publicly published verification key + reproducible offline procedure (no proponent-server trust) sufficient evidence of independent verifiability, or must verification run through a GS/VVB-operated interface?
5. **Key governance.** Does the programme state expectations for signing-key custody, rotation, and compromise/recovery (HSM/KMS, mandatory rotation, multi-signer)?
6. **Tamper-evidence over time.** Must integrity proofs be externally anchored on a fixed cadence (public ledger / OpenTimestamps / third-party pinning) so historical deletions are detectable, or is a recomputable in-system aggregate root acceptable at pilot stage?
7. **Sensor/device authenticity.** For drone/sensor telemetry, does the programme expect device-level attestation / device-side signing, or is server-side signing of received telemetry with a documented residual-risk threat model acceptable for pilot entry?
8. **Cross-witness expectations.** Does the dMRV guidance expect independent cross-witnessing of in-situ data, and is a single public-satellite source (Sentinel-2) sufficient at pilot stage or is a secondary independent source expected?

---

## 4. Recommended submission path

1. Fetch canonical docs (done in §5) and re-derive §1 verbatim where extractable.
2. Send the §3 questions by email to the GS contact (the invited channel). Prioritise Q1–Q3 (define target) + Q5/Q7 (weakest axes).
3. Close the R7 methodology-binding gap — name a specific GS methodology/activity + one concrete pilot zone. See §5: this is sharper than first assessed.
4. Pre-empt likely findings: write a one-page key-management & rotation procedure (R8); write a half-page freshness/independence statement, enable the satellite witness in prod and publish its last-tick timestamp (R4/R6).
5. Assemble a requirement-mapped submission package reusing `METHODOLOGY_v0.1.md`, `THREAT_MODEL.md`, `AUDITOR_WALKTHROUGH.md` + a cover mapping each GS dMRV requirement to its mechanism, residual risks listed explicitly.
6. Submit via the guidelines path (no call — they declined). Track submission + clarifications as the next milestone.

---

## 5. Live-source reconciliation (main session, network-enabled — 2026-05-18)

The main session reached goldstandard.org. Findings that correct/anchor §0–§1:

### 5.1 Canonical document inventory (verified URLs)

| Document | Version | URL |
|---|---|---|
| Pilot Programme Overview | Pilot | `https://globalgoals.goldstandard.org/standards/Pilot-Programme-Deploying-dMRV-Solutions-Overview.pdf` |
| dMRV **Requirements** | Pilot v0.1, dated 2024-10-10 | `https://globalgoals.goldstandard.org/standards/DMRV-Programme-DMRV-Requirements-pilot-v0.1.pdf` |
| dMRV **Submission Guidelines** | Pilot v0.1 | `https://globalgoals.goldstandard.org/standards/DMRV-Programme-DMRV-Submission-Guidelines-pilot-v0.1.pdf` |
| dMRV **Procedure** (assessment) | Pilot v0.1 | `https://globalgoals.goldstandard.org/standards/DMRV-Programme-DMRV-Procedure-pilot-v0.1.pdf` |
| Pilot Decision Summary Q1 2025 | — | `https://globalgoals.goldstandard.org/standards/Pilot-decisions-Q1-2025.pdf` |
| Programme page | — | `https://globalgoals.goldstandard.org/digital-measurement-reporting-verification-pilot-programme/` |

Requirements PDF section structure (from the document outline; bodies not transcribed — font-encoded): Project Eligibility · Methodology application · Validation and design review · Monitoring period and issuance request · Verification and performance review · **Monitoring data and accuracy** · Roles and responsibilities · FAQs. The integrity/verifiability bar lives under "Monitoring data and accuracy" + "Verification and performance review" — re-derive these two sections verbatim before submitting.

### 5.2 Required submission-package contents (confirmed — closes R10)

Technology Description · Evidence of Verifiability · Nominated Methodology (CDM / Gold Standard / equivalent) · Activity Description · Site Information · Contact Details. Inquiry contact: **methodology@goldstandard.org**. The agent's R10 "unknown" is resolved; §1-R10 and §2-R10 stand corrected to **DEFINED**.

### 5.3 Submission schedule (verbatim from the Submission Guidelines PDF)

| Quarter | Submission by | Decision by |
|---|---|---|
| Q4 2024 | 15-Dec-24 | 15-Feb-25 |
| Q1 2025 | 15-Feb-25 | 30-Mar-25 |
| Q2 2025 | 15-Apr-25 | 30-Jun-25 |
| Q3 2025 | 15-Jul-25 | 30-Sep-25 |
| Q4 2025 | 15-Oct-25 | 15-Dec-25 |

**The published v0.1 table ends Q4 2025 but today is 2026-05-18.** Gold Standard news/programme pages state the pilot runs to **October 2026** with rolling submissions ("project developers can put forward submissions at any time", a priority list aids planning). The quarterly table in the v0.1 PDF is therefore stale relative to the live programme. **Confirming the current submission window is now a Q1-priority written question** (fold into §3 Q1).

### 5.4 Strategic finding — the priority methodologies are carbon/SDG, not biodiversity

The pilot's **priority methodology list** (from the programme materials): efficient cookstoves & thermal energy · safe drinking water supply · agricultural methane reduction (rice) · biogas/manure management · biomass-fermentation carbon capture.

**None is a biodiversity / rewilding / Nature-credit methodology.** This sharpens R7 well beyond "name a methodology":

- The product's current `/gaia-prime` framing ("Evidence layer for **Verra Nature Credits**", biodiversity uplift / Quality Hectares) has **no home in this pilot's priority list**. Submissions for non-priority methodologies are accepted but explicitly lower-priority for the expert working group.
- Three honest options, for the user to decide (this links to the Verra-vs-Gold-Standard hero-positioning question already flagged — do not resolve silently):
  1. **Bind to a non-priority GS methodology** (e.g., an afforestation/reforestation/land-use GS methodology if one applies) and accept lower pilot priority + the burden of arguing fit.
  2. **Reposition the evidence layer against a priority carbon methodology** that uses field sensing/telemetry (the chain is methodology-agnostic — the same signed-observation mechanism witnesses cookstove usage sensors or rice-paddy methane probes as readily as drone biodiversity telemetry). Highest pilot-fit, but a real product-narrative pivot.
  3. **Treat the GS dMRV pilot as a credibility/feedback signal, not a near-term issuance path** — submit for the working-group review and the standard-setter relationship, not expecting fast-tracking.
- Recommendation: do not pick blindly. Make §3 Q2/Q3 (evidence-layer framing + methodology binding timing) the gating questions; the answers determine which of the three options is viable before any repositioning work.

### 5.5 Net effect on the gap analysis

- R10: GAP → **DEFINED** (5.2).
- R7: GAP → **GAP, sharper** — not just unbound, but the product's biodiversity framing is off the pilot's priority axis entirely (5.4). This is the single most important finding in this document and is a positioning decision, not an engineering one.
- R1/R2/R9 verdicts unchanged (repo-based, independent of GS docs).
- R3–R6, R8 verdicts unchanged but should be re-checked against the "Monitoring data and accuracy" + "Verification and performance review" sections once those bodies are transcribed (poppler/`pdftotext` on a network+disk-enabled machine, or open the PDFs manually).

---

## 6. Positioning decision (2026-05-18)

**Decision: Option 3 as near-term posture · Option 1 as destination · Option 2 rejected · Verra-led `/gaia-prime` hero unchanged.**

- **Option 2 (pivot to a priority carbon methodology) — REJECTED.** The chain is payload-agnostic at the crypto layer, but the product (zones, species ID, satellite vegetation witness, UI, narrative) is a biodiversity-evidence system. Repositioning to cookstove / rice-methane MRV to fit one standard body's pilot priority list trades the moat for a sub-game. §5.4's option-2 framing understated this product-pivot cost; this section corrects it.
- **Option 3 (credibility/relationship posture) — ADOPTED for near term.** Two self-admitted material gaps (R8 no key rotation/HSM; R4 no device attestation) plus zero methodology binding (R7) mean the product is not fast-track-issuance-ready under any methodology. Engage Gold Standard now for working-group feedback and the standard-setter relationship, not issuance.
- **Option 1 (bind to a non-priority GS land-use / AR / restoration methodology) — DESTINATION.** Natural fit for zone-based ecological monitoring; accept non-priority working-group status. Pursue only after the gating questions are answered.
- **Verra Nature Credits remains primary hero positioning.** Gold Standard dMRV is a secondary credibility channel. No `/gaia-prime` repositioning (do not reopen the 2026-05-17 hero spec on the back of this).

**Gating dependency:** Option 1 hinges on §3 Q2 + Q3 — whether Gold Standard accepts an evidence-layer-only dMRV submission that does not itself propose quantification. Send §3 Q1–Q3 before any submission-prep work; a "must propose quantification" answer collapses Option 1 into "needs a methodology-partner project," a materially different plan.

**Document-quality note:** §5.4's priority-methodology list is a single-source WebFetch summary, not a verbatim transcription — high confidence (consistent with Gold Standard's carbon-first portfolio), not certain; §3 Q1 confirms it.

---

## 7. Gating-question answers (Gold Standard, 2026-06-02)

Nancy Mansell answered the three §3 gating questions as sent (full thread record in `docs/OUTREACH.md`). Substance and effect:

**Q1 — submission window.** Pilot concludes **30 October 2026**; the current Guidelines on the programme page "are still relevant and the submission process remains the same"; the team "are expecting submissions." The stale Q4-2025 quarterly table (§5.3) is acknowledged and being raised internally. → **§5.3 resolved: rolling submissions are open now through 30-Oct-2026**; the v0.1 quarterly table is superseded by rolling intake. Package contents (§5.2) not contradicted — treat as still current.

**Q2 — evidence-layer-only scope.** Declined to adjudicate: "The dMRV submission must meet the requirements — the dMRV proposal template may provide further insight"; as a standard-setter GS is "unable to provide guidance on individual project situations or determine eligibility." → The §6 gating dependency is **answered with a deferral, not a yes/no.** GS will not pre-validate an evidence-layer-only framing. Burden shifts to us: obtain the **dMRV proposal template** and self-assess scope-fit against it + the Requirements PDF's "Monitoring data and accuracy" / "Verification and performance review" sections (§5.1 — still un-transcribed, now blocking).

**Q3 — methodology binding timing.** Definitive: **"dMRV submissions must be linked to a methodology and a project."** No "accept-then-match-during-pilot" path exists. → R7 must be fully closed *before* submission, and closed harder than §5.4 stated: not merely a named methodology but a **concrete project/zone** applying it.

### 7.1 Effect on the positioning decision (§6)

Direction unchanged; two sharpenings:

- **Option 1 (bind to a non-priority GS land-use/restoration methodology) now provably requires a real pilot project** — Q3 mandates a methodology *and a project* at submission. This couples the GS path to **Template-B pilot-zone outreach** (`docs/OUTREACH.md`): the pilot zone is a hard prerequisite of any GS submission, not a parallel activity.
- **Option 3 (relationship/feedback posture) is reinforced near-term** — we currently hold neither a bound methodology nor a committed pilot project, so no compliant submission is yet assemblable.
- Q2's deferral does **not** collapse Option 1 the way §6 feared a "must propose quantification" answer would — GS simply did not answer that. The methodology+project binding (Q3) means the *host methodology supplies quantification* regardless, so the evidence-layer scope is viable **iff** it rides on a real project applying a real GS methodology. The one open risk — whether the proposal template demands the *submitter* own quantification — is resolvable only by reading the template, not by another email.

### 7.2 Updated next actions (supersede §4 step 2)

1. **Obtain the dMRV proposal template** from the programme page (the document Nancy named). Highest-value artifact — it answers Q2 by construction.
2. Transcribe the Requirements PDF's "Monitoring data and accuracy" + "Verification and performance review" bodies (§5.5 carry-over) — they define the R3–R8 bar to map against.
3. Select one candidate GS land-use/restoration methodology **and** one concrete pilot zone (Option 1 + Template-B, coupled).
4. Map the evidence layer against the proposal template; only then assemble the §4 requirement-mapped package.
5. **No further clarifying emails to GS on scope/eligibility** — they have stated they will not adjudicate it; the answer lives in the template.

---

## 8. dMRV proposal template obtained & analysed (2026-06-06)

§7.2 action #1 = **DONE.** The artifact Nancy named is **"dMRV Solution and Implementation Plan"** (Pilot v0.1, dated 2024-10-10), a `.docx` on the programme page (`DMRV-Programme-t-dmrv-solution-implementation-plan-pilot-v0.1.docx`). Extracted verbatim (docx→XML). Programme-page priority list also re-pulled (now broader — adds grid renewables ACM0002/AMS-I.D., off-grid AMS-I.A./I.L., landfill gas — but **still zero biodiversity/land-use methodology**).

### 8.1 Gating question (Q2 / §7's one open risk) — RESOLVED: evidence-layer scope IS the model
Template §3 is "**Revisions/Updates to the Applied Methodology**" → *"Describe the changes to be implemented to the applied Gold Standard approved methodology."* The dMRV solution **digitises an existing GS methodology's MRV**; the **methodology supplies quantification/impact, not the submitter.** So a data-integrity/verifiability layer feeding an existing methodology is exactly the intended shape. §6's feared "must propose quantification" is **not** the case → Option 1 does not collapse. (Now grounded in the real template, not the earlier hallucinated WebFetch summary.)

### 8.2 BUT a harder gate surfaces — requires an existing GS-REGISTERED project
Template §1 (Project Background) mandates: Methodology + Version + Project Title + **Project's GS ID** + **Project Status (listed / certified design / certified)** + Developer + Scope + Geographic Location. So the dMRV must be applied to an **existing Gold Standard-registered project (GS ID, ≥ 'listed')**. §7-Q3's "must be linked to a methodology *and a project*" is sharper than recorded: a **GS-registered** project. GAIA-PRIME has none → Option 1 now requires either (a) registering a rewilding project under a GS land-use methodology, or (b) partnering with an existing GS-registered project developer (likely carbon) and digitising their MRV. **Business-development prerequisite, not engineering.**

### 8.3 Template is GHG/carbon-framed throughout
"monitor greenhouse gas emissions", "carbon credit generation and trading", "all GHG sources / material GHG sources". No biodiversity/Nature-credit framing anywhere. Confirms §5.4/§6 — GAIA-PRIME's moat is off the GS pilot axis. **Verra-primary / GS-as-credibility-channel stands.**

### 8.4 Not just integrity — measurement-performance is demanded (= R3 PARTIAL, now submission-blocking)
Beyond verifiability (template §7.2 Transparency & Auditability — GAIA-PRIME strong, R2/R9), the template requires: scope of digitisation (M / M+R / M+R+V), automation level, data flow, **Technology Readiness Level (1–9)**, and "Expected Outcomes and Impact" with **quantitative MRV-performance estimates** (accuracy/completeness/conservativeness vs conventional MRV, "level of assurance"). This is precisely GAIA-PRIME's **R3 PARTIAL** gap (no sensor specs / per-source-type accuracy / sampling-cadence justification). R3 moves from "gap" to **submission-blocking**.

### 8.5 Net effect on §6/§7
- §7 open risk (submitter owns quantification?) → **RESOLVED: no** (8.1). Evidence-layer scope viable.
- **New hard gate:** a GS-registered project (GS ID, ≥listed) on a priority (carbon) methodology (8.2) — GAIA-PRIME holds neither.
- **R3 becomes submission-blocking** (8.4), not just a noted gap.
- §6 positioning **unchanged and reinforced:** Option 3 (relationship/credibility) is the only assemblable near-term posture; Option 1 is gated on a registered project; Verra Nature Credits stays primary hero.

### 8.6 Residual
Requirements PDF "Monitoring data and accuracy" / "Verification and performance review" bodies still un-transcribed (font-encoded; no `pdftotext` on this machine; WebFetch couldn't extract — saved binaries are in the session tool-results dir). No longer blocking the go/no-go (the template answers it) — transcribe before final package assembly. Template downloaded to `/tmp/dmrv-template.docx` (re-fetch from the §8 URL).

---

*Prepared 2026-05-18; §7 added 2026-06-03; §8 added 2026-06-06. §1 reconstructed (agent, network-denied); §5 reconciled against live Gold Standard sources (main session); §6 is the positioning decision; §7 reconciles Gold Standard's 2026-06-02 gating-question answers. Requirement bodies of the Requirements PDF not transcribed — re-derive "Monitoring data and accuracy" and "Verification and performance review" before relying on R3–R8 detail, and obtain the dMRV proposal template before assembling a submission.*
