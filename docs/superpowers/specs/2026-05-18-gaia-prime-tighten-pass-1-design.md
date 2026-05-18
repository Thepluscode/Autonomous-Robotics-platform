# Gaia Prime Tighten Pass 1 — Design Spec

- **Date:** 2026-05-18
- **Status:** Draft (awaiting review + user approval)
- **Scope:** Density and self-proving polish on `frontend/src/pages/GaiaPrime.jsx`. No new endpoints. No new dependencies. Calm 0.2s transitions only — no framer-motion / GSAP.
- **Estimated implementation effort:** ~4-6 hours (component refactor + smoke + visual review)
- **Predecessor:** `2026-05-17-gaia-prime-positioning-design.md` (shipped in `fd30807`) — that pass fixed the H1+subhead. This pass tightens the body.

## 1. Problem

The page is functional. Live chain counters, public key, per-zone attestation, and an auditor cheatsheet are all wired to real data. What it doesn't do is make a Verra methodology reviewer screenshot it.

Six gaps between functional and inevitable, in priority order:

### G1 — The page describes verification; it doesn't demonstrate it

The hero says "auditors can fetch any observation and verify it." Below the fold there are curl commands. But the page itself never says *here are this page's own numbers, here is the curl that proves them right now, here is the hash of the response you'd get*. A reviewer should feel they are already mid-verification by reading.

### G2 — `StatTile` cards are generic SaaS chrome

Four bordered card tiles in a 4-col grid is a dashboard pattern. Auditor docs are dense and tabular. The same four signals (signed observations, active zones, latest entry, active key) carry more authority as a single mono ribbon with separators than as four cards.

### G3 — Source-type mix is a count grid; the product story is *triangulation*

The current "Triple-witness mix" panel renders each source type (`drone_telemetry`, `sensor_reading`, `satellite_image_hash`, `species_identification`, `zone_transition`, intervention before/action/after) as a separate count tile. That communicates *quantity* per source, not *ratio across sources*. The story we sell — drone + sensor + satellite cross-witness each other — is a ratio story. A proportional horizontal bar shows that in one glance; a count grid does not.

### G4 — Verification key shows the `kid` but hides the key material

The current "Verification key" card displays Key ID, Algorithm, Curve. The actual Ed25519 public key (`x` field, base64url) is one click away in `/.well-known/keys.json` but is not displayed on the page. An auditor reading offline (which happens) cannot copy the key from a screenshot or PDF.

### G5 — Per-zone attestation is a 2-col card grid

Auditors scan tables; the 2-col card grid hides density. A 50-zone deployment would be 25 rows × 2 cards = 25 scrolls. Sortable columns (zone, type, 7d count, aggregate root, open) carry more zones per pixel and let the reviewer sort by count or recency.

### G6 — The auditor cheatsheet does not show expected response shape

Three numbered curl blocks. Each tells the auditor what to run, none tells them what they should get back. A reviewer running the curl in 30 seconds wants the *check value* alongside the command.

## 2. Solution

Six changes, each independently revertable. Order below is the build order — each change is shippable on its own; later changes assume earlier ones are in.

### S1 — Pin a "verify this page" block to the hero (addresses G1)

Below the existing two hero paragraphs, before the `<Separator />`, add a mono block:

```
$ curl -s {API_BASE}/api/public/provenance/stats | jq
# returns:
#   total_observations: {stats.total_observations}
#   zones_with_observations: {stats.zones_with_observations}
#   latest_observation_at: {stats.latest_observation_at}
#   key_id: {stats.key_id}
# the numbers in the "Live chain" section below
# are this response, rendered.
```

The values inside the `#` comments are interpolated from the same `stats` object the Live Chain section renders. The page is now visibly its own proof: what's shown matches what the curl returns, by construction.

Component: new `<VerifyThisPage stats={stats} apiBase={API_BASE} />` inside `GaiaPrime.jsx`. Same `<CodeBlock>` styling as the cheatsheet. Hidden when `stats` is `null` (e.g., older backend) — graceful degrade.

### S2 — Replace `StatTile` 4-card grid with a single mono ribbon (addresses G2)

Replace the existing `<div className="grid grid-cols-2 md:grid-cols-4 gap-3">…</div>` with a `<dl>` styled as one full-width strip:

```
SIGNED OBSERVATIONS    ACTIVE ZONES    LATEST ENTRY    ACTIVE KEY
12,847                 18              42s ago         31b2557d…
Ed25519-signed         contributing    2026-05-18      see below
hash-chained           to the chain    14:21:08 UTC
```

- Layout: CSS grid `grid-cols-2 md:grid-cols-4`, divided by vertical borders (`divide-x divide-border` on md+).
- Container: `border border-border rounded-md bg-card` — one outer surface, not four.
- Label: `text-[10px] uppercase tracking-wider text-muted-foreground` (existing convention).
- Value: `text-3xl font-heading font-bold tabular-nums` (one size up from current `text-2xl` — more authoritative).
- Sub: `text-xs text-muted-foreground`.

Component: replace `StatTile` callers with new `<StatStrip stats={...} />`. The `StatTile` component itself can stay (potentially reused on `/public`); strip is a new component.

### S3 — Replace source-type count grid with a horizontal stacked bar (addresses G3)

Inside the existing "Triple-witness mix" card, replace the count tile grid with:

- One horizontal bar, full width, `h-8 rounded-md overflow-hidden border border-border`.
- Segments colored by source-category (not per-source — there are 7+ source types; 7+ colors is noise). Categories:
  - **Drone** (drone_telemetry, drone_position) — primary green
  - **Sensor** (sensor_reading) — terracotta accent
  - **Satellite** (satellite_image_hash) — neutral muted blue (via a new design token if needed — confirm with `design_guidelines.json` first; fall back to `text-muted-foreground` if no token exists)
  - **AI** (species_identification) — chart-3 if defined, else slate
  - **Operational** (zone_transition, intervention_*) — neutral grey
- Each segment width is `count/total * 100%`. Tooltip on hover shows raw count + percentage.
- Legend below the bar: one row per category with a 12px swatch + label + count + `(NN%)`. Mono.
- Caption preserved: "Drone telemetry, sensor readings, and intervention before/action/after observations cross-witness each other…" but tightened to one sentence.

No external chart library. Pure flexbox + width percentages. Tooltip is the native `title` attr (zero JS) — calm, no animation.

If `stats.by_source_type` is empty, render a one-line `<EmptyState compact />` instead.

### S4 — Expandable raw key material in the Verification key section (addresses G4)

In the Verification key card, after the existing 3-column metadata grid and `<Separator />`, add a disclosure:

```
▸ Show key material
```

When expanded:

```
Ed25519 public key (raw, base64url)
{keyInfo.x}                                              [Copy]
```

- Disclosure: native `<details><summary>` for zero-JS, accessible, keyboard-operable. Summary styled to match other links.
- Body: `<CodeBlock label="key-material">` with the raw `keyInfo.x` value. Copy button reused.
- Caption beneath: "This is the same `x` value served at `/.well-known/keys.json`. Verifiers can paste it directly into `cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(...))`."

Hidden when `keyInfo` is null.

### S5 — Convert per-zone attestation to a sortable table on md+, keep cards on mobile (addresses G5)

Behavior:
- **`md:` breakpoint and up:** render `<table>` with columns `Zone`, `Type`, `Observations (7d)`, `Aggregate root`, `Actions`.
- **Below `md`:** render the existing `ZoneAttestationCard` grid (1-col). Cards are still the right unit on narrow screens.

Table specifics:
- Sortable on Observations (7d) and Aggregate root presence (has-root rows first by default).
- `Zone` cell: name on top, mono `id` below in `text-[10px]`.
- `Aggregate root` cell: first 16 chars of root + `…`, mono, with row-level "Copy root" affordance.
- `Actions` cell: "Open JSON" link (existing).
- Loading state: skeleton rows using `SkeletonRow` from the state kit.
- Error per row: inline retry button in the row (the existing `ZoneAttestationCard` does this — preserve the behavior).

Component: extract `<ZoneAttestationRow zone={...} />` for the table case. Keep `<ZoneAttestationCard>` for the mobile case (no duplication of the fetch logic — extract `useZoneAttestation(zone.id)` custom hook in `frontend/src/hooks/useZoneAttestation.js`, used by both).

### S6 — Annotate auditor cheatsheet curls with expected response shape (addresses G6)

For each of the three numbered curl blocks, add a `# returns:` annotation as a sibling mono block:

**1. Fetch the public key**
```
$ curl -s {API_BASE}/.well-known/keys.json | jq .keys[0]
# returns:
#   { kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA",
#     kid: "31b2557d...", x: "<32-byte base64url>" }
```

**2. Pull a zone's attestation root**
```
$ curl -s {API_BASE}/api/zones/{sampleZoneId}/attestation?hours=168 | jq
# returns:
#   { zone_id, hours: 168, count, aggregate_root,
#     key_id, observations: [...] }
# match: SHA-256 of sorted observation digests == aggregate_root
```

**3. Verify any observation against the key**
```
$ curl -s -X POST {API_BASE}/api/observations/verify \
    -H "Content-Type: application/json" \
    -d @observation.json | jq
# returns:
#   { signature_valid: true|false, key_id, ... }
# stateless — we don't need to have stored the observation.
```

Both lines (command and `# returns:` comment) live inside one `<CodeBlock>` per step, so the auditor can copy the command and read the expected response from the same surface. The verify-endpoint caption beneath each block is preserved.

## 3. Out of scope

Calling these out so review doesn't expand:

- **No motion.** Calm 0.2s transitions only on hover/focus, per `design_guidelines.json`. No counter tick-up animations on this surface (those belong on `/public`).
- **No new endpoints.** Everything uses existing `provenanceAPI` and `publicAPI`.
- **No real-time updates.** The page is request/response. WebSocket integration is a separate decision — the auditor surface arguably should *not* tick live (a screenshot must remain reproducible from a given API call).
- **No theme change.** Stays on the Earthy/Light "Control Room" theme. The dark Gaia HUD lives on `/public`.
- **No new external assets.** No icons beyond what `lucide-react` already provides on the page.
- **No edits to `/public`.** That polish pass is the proposed next deliverable, not this one.

## 4. Risks and open questions

### R1 — Color tokens for the triangulation bar

The Earthy/Light palette in `design_guidelines.json` defines a moss-green primary and terracotta accent. It may not define enough distinct hues for 5 source categories without crowding the palette. Mitigation:
- Use primary + accent + 3 chart neutrals (`--chart-3`, `--chart-4`, `--chart-5`) if defined.
- If not defined, use one accent per category drawn from `oklch` with consistent chroma and a varied hue, written as inline `style={{ backgroundColor: ... }}` — *only* in this one component, with a code comment naming why.
- Confirm during implementation; not blocking the spec.

### R2 — Table accessibility

Tables must include `<caption>`, proper `<th scope>`, and visible focus rings on sort buttons. The state kit doesn't provide a table primitive yet; extracting one is optional but I won't introduce a third-party table dependency for this pass.

### R3 — Hash of the page's own response (deferred)

A fully recursive "the SHA-256 of the response you'd get from this curl is X, computed at page load" requires hashing the JSON we received and pinning it next to the comment. Doable in 5 lines using `SubtleCrypto.digest`. Decision: **defer to pass 2.** Pass 1 already moves the page from "describes" to "demonstrates"; recursive proof is polish on top.

### R4 — Mobile UX of the attestation table

On `< md`, we fall back to the existing card grid. No new mobile work in this pass. If the operator-side feedback is "I read this on mobile during a Verra call," we revisit.

### R5 — `keyInfo.x` may be absent on older backends

`/.well-known/keys.json` shape is owned by `provenance.py`. If a backend ever returns the JWK without `x`, the Show key material disclosure renders an inline "key material not available" message. The current backend always returns `x`; this is forward-defensive.

## 5. Acceptance criteria

The implementation is done when:

1. The `/gaia-prime` page renders with all six changes (S1-S6) and no console errors in Chrome and Firefox.
2. All numbers in the hero pinned curl block exactly equal the numbers in the Live Chain ribbon — verified by reading the page and comparing.
3. The triangulation bar segment widths sum to 100% (±0.5% rounding) when source-type counts are present, and the panel shows an empty state when not.
4. The Show key material disclosure expands and the value copies to the clipboard via the existing CopyButton (toast fires).
5. The attestation table on desktop sorts on the Observations (7d) column on click; the mobile breakpoint still renders cards.
6. All three cheatsheet curl blocks now contain a `# returns:` comment with the expected response shape.
7. `npm run build` succeeds with no new warnings.
8. `pytest tests/` is green (no backend changes, but the test suite must not regress).
9. The Railway post-deploy smoke (`scripts/railway-smoke.mjs`) passes.
10. Manual visual review against `design_guidelines.json`: typography hierarchy, no banned animation libraries, all interactives have `data-testid` in kebab-case.

## 6. Implementation hand-off notes

Build order (matches the section order — each change is independently shippable):

1. **S1** (verify-this-page block) — smallest change, biggest message shift. Land first.
2. **S2** (stat ribbon) — replaces existing component callers, keep `StatTile` exported.
3. **S6** (cheatsheet annotations) — pure copy edit, no logic. Land before bigger structural changes.
4. **S4** (key material disclosure) — additive, low risk.
5. **S3** (triangulation bar) — replaces an existing panel; needs visual review with real data.
6. **S5** (attestation table) — biggest refactor. Extract `useZoneAttestation` hook first.

Suggested commit shape (one commit per S):
- `feat(gaia-prime): pin verify-this-page curl to hero (S1)`
- `feat(gaia-prime): collapse stat tiles into single ribbon (S2)`
- `docs(gaia-prime): annotate auditor cheatsheet with expected responses (S6)`
- `feat(gaia-prime): expandable key material in verification card (S4)`
- `feat(gaia-prime): triangulation bar for source-type mix (S3)`
- `refactor(gaia-prime): attestation table on desktop, cards on mobile (S5)`

After merge: visual review on Railway, then propose pass 2 (`/public` HUD polish) as a separate spec.

---

**Reviewer questions:**

1. Approve scope as drafted, or trim? My honest view: S1, S2, S3, S5, S6 are core. S4 (key material disclosure) is nice-to-have — drop if you want this pass smaller.
2. R1 (chart color tokens) — fine to make the call during implementation, or do you want a separate color-token decision first?
3. R3 (recursive page-hash proof) — agree to defer, or pull into pass 1?
