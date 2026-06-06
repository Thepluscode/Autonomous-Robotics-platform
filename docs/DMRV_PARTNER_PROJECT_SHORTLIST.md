# dMRV Partner-Project Shortlist — Axis A (Land-use / Restoration)

> Companion to `DMRV_PARTNER_PROJECT_APPROACH.md`. Decision taken: **lead with Axis A** (natural fit, moat-preserving; accept non-priority pilot status). This is the §5 registry pull, scored against the §3 scorecard.
>
> **Confidence:** GS IDs/statuses below are from public sources (GS blog, registry summaries, press). **Verification pass done 2026-06-06 — see the Verification section below.** The registry is a JS app (no machine-readable data / no public API), so these are independent-source corroborations, not registry-authoritative; final confirmation = open `registry.goldstandard.org` in a browser. **Sodo (row 3) is flagged as likely NOT Gold Standard and is dropped pending confirmation.**

---

## Methodology to bind to
**Gold Standard A/R — "Afforestation/Reforestation GHG Emissions Reductions & Sequestration Methodology" (Doc 403, v2.0)**, under **Land-use & Forests Activity Requirements (Doc 203)**. Covers tree planting, silvicultural systems, **agroforestry**, and silvopasture. This is the host methodology the dMRV solution digitises (it owns quantification; we own M+V — gap-analysis §8.1).

---

## Scored shortlist

Scorecard (§3): GS status ×3 · sensing fit ×3 · MRV pain ×2 · developer willingness ×2 · pilot priority ×1 · feasibility ×1. Max 60. *Priority = 1 for all (Axis A is non-priority by definition — weighted low on purpose).*

| # | Project | GS ID | Status | Developer / Country | Type | Score | Read |
|---|---|---|---|---|---|---|---|
| **1** | **GrowGrounds Global Syntropic Agroforestry Program** | **GS13053** | Project **Design Certified** | GrowGrounds ApS (DK agritech) / multi-country coffee | Syntropic agroforestry, coffee monoculture → biodiverse system; 18–25 tCO₂e/ha | **52** | **Top pick.** Tech-forward agritech developer (high pilot willingness), biodiversity+soil+carbon, recent cert. Sensing is load-bearing. Start here. |
| 2 | SEKEM Tree Project | GS4894 | Certified **Design** | SEKEM (biodynamic) / Egypt | Desert agroforestry / greening | 45 | Established, accessible org; agroforestry fits drone+in-situ; arid-zone sensing is clean. Strong #2. |
| ~~3~~ | ~~Sodo Ethiopia Reforestation~~ | ~~GS3007~~ | ⚠️ **disputed** | World Vision / Ethiopia | A/R reforestation | — | **DROPPED (2026-06-06 verification): likely NOT Gold Standard** — corroboration points to CarbonFix + CCB (REDD DB #346), consistent with the World Vision Humbo/Sodo CDM/CCB lineage. Confirm on the GS registry before any use. |
| 4 | EcoMakala Virunga Reforestation | GS5618 | **Certified** | WWF / DR Congo (Virunga) | A/R reforestation | 47* | Best biodiversity narrative (iconic). *Score inflated — DRC conflict zone makes a sensing pilot operationally hard; rubric under-weights this. **Backup, not lead.** |

*Plus GS IDs **11798 / 11856** surfaced as "Listed" A/R but unnamed — resolve names on the registry; TERRAGRN (Mpumalanga SA agroforestry, GS+R20) appeared but **no GS ID confirmed → likely not yet registered → fails the hard gate** until it is.*

---

## Why GrowGrounds is the lead
- **Developer willingness is the scarcest input** (§3 ×2) and an impact-driven agritech startup is far likelier to co-pilot a dMRV tech than a large NGO.
- **Agroforestry MRV is genuinely painful** (distributed smallholders, soil carbon, biodiversity co-benefits) — exactly where signed drone + satellite + in-situ witness is load-bearing, not decorative.
- **Biodiversity-positive framing** keeps the GAIA-PRIME narrative intact even on a carbon methodology — minimal moat dilution (§6 guardrail).

---

## B-axis hedge — rice methane (PRIORITY methodology)

Methodology: **GS "Methane Emission Reduction by Adjusted Water Management Practice in Rice Cultivation" (Doc 437 v1.0)**, adapted from CDM AMS-III.AU, **IRRI/DFAT-developed, ICVCM CCP-approved** (premium-integrity label). Same scorecard.

| # | Project | GS ID | Status | Developer / Country | Score | Read |
|---|---|---|---|---|---|---|
| **B1** | **NetZeroAg rice methane (AWD)** | **GS3785** | **Issuing / Certified** | NetZeroAg / Pakistan | **54** | **First-ever GS rice-methane issuance** (46,714 credits, Dec 2025; 2,000→3,000 smallholders). Priority methodology **and** the exact MRV pain — proving thousands of smallholders actually ran intermittent flooding (AWD) — that **satellite flood/drain witness + signed in-situ water sensors uniquely solve.** Tech-forward developer needing scalable MRV. |

More candidates via the registry rice filter: `registry.goldstandard.org/projects?q=rice` (also India, Vietnam, Bangladesh, Indonesia, etc.).

### The honest tension this surfaces
On the pure rubric, **NetZeroAg (54) edges GrowGrounds (52)** — it's fully certified (vs design-certified) and priority-weighted, *even though priority is weighted ×1*. That tells you the **rice lane is genuinely the strongest pilot-fit**: a priority methodology whose hardest MRV problem (smallholder AWD verification, fraud-prone) is precisely what GAIA-PRIME's cross-witness chain addresses.

**The decision to lead with A is therefore a *strategic* choice, not a data-driven one:** GrowGrounds preserves the biodiversity moat/narrative (species ID, rewilding); NetZeroAg is **pure agriculture-carbon** — no species, no rewilding, a real narrative stretch (§6's rejected "Option 2" in microcosm). Per your call (lead A) and §6 (don't dilute the Verra-Nature hero), **GrowGrounds stays primary; NetZeroAg is the documented fast-track hedge** — activate it only if the working group signals priority-only fast-tracking or if a paying rice partner materialises before a forestry one.

---

## Verification status (2026-06-06)

Registry detail pages are a JS SPA (empty to a fetch) and no public JSON API responded — so these are **independent-source corroborations**, not registry-authoritative. Final word: open `registry.goldstandard.org` and search the GS ID.

| Candidate | GS ID | Verification |
|---|---|---|
| GrowGrounds | GS13053 | ✅ **Strong** — 3+ independent sources incl. GrowGrounds' own GS4GG VPA (Kenya, 5,800 farmers, 1.1M trees). Design-Certified / Listed. **Lead confirmed.** |
| SEKEM Tree | GS4894 | ✅ Good — SEKEM's own site ("first GS-certified project in Egypt & Middle East"); Certified Design, ~5k credits/yr. |
| EcoMakala | GS5618 | ✅ Good — CO2logic/WWF Virunga; GS Certified, ~17k credits/yr. (Remains the DRC-feasibility backup.) |
| NetZeroAg (Pakistan rice) | GS3785 **(number unconfirmed)** | ✅ **Project** verified via GS's own announcements (46,714 credits, 17-Dec-2025, AWD, 2,000 farmers, Govt-Pakistan Art.6/CORSIA LoI) — but **no source confirms the exact ID 3785.** Confirm the number on the registry. |
| ~~Sodo~~ | ~~GS3007~~ | ⚠️ **DROPPED** — likely CarbonFix + CCB (REDD DB #346), not Gold Standard. |

**Net:** 3 Axis-A candidates verified (GrowGrounds, SEKEM, EcoMakala); B-lead project verified, its ID pending; Sodo removed. Confidence is high enough to proceed to outreach on GrowGrounds; do a 5-minute browser registry check first.

## Next actions
1. **Confirm in a browser** on `registry.goldstandard.org`: GS13053 (lead), and the NetZeroAg ID (search "NetZeroAg" / "rice Pakistan"). GS4894/GS5618 corroborated already.
2. **Outreach to GrowGrounds first** — joint-pilot framing (`APPROACH §4`): independent offline-verifiable MRV, tamper-evident cross-witness, higher cadence at lower cost, a live GS dMRV pilot entry for them. Cost to them: one pilot zone + data access + a named contact.
3. On a yes: MoU + pilot zone → close **R3 for that zone's measurands** (`MEASUREMENT_SPEC_v0.1.md`, real sensors) → co-author the dMRV Solution & Implementation Plan → submit (rolling, to 30-Oct-2026).

---

*v0.1 — 2026-06-06. Sources: Gold Standard registry/blog + press (verify on registry). Methodology: GS A/R Doc 403 v2.0 / LUF Doc 203.*
