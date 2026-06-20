# Outreach Templates — Auditor Review and Pilot Zone

> Two short, copy-paste-ready emails. Both are designed to ask for a *small* commitment first (a 30-minute review, a single-sensor pilot) — the failure mode in this space is asking for too much too early. Customize the bracketed fields per recipient.

---

## A. Auditor / methodology reviewer

**Use when:** reaching someone at Verra, Gold Standard, Climate Action Reserve, Pachama, Sylvera, regen.network, Cecil, or an independent MRV consultant.

**Subject:** *30-min review of a verifiable rewilding chain — feedback for Methodology v0.1*

```
Hi [Name],

I'm building [product name] — a chain of custody for restoration evidence
that signs every drone observation, sensor reading, and intervention
before/action/after with Ed25519 keys whose public half is published
at /.well-known/keys.json. The verification primitives are all standard
(SHA-256 body digests, JWK key publication, sorted-hash aggregate roots).

What I have shipped:
  • Methodology v0.1: [link to docs/METHODOLOGY_v0.1.md]
  • Threat model v0.1 (adversary analysis): [link to docs/THREAT_MODEL.md]
  • 10-minute auditor walkthrough with offline verify script:
    [link to docs/AUDITOR_WALKTHROUGH.md]
  • Live chain to verify against: https://[your-domain]/gaia-prime
  • Public provenance stats: https://[your-domain]/api/public/provenance/stats

What I'm asking for: 30 minutes of your time to read those three docs and
tell me which of the v0.1 known limitations and unmitigated threat vectors
are actual blockers in a credit-issuance context vs. acceptable starting
points. Specifically the five questions at the end of Methodology §8 and
Threat Model §7.

I'm not asking for a public endorsement, a write-up, or any promise about
[your org]'s methodology. Just an honest "this gap is a blocker" /
"this part is fine" pass.

If a 30-min call works, I'll prep against your timezone. If async is
easier, drop a few lines into the doc as comments.

Either way — thank you for the time.

[Your name]
[Your contact]
```

**Pre-send checklist:**
- [ ] Replace `[product name]`, `[link]`, `[your-domain]` with real values.
- [ ] Confirm `/gaia-prime` and `/.well-known/keys.json` are live and reachable from outside your network.
- [ ] Confirm the auditor walkthrough's `curl` examples in `docs/AUDITOR_WALKTHROUGH.md` actually work end-to-end against the production URL right now (not last week).
- [ ] If recipient is at Verra / Gold Standard / CAR specifically, search their site first for the methodology number most relevant to your scope (forest carbon → VM0048; biodiversity → there's no incumbent — say so and ask).

---

## B. Pilot zone partner

**Use when:** reaching a regional rewilding NGO, university field station, individual landowner running a restoration project, or a forester running a private project. The right size is *small* — under 50 hectares, one or two sensors, one operator.

**Subject:** *Free pilot — verifiable record-keeping for [their project name]*

```
Hi [Name],

I run [product name]. Short version: we sign every restoration observation
(sensor readings, camera-trap images, intervention before/action/after)
with cryptographic keys so a third party can verify the record without
trusting us. The goal is to make restoration claims defensible to credit
issuers and regulators without anyone having to take our word for it.

I'm looking for one pilot partner for a 30-day trial. Here's the deal:

What you provide:
  • A zone polygon (the area you're restoring) and its rough biome type
  • One or more observation sources — a camera trap, a soil sensor, or
    drone footage. Even one source counts.
  • A point of contact who can spot-check that what we recorded matches
    what actually happened on the ground.

What I provide (free during the pilot):
  • A backend account with role-gated dashboards
  • Every observation signed and chained automatically
  • A public attestation page at /gaia-prime — your zone listed with
    its live aggregate root, a public link auditors can verify
  • Methodology and verification documentation — the same docs an
    auditor would read

What this is NOT (yet):
  • A credit-issuance product. We do not produce Verra / Gold Standard
    / regen.network credits. We produce the evidentiary chain that a
    methodology built on top of can use.
  • A regulatory product. We don't replace your existing reporting.

What success looks like at day 30:
  • Your zone has accumulated real signed observations (not simulator data)
  • The /gaia-prime page lists your project alongside a verifiable chain
  • You have a written sense of whether the platform reduced your
    reporting burden or added to it — both answers are useful

If this is interesting, reply with a sentence about your project and
I'll send onboarding. If it's not the right time, I'd appreciate
pointers to other restoration projects you respect.

[Your name]
[Your contact]
```

**Pre-send checklist:**
- [ ] You have the operational capacity to onboard one pilot in 30 days. Don't send if you don't.
- [ ] You can articulate, in one sentence, what "onboarding" means — see the open question below.
- [ ] You have a plan for what happens at day 31. (Renewal terms? Pricing? Or "thank you, here's what we learned, let's part as friends"?)

---

## Companion docs to send alongside

When you send Template B (pilot outreach), attach links to:

- `docs/PILOT_ONBOARDING.md` — runbook from "we said yes" to first signed observation in under an hour
- `docs/PILOT_TERMS.md` — what day 31 looks like, what "free" means, the three forks (research partner / paid customer / graceful end), pricing intent
- `docs/DATA_HANDLING.md` — what we collect, what's public-by-design, retention, deletion, sensitive-data redaction guidance, open gaps

When you send Template A (auditor outreach), attach:

- `docs/METHODOLOGY_v0.1.md` — the document under review
- `docs/THREAT_MODEL.md` — adversary analysis: every attack vector with current mitigation and residual risk
- `docs/AUDITOR_WALKTHROUGH.md` — 10-minute end-to-end verification with the offline `verify_claim.py` script

Send the doc URLs *in the email body*, not as attachments — reviewers will skim links faster than they'll open files, and a 404 on a link is a more honest failure mode than an attachment that lands in spam.

---

## Live outreach log

> Not a template — a factual thread record. Keep it accurate; this is the source of truth for what was actually sent and received.

### Gold Standard — dMRV Pilot Programme

| | |
|---|---|
| **Sent** | 2026-05-14 — Template A variant, subject "30-min review request — verifiable rewilding chain-of-custody" |
| **Reply** | ~2026-05-18 — Nancy Mansell, Stakeholder Support Associate, Gold Standard (Geneva) |
| **Reply substance** | No calls (small org). Will answer *specific written questions* about standard documents / requirements / pilot programmes — **not** project eligibility or consulting (those → ICROA-listed consultants). Real path: the **dMRV Submission Guidelines** on the **dMRV Pilot Programme** page. Methodology inquiries: `methodology@goldstandard.org`. |
| **Analysis** | `docs/superpowers/specs/2026-05-18-gold-standard-dmrv-gap-analysis.md` (requirements, gap analysis, full question set, submission path) |
| **Positioning decision** | Gap-analysis §6 — Option 3 (relationship/feedback posture) near-term; Option 1 (bind to a non-priority GS land-use/restoration methodology) as destination; Option 2 (carbon-methodology product pivot) rejected; Verra stays primary `/gaia-prime` hero. |
| **Follow-up sent** | 2026-05-19 — 3 gating questions (Guidelines version/window · evidence-layer scope · methodology-binding timing) sent on Nancy's thread. |
| **Reply (gating Qs)** | 2026-06-02 — Nancy Mansell. **Q1 (window):** pilot concludes **30-Oct-2026**; current Guidelines still apply, submission process unchanged, team actively expecting submissions; stale Q4-2025 schedule acknowledged and being raised internally; package contents not contradicted. **Q2 (evidence-layer scope):** declined to rule — "must meet the requirements; the **dMRV proposal template** may provide further insight"; GS "unable to determine eligibility" for an individual situation. **Q3 (binding timing):** definitive — **"dMRV submissions must be linked to a methodology and a project"** (bind at submission, not matched during the pilot); priority-methodology list is on the programme page. |
| **Net effect** | Q3 closes the binding question: **no GS submission is possible without (a) a named GS methodology and (b) a concrete project/zone** — Template-B pilot-zone outreach is now a hard prerequisite of the GS path, not a parallel track. Q2 leaves evidence-layer-only scope unadjudicated → self-assess against the dMRV proposal template; GS will not pre-validate it. §6 positioning unchanged in direction (Option 3 near-term, Option 1 destination), sharpened: Option 1 now provably requires a real project, not just a methodology name. Full reconciliation: gap-analysis §7. |
| **Next action** | (1) Obtain the **dMRV proposal template** from the programme page; map our evidence layer against it to self-judge Q2. (2) Identify one candidate GS land-use/restoration methodology + one concrete pilot zone (couples to Template-B outreach). (3) Then assemble the requirement-mapped package per gap-analysis §4. No further scope emails to GS — they have stated they will not adjudicate eligibility. |

**Follow-up email — 3 gating questions (copy-paste):**

**Subject:** Re: 30-min review request — three specific questions on the dMRV pilot

```
Hi Nancy,

Thank you — understood on the format, written questions it is. These
are all clarifications on the dMRV pilot standard documents (not project
eligibility or consulting), so I hope they fit what you can answer.

1. Submission Guidelines version & window. The copy we located is
   "dMRV Submission Guidelines, Pilot v0.1", whose submission schedule
   runs through Q4 2025, while the programme materials say the pilot
   runs to October 2026 with rolling submissions. Could you confirm the
   current Guidelines version and the current submission window, and
   whether the required submission package is still: technology
   description, evidence of verifiability, nominated methodology,
   activity description, site information, and contact?

2. Evidence-layer scope. Our system is a cryptographic
   measurement-evidence and chain-of-custody layer: it signs raw
   observations (sensor, drone, satellite) with a published Ed25519 key
   so a third party can verify integrity offline, and it deliberately
   does not itself compute quantification or impact. Does the dMRV
   pilot accept a submission scoped purely as an MRV
   data-integrity / independent-verifiability layer feeding an existing
   Gold Standard methodology, or must a dMRV submission also propose the
   quantification approach?

3. Methodology binding timing. Must a dMRV solution be bound to a
   specific named Gold Standard methodology/activity at the point of
   submission, or can a technology be accepted into the pilot and
   matched to a methodology during it?

Happy to send our methodology and threat-model documentation if useful
for context. Thank you for the time.

Theophilus Ogieva
[contact]
```

**Pre-send checklist:**
- [ ] Reply on the existing Nancy Mansell thread (the channel she explicitly invited) — do not open a new one.
- [ ] Optionally cc `methodology@goldstandard.org` only if Nancy redirects question 3; do not cc pre-emptively.
- [ ] Replace `[contact]`.
- [ ] Do not add a 4th question or any eligibility/consulting ask — they refuse those and it weakens the three that matter.
- [ ] Log the response in this table when it arrives; re-run gap-analysis §2 verdicts against any concrete requirements they cite.

---

*Last updated: 2026-06-03.*
