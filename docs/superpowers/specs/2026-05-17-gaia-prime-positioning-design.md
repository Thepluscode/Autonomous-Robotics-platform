# Gaia Prime Positioning Hero — Design Spec

- **Date:** 2026-05-17
- **Status:** Draft (awaiting review + user approval)
- **Scope:** Single-file copy change in `frontend/src/pages/GaiaPrime.jsx`
- **Estimated implementation effort:** ~30 minutes (copy edit + browser smoke check)
- **Approach selected:** A — two-paragraph hero (chosen over B "subhead + mid-page card" and C "3-line ladder")

## 1. Problem

The `/gaia-prime` page is the auditor-facing surface of the Autonomous Ecosystem Architect. Today it opens with:

> **Don't trust us. Verify us.**
> Every drone observation, soil reading, and species identification we record is signed with an Ed25519 key whose public half is published below. Auditors — Verra, Gold Standard, third-party reviewers — can fetch any observation, recompute its hash, verify its signature, and re-derive the per-zone aggregate root, all without a single API call needing a token from us.

This subhead explains the **mechanism** well but does not name the **market moat** in vocabulary an auditor recognizes. A cold reviewer arriving at the page (a Verra methodology staffer, a Pachama analyst, a regen.network reviewer) has to infer the positioning from the mechanism. The 30-second pitch is sub-optimal as a result.

Two market signals make this gap more painful now than it was three months ago:

1. **Verra's Nature Framework opened to all projects on 2026-01-01** with the Nature Credit defined as "one Quality Hectare (Qha) of biodiversity uplift from a baseline." Verra now occupies the methodology layer; this product needs to occupy the evidence layer beneath it explicitly. The current page does not name this stack.
2. **The most-upvoted retail critique of carbon and biodiversity credit markets is "no way to prove a credit hasn't been redeemed twice"** (sourced from `/last30days` research, r/DOVU "Carbon Credits: The Great Climate Con" thread, 18 upvotes / 7 comments, 2026-04-29). The product's `POST /api/observations/verify` endpoint and per-zone aggregate roots are precisely the answer to that critique. The current page does not surface that mapping.

## 2. Solution

Replace the existing single-paragraph subhead with **two stacked paragraphs**:

- Paragraph 1 leads with the **methodology positioning** ("Evidence layer for Verra Nature Credits") and explicitly names the double-redemption critique and the chain's answer to it.
- Paragraph 2 retains and lightly tightens the existing **mechanism** copy.

The H1 ("Don't trust us. Verify us.") is preserved unchanged. No other sections of the page are modified.

## 3. Drafted Copy (canonical)

Both paragraphs reuse the existing wrapper styling, with `mt-3` on paragraph 1 (preserving the current top spacing relative to the H1) and `mt-2` on paragraph 2:

- Paragraph 1: `<p className="text-sm text-muted-foreground max-w-2xl mt-3">…</p>`
- Paragraph 2: `<p className="text-sm text-muted-foreground max-w-2xl mt-2">…</p>`

### Paragraph 1 — positioning (~80 words, sentences capped at ≤21 words)

```
Evidence layer for Verra Nature Credits. Verra's Nature Framework defines a credit
as one Quality Hectare of biodiversity uplift. This page is what makes that uplift
defensible. Every measurement that feeds a project's claim is signed with the
Ed25519 key below and chained by content hash. That includes drone telemetry, soil
sensors, satellite witnesses, and intervention before/after observations. The
retail critique of credit markets — "no way to prove this credit wasn't redeemed
twice" — doesn't survive a verifiable chain.
```

### Paragraph 2 — mechanism (~36 words, sentences capped at ≤15 words)

```
Auditors fetch any observation, recompute its hash, and verify its signature against
the published key. Per-zone aggregate roots are re-derivable the same way. None of
it requires a token from us. The curl recipes are below.
```

Total ~116 words across both paragraphs; reading time ~30 seconds; matches the
"understand the moat in 30 seconds" target stated in the brainstorm session. All
sentences honour the §4.2 ≤25-word cap.

## 4. Implementation Detail

### 4.1 File and location

- **File:** `frontend/src/pages/GaiaPrime.jsx`
- **Target block:** the existing single `<p>` inside the header `<div>`, currently
  on roughly lines 276–282 (line numbers are stale-prone; use the surrounding H1
  "Don't trust us. Verify us." as the anchor for the edit).
- **Edit shape:** replace the existing single `<p>...</p>` with two `<p>` elements,
  both with `className="text-sm text-muted-foreground max-w-2xl"`. The first carries
  the existing `mt-3` spacing; the second carries `mt-2`.
- **No new imports, no new components, no CSS file changes, no Tailwind config
  changes.**

### 4.2 Voice constraints

- Match the existing page voice: calm, technical, measured. The existing copy on
  this page already uses em-dashes (e.g., "Auditors — Verra, Gold Standard,
  third-party reviewers — can fetch …"), so the new copy continues that convention
  for consistency on this page only. Other documents in `docs/` may follow a
  different convention.
- Banned vocabulary in the new copy: "innovative", "revolutionary", "next-gen",
  "transformative", "world-class", "industry-leading", "cutting-edge". These tells
  the page as marketing-deck content and undermine the calm/technical positioning.
- No CTAs embedded inside the copy itself. The curl recipes lower on the page are
  the implicit CTA.
- Sentence length cap: ~25 words per sentence.

### 4.3 No new dependencies, components, or routes

This change is entirely text. It touches one JSX block. It adds no new API call,
no new piece of state, no new test, no new translation key, no new feature flag.

## 5. Validation Plan

### 5.1 Visual smoke

1. From repo root, `cd frontend && npm start`.
2. Navigate to `http://localhost:3000/gaia-prime`.
3. Confirm both paragraphs render in the header block beneath "Don't trust us.
   Verify us."
4. Resize the browser to 320px, 768px, and 1440px widths; confirm no overflow
   or layout break in the header.
5. Toggle dark theme (if applicable to this page — confirm at run time); confirm
   readability holds.

### 5.2 Reading test

Read paragraph 1 aloud at a normal pace. Should land in roughly 25 seconds,
leaving 5 seconds of the "30-second moat understanding" budget for the reader
to scan paragraph 2 or skip to the curl recipes below.

### 5.3 Regression

- No functional code change. Existing test suite (`pytest tests/`,
  `cd frontend && npm test`) should pass unchanged.
- The 7-invariant parity test `tests/test_unit.py::test_mcp_generate_mission_reuses_rest_planner`
  must still pass (unrelated, but it's the most-recent regression guard; run as a
  smoke check).
- No `data-testid` change needed — the page-level `data-testid="gaia-prime-page"`
  already covers the surface.

### 5.4 Author self-check (not a merge gate)

Before commit, the author should be able to copy paragraph 1 into the opening of a
Verra / Gold Standard / Pachama cold-email draft and feel the text reads as a
finished opener without significant rewriting. This is a soft author signal, not
an acceptance criterion — different readers will disagree on what "significant"
means, so it is deliberately excluded from §9. The link from this spec to the
next item on the roadmap (the `docs/AUDITOR_WALKTHROUGH.md` double-redemption
rewrite, deferred to a separate session) is the shared vocabulary, not the exact
sentence reuse.

## 6. Explicitly Out of Scope (YAGNI)

- **No new section, card, or component** below the header. That's Approach B's
  territory and was not selected.
- **No copy changes** to the Live Chain stats section, the Verification Key
  section, the per-zone Attestation section, or the curl recipes.
- **No i18n, translation infra, or alternate-language copy.**
- **No A/B test scaffolding** or analytics event on "read-completion."
- **No marketing-deck artifacts** (Figma boards, hero illustrations, OG image
  changes).
- **No edits to other documents** (`docs/OUTREACH.md`,
  `docs/AUDITOR_WALKTHROUGH.md`, `docs/METHODOLOGY_v0.1.md`) — those are separate
  items on the roadmap.
- **No back-end changes.** This is a frontend-copy-only diff.

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The "retail critique" sentence reads as too informal for the page's measured voice | Medium | Reading test in §5.2; if it clashes when read aloud, redraft to a more neutral framing ("a frequent objection in carbon and biodiversity credit markets is …") |
| Adding ~40 words to the header pushes the Live Chain stats below the fold on mobile | Low | 320px-width visual check in §5.1 catches this; both paragraphs use `text-sm` which is already compact |
| "Quality Hectare" terminology requires explanation for non-Verra readers | Low | Term is defined in-context in paragraph 1; deeper readers click through to the methodology doc; no glossary needed |
| Voice clash with the rest of the page's calm/technical tone | Low | Approach A was chosen specifically to minimize this; no buzzwords; reading-test gate in §5.2 |

## 8. References

- **Topic 1 of the `/last30days` research session (saved at
  `~/Documents/Last30Days/biodiversity-credits-mrv-verification-raw-v3.md`)** —
  source for the Verra Nature Framework January 2026 launch fact and the r/DOVU
  double-redemption critique.
- **`docs/METHODOLOGY_v0.1.md`** — the existing methodology document this page
  ultimately points auditors to. The new positioning copy should be consistent
  with the framing already used there.
- **`docs/AUDITOR_WALKTHROUGH.md`** — the doc that walks an auditor through
  verifying an observation. The copy on this page is the entry point; the
  walkthrough is the next surface. A follow-up rewrite of that walkthrough using
  the same double-redemption frame is a separate item on the same roadmap.
- **`backend/provenance.py`** — the module that signs every observation; the
  source of truth for the mechanism described in paragraph 2.
- **`backend/server.py` (`/api/public/provenance/stats`, `/.well-known/keys.json`,
  `POST /api/observations/verify`, `GET /api/zones/{id}/attestation`)** — the
  endpoints the copy implicitly points to.

## 9. Acceptance Criteria

A reviewer can mark this spec implemented when:

1. `frontend/src/pages/GaiaPrime.jsx` contains both paragraphs (verbatim from §3),
   stacked beneath the H1, with the styling described in §3 / §4.1.
2. No other file in the repository is modified.
3. The visual smoke check in §5.1 passes at all three breakpoints.
4. The reading test in §5.2 lands in roughly 25 seconds for paragraph 1.
5. Every sentence in §3 paragraph 1 and paragraph 2 is at most 25 words long
   (objectively checkable by counting).
6. No banned vocabulary from §4.2 appears in either paragraph.
7. Existing test suites pass unchanged.
