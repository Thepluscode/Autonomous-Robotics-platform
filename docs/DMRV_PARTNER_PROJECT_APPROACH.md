# dMRV Partner-Project Shortlist — Approach

> **Why this exists.** Gap-analysis §8.2: a Gold Standard dMRV submission requires an **existing GS-registered project** (GS ID, ≥ "listed") applying a methodology — the dMRV solution digitises *that project's* MRV. GAIA-PRIME holds no GS project. This doc is the **method** for finding and shortlisting a partner project to bind to. It is a business-development playbook, not an engineering task. Populating it with named projects is the follow-on (needs a GS Impact Registry pull — see §5).

---

## 0. The strategic fork this forces (decide first)

GAIA-PRIME's sensing (drone aerial telemetry, Sentinel-2 satellite witness, species ID, in-situ sensors, signed intervention triples) is a **land / vegetation / biodiversity** evidence layer. The GS pilot's **priority** methodologies are **GHG/carbon point-source** (cookstoves, safe water, biogas, landfill gas, grid renewables) — where aerial/vegetation sensing mostly does **not** fit. So every candidate sits on one of two axes:

| Axis | Fit to GAIA-PRIME's moat | Fit to pilot priority | Per §6 |
|---|---|---|---|
| **A — Natural fit:** GS afforestation/reforestation/restoration, agroforestry, improved forest management, blue carbon | **High** (sensing is load-bearing) | **Low** (non-priority → lower working-group weight) | **Option 1 — destination** |
| **B — Priority fit:** GS rice-methane water management (the *only* priority methodology where remote sensing genuinely applies) | **Medium** (satellite/in-situ witness fits water-management MRV; not biodiversity) | **High** | Edge of **Option 2** (rejected as a wholesale pivot, but a single rice project ≠ repositioning the product) |

**Decision required before outreach:** target **A** (moat-preserving, accept non-priority status) or **B** (priority-fit, accept the carbon-MRV framing for one project). Recommendation, consistent with §6: **lead with A**, keep one B candidate as a fast-track hedge. Do **not** pursue cookstoves/water/biogas/landfill — GAIA-PRIME's sensing adds nothing there and it forfeits the moat.

---

## 1. Ideal-partner profile

A partner project worth pursuing scores on all five:

1. **Registered & live** — GS ID, status ≥ "listed" (template §1.4–1.5 hard requirement).
2. **Land/area-based MRV** — outcomes monitored over a geography GAIA-PRIME can witness from above + on the ground (so the evidence layer is *load-bearing*, not decorative).
3. **MRV pain** — current monitoring is manual, expensive, infrequent, or trust-challenged (so digitisation is a real upgrade, not a nice-to-have).
4. **Developer willing to co-pilot** — a project developer open to a pilot, named contact, decision authority (template wants a cover letter + developer details).
5. **Defensible incremental value** — GAIA-PRIME closes a specific MRV gap the methodology already cares about (cross-witness, tamper-evidence, cadence), not a parallel system.

---

## 2. Capability × methodology fit matrix (the screen)

| GAIA-PRIME capability | AR / restoration / forestry (A) | Agroforestry / soil (A) | Rice methane – water mgmt (B) | Cookstoves / water / biogas / landfill (skip) |
|---|---|---|---|---|
| Satellite witness (Sentinel-2, 10 m, vegetation) | ●●● | ●●○ | ●●○ (flood/drain timing) | ○ |
| Drone aerial telemetry/imagery | ●●● | ●●○ | ●○○ | ○ |
| Species ID (biodiversity) | ●●● | ●○○ | ○ | ○ |
| In-situ sensors (soil moisture/water) | ●●○ | ●●● | ●●● (paddy water) | ○ |
| Signed chain-of-custody + cross-witness | ●●● | ●●● | ●●● | ●●● (but point-source already metered) |

●●● load-bearing · ●●○ useful · ●○○ marginal · ○ no fit. **Read:** A-axis is where the platform is genuinely differentiated; rice methane (B) is the one priority lane that works.

---

## 3. Partner scorecard (rank longlist → shortlist)

Score each candidate 1–5 on each; weight; shortlist the top 3–5.

| Criterion | Weight | 1 ←—————→ 5 |
|---|---|---|
| GS registration status | ×3 | not registered → certified |
| Sensing fit (from §2) | ×3 | ○ → ●●● |
| MRV pain / digitisation upside | ×2 | metered already → manual & costly |
| Developer accessibility & willingness | ×2 | unreachable → eager pilot partner |
| Pilot priority | ×1 | non-priority → priority methodology |
| Geographic/operational feasibility for a pilot zone | ×1 | inaccessible → reachable |

(Priority weighted *low* on purpose — per §6, pilot priority is a tiebreaker, not the goal.)

---

## 4. Partner value proposition (why a developer says yes)

Lead outreach with what the platform *gives the project*, not what the project gives us:
- **Independent, offline-verifiable evidence** a VVB can check without trusting anyone's servers (the R2 strength) → lower verification friction/cost.
- **Tamper-evident cross-witness** (satellite the operator can't rewrite) → credibility against greenwashing scrutiny.
- **Higher monitoring cadence at lower cost** than manual field visits.
- **A live GS dMRV pilot entry** for the developer — co-submission, shared working-group visibility.
Cost to them: a pilot zone + data access + a named contact. Frame as a **joint pilot**, not a vendor pitch.

---

## 5. Sourcing the longlist (the actual pull — follow-on task)

1. **GS Impact Registry** (`registry.goldstandard.org`) — filter by methodology (A-axis: AR/land-use/agroforestry; B-axis: the rice water-management methodology) and status ≥ Listed. Export GS ID, developer, country, status.
2. **GS Marketplace / project pages** — developer names + contacts.
3. **Priority methodology list** (programme page) — to flag B-axis candidates.
4. **Developer networks** — restoration/agroforestry developers already doing remote sensing are warmest leads.
5. Cross-reference candidates against the §3 scorecard.

*This step needs live registry queries; I can run it next and return a scored longlist.*

---

## 6. Workflow

```
Decide A vs B+hedge (§0)
  → pull longlist from GS Impact Registry (§5)
  → screen on capability fit (§2) + GS status
  → score (§3) → shortlist 3–5
  → outreach with the §4 value prop (joint-pilot framing)
  → MoU + pilot-zone + data-access agreement with 1 partner
  → co-author the dMRV Solution & Implementation Plan (their methodology+GS ID, our MEASUREMENT_SPEC + chain of custody)
  → submit (rolling window, to 30-Oct-2026)
```

---

## 7. Guardrails

- **Don't dilute the Verra-Nature-credits hero** (§6) — a GS carbon partner is a *credibility channel*, framed accordingly, not a product repositioning.
- **R3 must be closed for the chosen partner's measurands** (`MEASUREMENT_SPEC_v0.1.md`) — production sensors, not simulated, for that pilot zone.
- **One partner, one pilot zone** to start — depth over breadth; a single clean co-submission beats five cold leads.

---

*v0.1 — 2026-06-06. Operationalises gap-analysis §8.2 (GS-registered-project gate) along the §6 Option 1 path. Next action: §0 decision, then the §5 registry pull → scored shortlist.*
