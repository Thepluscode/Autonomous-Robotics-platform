# Gaia Prime Positioning Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-paragraph subhead in the `/gaia-prime` hero with two stacked paragraphs that lead with the Verra-Nature-Framework positioning ("Evidence layer for Verra Nature Credits") followed by the existing mechanism copy.

**Architecture:** One-file copy edit. The existing JSX block at `frontend/src/pages/GaiaPrime.jsx` lines 273-282 contains an H1 (preserved) and one subhead `<p>` (replaced). We swap the single `<p>` for two new `<p>` elements with explicit `mt-3` / `mt-2` spacing. No new components, no new state, no new API calls, no test files added. Visual regression is checked manually at three breakpoints; objective acceptance criteria (sentence-length, banned-vocab, existing test suite green, single-file diff) are checkable by script.

**Tech Stack:** React 18 + Craco + Tailwind. Existing `data-testid="gaia-prime-page"` covers the page; no testid additions required.

**Spec reference:** `docs/superpowers/specs/2026-05-17-gaia-prime-positioning-design.md`. Re-read it before starting. The drafted copy in §3 of the spec is canonical — do not paraphrase.

**Pre-existing context the executor needs:**
- The page is the auditor surface. Calm/technical voice. The existing subhead uses em-dashes (e.g., "Auditors — Verra, Gold Standard …") — the new copy continues that convention for consistency on this page only.
- The page loads its three data sources (`publicAPI.getDashboard`, `provenanceAPI.getPublicKey`, `provenanceAPI.getStats`) via `Promise.allSettled`. The header (where this change lives) renders BEFORE the loading/error fork, so the visual smoke check works without a running backend.
- Repo has uncommitted work tolerated, but this plan creates its own commit. Branch is `main`. If `git status` shows any unrelated dirty files at start, stop and surface to the user.
- **Revert command** (use this any time a check below tells you to revert the edit and surface): `git restore frontend/src/pages/GaiaPrime.jsx`. After running it, `git status` should report a clean tree.
- **Python invocation:** the plan uses `python3` which should resolve to the project's chosen interpreter. If `python3 -m pytest` fails with `No module named pytest`, fall back to `python3.13 -m pytest` (matches the interpreter the project's recent work pinned via graphify / last30days setup) — either is acceptable as long as `pip install -r backend/requirements.txt` was run for that interpreter.

---

## Task 1: Verify baseline state and confirm anchor

**Files:**
- Read: `frontend/src/pages/GaiaPrime.jsx`

**Goal:** confirm the file has the H1 "Don't trust us. Verify us." followed by the single subhead `<p>` the spec targets. If the file has drifted since the spec was written, stop and report.

- [ ] **Step 1: Confirm H1 anchor text exists.**

Run:
```bash
grep -n "Don't trust us. Verify us." frontend/src/pages/GaiaPrime.jsx
```

Expected output: one line, around line 274:
```
274:              Don't trust us. Verify us.
```

If the anchor is missing or appears more than once, stop and ask the user.

- [ ] **Step 2: Confirm the existing subhead `<p>` matches the spec's claim.**

Run:
```bash
sed -n '276,282p' frontend/src/pages/GaiaPrime.jsx
```

Expected output (exact):
```
            <p className="text-sm text-muted-foreground max-w-2xl mt-3">
              Every drone observation, soil reading, and species identification we record is
              signed with an Ed25519 key whose public half is published below. Auditors —
              Verra, Gold Standard, third-party reviewers — can fetch any observation,
              recompute its hash, verify its signature, and re-derive the per-zone aggregate
              root, all without a single API call needing a token from us.
            </p>
```

If the className, line numbers, or copy have drifted, stop and surface.

- [ ] **Step 3: Confirm the working tree is clean.**

Run:
```bash
git status --short
```

Expected: no output (clean tree). If any unrelated files are dirty, stop and surface — do not start the change on top of unknown state.

---

## Task 2: Apply the copy edit

**Files:**
- Modify: `frontend/src/pages/GaiaPrime.jsx` (lines ~276-282)

**Goal:** replace the existing single `<p>` subhead with two stacked `<p>` blocks containing the verbatim copy from §3 of the spec.

- [ ] **Step 1: Use the Edit tool to perform the replacement.**

`old_string` (must match exactly, including leading whitespace and trailing whitespace):
```
            <p className="text-sm text-muted-foreground max-w-2xl mt-3">
              Every drone observation, soil reading, and species identification we record is
              signed with an Ed25519 key whose public half is published below. Auditors —
              Verra, Gold Standard, third-party reviewers — can fetch any observation,
              recompute its hash, verify its signature, and re-derive the per-zone aggregate
              root, all without a single API call needing a token from us.
            </p>
```

`new_string` (verbatim from spec §3, two stacked paragraphs):
```
            <p className="text-sm text-muted-foreground max-w-2xl mt-3">
              Evidence layer for Verra Nature Credits. Verra's Nature Framework defines a
              credit as one Quality Hectare of biodiversity uplift. This page is what makes
              that uplift defensible. Every measurement that feeds a project's claim is
              signed with the Ed25519 key below and chained by content hash. That includes
              drone telemetry, soil sensors, satellite witnesses, and intervention
              before/after observations. The retail critique of credit markets — "no way to
              prove this credit wasn't redeemed twice" — doesn't survive a verifiable chain.
            </p>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Auditors fetch any observation, recompute its hash, and verify its signature
              against the published key. Per-zone aggregate roots are re-derivable the same
              way. None of it requires a token from us. The curl recipes are below.
            </p>
```

Critical: the indentation of the new `<p>` blocks matches the indentation of the existing block (12 spaces before each `<p>`). Verify after the edit.

**Note on JSX whitespace:** the soft line-break positions inside the `<p>` blocks are NOT semantically meaningful — JSX collapses all runs of whitespace (newline + indentation spaces) into a single space at render time. The wrap points in `new_string` are chosen for readability of the source file; they do NOT have to match the line-wrap layout in the spec's §3 prose block. Only the text content (word-for-word) must match.

- [ ] **Step 2: Confirm the edit landed correctly.**

Run:
```bash
sed -n '276,290p' frontend/src/pages/GaiaPrime.jsx
```

Expected output: the two new `<p>` blocks in place, with `mt-3` on the first and `mt-2` on the second.

- [ ] **Step 3: Confirm exactly one file changed.**

Run:
```bash
git status --short
```

Expected:
```
 M frontend/src/pages/GaiaPrime.jsx
```

No other files. If anything else appears in the diff, stop and investigate.

---

## Task 3: Objective acceptance checks (sentence-length, banned vocabulary)

**Files:** none modified.

**Goal:** verify spec §9 criteria 5 and 6 by script. These are objective — no human judgement.

- [ ] **Step 1: Confirm no banned vocabulary in either paragraph.**

Run:
```bash
sed -n '276,290p' frontend/src/pages/GaiaPrime.jsx | grep -iE "innovative|revolutionary|next-gen|transformative|world-class|industry-leading|cutting-edge"
```

Expected: no output (no matches). If grep prints anything, fail the task — revert the edit and surface to the user.

- [ ] **Step 2: Confirm every sentence in both paragraphs is ≤25 words.**

Run this one-liner (it extracts the text content of the two new `<p>` blocks, splits on sentence-ending punctuation, and prints any sentence whose word count exceeds 25):
```bash
python3 - <<'PY'
import re, pathlib
src = pathlib.Path("frontend/src/pages/GaiaPrime.jsx").read_text()
# Pull out both new paragraph blocks
m = re.search(r'>\s*Evidence layer for Verra Nature Credits\.(.*?)</p>\s*<p[^>]*>(.*?)</p>', src, re.S)
assert m, "could not locate new paragraphs — edit may have failed"
p1 = "Evidence layer for Verra Nature Credits." + m.group(1).strip()
p2 = m.group(2).strip()
# Collapse JSX whitespace
for tag, text in [("P1", p1), ("P2", p2)]:
    collapsed = re.sub(r"\s+", " ", text).strip()
    # Split on sentence enders followed by a space + capital, or end of string.
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z"])', collapsed)
    bad = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        wc = len(s.split())
        if wc > 25:
            bad.append((wc, s))
    if bad:
        print(f"{tag} has {len(bad)} sentence(s) over 25 words:")
        for wc, s in bad:
            print(f"  [{wc}w] {s}")
    else:
        print(f"{tag}: all sentences ≤25 words")
PY
```

Expected output (exactly):
```
P1: all sentences ≤25 words
P2: all sentences ≤25 words
```

If any sentence is over 25 words, the edit drifted from the spec. Re-apply Task 2 step 1 verbatim from the spec's §3 — do not edit the canonical copy here.

---

## Task 4: Visual smoke check at three breakpoints

**Files:** none modified.

**Goal:** verify spec §9 criterion 3. The header renders before the page's loading/error fork so a backend is not required.

- [ ] **Step 1: Start the dev server in the background.**

Run:
```bash
cd frontend && npm start
```

Run this in a separate terminal (or as a background process) and wait for the "Compiled successfully" message. The default port is 3000.

If the dev server fails to compile, the JSX is malformed. Read the error, surface it, and revert. Do not proceed.

- [ ] **Step 2: Manually verify the page at 320px, 768px, 1440px widths.**

Open `http://localhost:3000/gaia-prime` in Safari or Chrome. Use the browser's responsive-design mode to resize:

For each of `320px`, `768px`, `1440px`:
- The H1 "Don't trust us. Verify us." renders unchanged.
- Both new paragraphs render beneath the H1.
- Paragraph 1 starts with "Evidence layer for Verra Nature Credits."
- Paragraph 2 starts with "Auditors fetch any observation".
- No text overflow, no layout collapse, no clipped content.
- The "Public dashboard" button on the right of the header still renders without overlapping the paragraphs at 1440px.

This step is the only one that requires a human eye. **Explicit handoff protocol for agentic workers:** if this plan is being executed by a subagent or automated worker that cannot operate a graphical browser, after Task 3 has passed, the worker MUST print the literal line

```
HUMAN VISUAL CHECK REQUIRED at /gaia-prime — pausing for sign-off
```

and stop. Do NOT proceed to Task 5. The worker resumes only after the user replies with explicit confirmation that the three breakpoints look correct (e.g., "visual ok", "looks good at all breakpoints"). Faking the visual confirmation is a CARL rule 2 violation ("NEVER mark tasks complete without validation").

- [ ] **Step 3: Stop the dev server.**

Ctrl-C in the dev-server terminal (or kill the background process).

---

## Task 5: Regression — existing test suites pass unchanged

**Files:** none modified.

**Goal:** verify spec §9 criterion 7. No test was added; the existing 42-test pytest suite and the React Jest suite should be green with no flake.

- [ ] **Step 1: Run the backend unit tests (no MongoDB required).**

Run from repo root:
```bash
python3 -m pytest tests/test_unit.py -q
```

(If `python3 -m pytest` fails with `No module named pytest`, fall back to `python3.13 -m pytest tests/test_unit.py -q` — either interpreter works as long as `pip install -r backend/requirements.txt` has been run for it.)

Expected output (last line):
```
42 passed, 4 warnings in X.XXs
```

If any test fails, the failure is unrelated to this change (this plan touches no Python code) — surface the failure and stop.

- [ ] **Step 2: Run the frontend test suite.**

Run:
```bash
cd frontend && CI=true npm test -- --watchAll=false 2>&1 | tail -20
```

Expected: tests pass or the suite is empty / no tests found. CRA's default test setup may have zero tests for this project; that is acceptable — "no regressions" is the criterion.

If any test fails, read the failure. If the failure references `GaiaPrime` directly, revert the edit and surface. Otherwise the failure is unrelated to this change and should still be reported but does not block the commit (it was already failing before).

---

## Task 6: Commit and stop

**Files:**
- Commit: `frontend/src/pages/GaiaPrime.jsx`

**Goal:** ship the change as one focused commit. Do not push — the user pushes explicitly.

- [ ] **Step 1: Stage exactly the file changed.**

Run:
```bash
git add frontend/src/pages/GaiaPrime.jsx
git status --short
```

Expected: `M  frontend/src/pages/GaiaPrime.jsx` (single staged file, no others).

- [ ] **Step 2: Commit with a focused message.**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat(gaia-prime): hero subhead leads with Verra evidence-layer positioning

Replace the single-paragraph subhead beneath "Don't trust us. Verify us."
with two stacked paragraphs:

* Paragraph 1 leads with the methodology positioning — Evidence layer for
  Verra Nature Credits — and explicitly names the most-upvoted retail
  critique of credit markets (no way to prove a credit wasn't redeemed
  twice) and the chain's answer to it.
* Paragraph 2 retains and lightly tightens the existing mechanism copy
  (fetch observation, recompute hash, verify signature, re-derive
  aggregate root — no API token required).

Designed in docs/superpowers/specs/2026-05-17-gaia-prime-positioning-design.md
(Approach A — two stacked paragraphs; lowest blast radius on the page's
calm/technical voice). Spec passed two-pass review. Implementation plan in
docs/superpowers/plans/2026-05-17-gaia-prime-positioning.md.

No new components, no backend changes, no test additions. Header renders
before the page's loading/error fork so the change is visible even when
the backend is unreachable.
EOF
)"
```

- [ ] **Step 3: Verify the commit landed.**

Run:
```bash
git log --oneline -1
git status
```

Expected: latest commit subject starts with `feat(gaia-prime): hero subhead leads with Verra`, and `git status` shows the tree clean / branch ahead of origin/main by however many commits.

- [ ] **Step 4: Stop. Do NOT push.**

The user pushes when ready. Surface the commit hash and the branch state to the user with a one-line summary. Resist the urge to also rewrite `docs/AUDITOR_WALKTHROUGH.md` in the same session — that's the next item on the roadmap and gets its own brainstorm → spec → plan cycle.

---

## Done criteria (summary, mapped to spec §9)

| Spec criterion | Validated by task |
|---|---|
| 1. JSX contains both paragraphs verbatim from §3 | Task 2 step 2 |
| 2. No other file in the repo modified | Task 2 step 3 + Task 6 step 1 |
| 3. Visual smoke at 320/768/1440 passes | Task 4 step 2 |
| 4. Reading test paragraph 1 ~25 sec | Human, during Task 4 step 2 |
| 5. Every sentence ≤25 words | Task 3 step 2 (script) |
| 6. No banned vocabulary | Task 3 step 1 (grep) |
| 7. Existing tests pass unchanged | Task 5 steps 1 + 2 |

Total estimated time: 30 minutes including the human visual check.

---

## Out of scope (do NOT do in this plan)

Mirrored from spec §6 — repeated here so the executor has it inline:

- No new section, card, or component below the header (that's Approach B's territory).
- No copy changes to Live Chain / Verification Key / Attestation / curl-recipe sections.
- No i18n, A/B test, or analytics events.
- No edits to `docs/OUTREACH.md`, `docs/AUDITOR_WALKTHROUGH.md`, `docs/METHODOLOGY_v0.1.md` — those are separate roadmap items.
- No backend changes. This is a frontend-copy-only diff.
- No push to origin/main. The user pushes explicitly.
