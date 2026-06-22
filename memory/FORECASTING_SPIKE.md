# Forecasting Library Spike: Orbit vs Greykite vs Prophet

**Linear issue:** THE-22
**Date:** 2026-06-11
**Scope:** Analysis and recommendation only — no code changes, no new dependencies.

## 1. Data Characterization

MongoDB was not reachable in this environment (no running `mongod`). All counts and
structures below are derived from static code analysis of `backend/server.py`,
`backend/models.py`, and the `seed_data` route (`POST /api/seed`). Where code
analysis fully describes the shape, numbers are marked **[code]**; where they would
require a live query, the query is shown and the expected cold-seed value given.

### 1.1 `db.zones` — 5 seeded, scalars updated in-place

Five zones are seeded; there is no `db.zone_history` or `db.zone_snapshots`
collection. Zone fields relevant to forecasting:

| Zone | Type | Priority | `biodiversity_index` | `soil_health` |
|---|---|---|---|---|
| Amazon Basin Sector A | forest | critical | 0.72 | 0.65 |
| Borneo Peatland Reserve | wetland | high | 0.45 | 0.38 |
| Serengeti Corridor | grassland | medium | 0.68 | 0.72 |
| Great Barrier Reef Edge | coastal | critical | 0.35 | 0.42 |
| Gobi Restoration Site | desert | low | 0.25 | 0.30 |

**Critical finding [code]:** When `execute_intervention` applies a zone delta it calls
`db.zones.update_one({"id": zone_id}, {"$set": zone_updates})` — a destructive
scalar update. The previous value is **not preserved** in the zone document. The
only record of what the value was before an intervention is the signed
`intervention_before` observation in `db.observations`.

**Live query to verify (run against a deployed instance):**
```js
db.zones.count()          // expect 5 on a clean seed
db.zone_snapshots.count() // expect 0 — collection does not exist yet
```

### 1.2 `db.observations` — intervention-triggered, irregular

Source types written to this collection:

| `source_type` | Trigger | Contains zone scalars? |
|---|---|---|
| `intervention_before` | `POST /api/interventions/execute` | Yes — `_zone_state_snapshot` payload |
| `intervention_action` | same call | No scalars — operator params only |
| `intervention_after` | same call | Yes — post-mutation snapshot |
| `species_identification` | `POST /api/ai/identify-species` | No |
| `satellite_image_hash` | background loop (OFF by default) | No scalars — SHA-256 hash only |

On a fresh seed (`POST /api/seed`) **zero observations are created** — the seed
populates zones, drones, and robots but does not call `execute_intervention`.

**Live query:**
```js
db.observations.count()
// expect 0 on a clean seed; N×3 per intervention executed since then
db.observations.distinct("source_type")
```

The `before`/`after` payloads _could_ be mined as a sparse time-series, but only
when interventions are executed — frequency is operator-driven, not clock-driven.

### 1.3 `db.sensors` — point-in-time only

`Sensor` documents carry a single `current_value` + `last_reading` timestamp. There
is no `db.sensor_readings` collection. Sensors are not seeded by `POST /api/seed`.

**Live query:**
```js
db.sensors.count()     // expect 0 on a clean seed
```

### 1.4 `generate_forecast` input surface

The function (`server.py:1006`) reads **exactly two fields** from the zone document:
`zone.biodiversity_index` and `zone.soil_health`. It does not query `db.observations`
or any other collection. Input to the heuristic is a single scalar per metric, not
a sequence. The heuristic:

```python
base_change = {"critical": -0.02, "high": -0.01, "medium": 0.005, "low": 0.01}
change = base_change[priority] * (days / 30) + random.uniform(-0.05, 0.05)
confidence = 0.9 - (days / 300)   # 0.80 / 0.70 / 0.60 for 30/60/90 days
```

The `confidence` value is a linear decay formula, not a statistical estimate.

### 1.5 Summary: available time-series per zone

| Source | Records per zone (cold seed) | Frequency |
|---|---|---|
| `db.zone_snapshots` | 0 (collection absent) | — |
| `db.observations` (before/after) | 0 on fresh seed | Irregular, operator-driven |
| `db.sensors` readings history | 0 (no history collection) | — |
| Drone telemetry | WebSocket-only, not persisted | Every 5 s |

**Bottom line: there is no time-series data to fit a model on today.**

---

## 2. Library Evaluation

Candidate references are from `memory/ML_REFERENCES.md` (Forecasting section).
Evaluation criteria: dependency weight (Railway Docker image), cold-start behavior
with short or zero history, fit with the existing three-horizon `confidence` field,
and licensing.

### 2.1 Uber Orbit (2021)

- **What it is:** Bayesian structural time-series with native uncertainty intervals
  (KTR, LGT, DLT model families). Paper: <https://arxiv.org/abs/2004.08492>
- **Deps:** PyStan **or** cmdstanpy + cmdstan (required for MCMC sampling), numpy,
  pandas, scipy. cmdstan is a compiled C++ binary (~400–600 MB).
- **Railway image impact:** Adds cmdstan compilation to the build step; significantly
  increases image size and build time. The Railway backend Procfile uses `uvicorn` on
  a Python image — no Stan toolchain today.
- **Cold-start:** Poor. NUTS/HMC sampling needs ≥30 data points to explore the
  posterior reliably. Fewer points → the posterior collapses to the prior → the
  output is indistinguishable from a prior specification, not a fitted model.
- **Uncertainty intervals:** Native Bayesian credible intervals — the best match for
  a per-horizon `confidence` field among the three candidates.
- **License:** Apache 2.0
- **Verdict:** Meaningful only with hundreds of per-zone observations. The cmdstan
  dependency adds ~400–600 MB and build-time complexity for zero benefit until real
  data exists. **Not recommended.**

### 2.2 LinkedIn Greykite (2021)

- **What it is:** Ridge-regression-based forecasting with interpretable trend,
  seasonality, and changepoint components. Blog post:
  <https://engineering.linkedin.com/blog/2021/greykite--a-flexible--intuitive--and-fast-forecasting-library>
- **Deps:** LightGBM, plotly, holidays, networkx, pandas, scikit-learn (~200 MB
  incremental, no Bayesian sampler required).
- **Railway image impact:** Lighter than Orbit — no compiled Stan binary — but
  LightGBM + plotly + networkx is still ~200 MB of incremental dependencies the
  current image does not carry.
- **Cold-start:** Better than Orbit. Can initialize with domain-supplied seasonality
  priors even without data. However, the feature-engineering pipeline (trend
  components, changepoint detection) requires ≥2 seasonal cycles to be meaningful.
  Daily biodiversity data → ≥2 years for annual seasonality; weekly grouping → ≥26
  weeks.
- **Uncertainty intervals:** Ridge-regression-based posterior (not probabilistic);
  produces confidence bands but via bootstrap or analytical approximation, not a
  full posterior predictive.
- **Interpretability:** High — feature decomposition (trend, seasonal, event
  components) could be valuable in auditor-facing reports. This is the main
  differentiator over Prophet.
- **License:** BSD-2-Clause
- **Verdict:** Better dependency story than Orbit; interpretability is appealing for
  the dMRV/auditor context. Still overkill without real data, and the uncertainty
  intervals are less rigorous than Orbit or Prophet's. **Not recommended now;
  revisit in Phase 3 if pilot auditors request trend decomposition.**

### 2.3 Meta Prophet (2017)

- **What it is:** Decomposable time-series model (trend + seasonality + holidays)
  designed for sparse, irregular business time series. Walkthrough cited in
  ML_REFERENCES.md: <https://github.com/facebook/prophet>
- **Deps:** cmdstanpy + cmdstan (default) or Stan via pystan. However, Prophet 1.x
  also supports `uncertainty_samples=0` (MAP estimation, no MCMC) which avoids
  cmdstan entirely at the cost of no posterior predictive intervals.
- **Railway image impact:** With `uncertainty_samples=0` and the `neuralprophet`
  backend, cmdstan is not required — PyTorch fills that role (~200 MB but PyTorch
  is already common in ML stacks). Default mode still pulls cmdstan.
- **Cold-start:** Best of the three. Prophet was designed for the "sparse/irregular
  observations" use case (explicitly documented). With `uncertainty_samples=0` and
  a short history (≥14 data points), it produces a plausible trend fit using MAP.
- **Horizon alignment:** `make_future_dataframe(periods=[30, 60, 90])` maps directly
  to the existing three-horizon structure in `EcosystemForecast.predictions`.
- **Uncertainty intervals:** Native posterior predictive at configurable width; maps
  directly to the `confidence` field once MCMC mode is enabled (≥30 data points).
- **License:** MIT
- **Verdict:** Best fit among the three for sparse, irregular biodiversity data.
  When data exists, **Prophet is the recommended library.** Not appropriate yet.

### 2.4 Comparison Table

| Criterion | Orbit | Greykite | Prophet |
|---|---|---|---|
| Cold-start (N < 14 obs.) | ✗ Poor | ~ Fair | ✓ Best |
| Cold-start (14–30 obs.) | ✗ Poor | ~ Acceptable | ✓ Good (MAP mode) |
| Dependency weight | ✗ Heavy (cmdstan) | ~ Medium | ~ Medium (MAP avoids cmdstan) |
| Native uncertainty | ✓ Bayesian credible | ~ Approximate | ✓ Posterior predictive |
| Horizon alignment (30/60/90d) | ✓ | ✓ | ✓ |
| Interpretability | ~ Fair | ✓ Best | ~ Fair |
| License | Apache 2.0 | BSD-2-Clause | MIT |
| Rec. for this data shape | ✗ | ✗ now / Phase 3 | ✓ when data exists |

---

## 3. Recommendation

**Do not adopt any of the three libraries yet.**

All three require substantial dependencies and are trained on time-series data. The
current deployment has zero time-series observations per zone. Adding ~200–600 MB
of new dependencies (cmdstan, LightGBM, or PyTorch) to fit a model on an empty
collection contradicts Google's Rules of ML Rule #1 (cited in ML_REFERENCES.md):
"don't be afraid to launch without ML — replace the heuristic only when real
observation history exists."

The prerequisite is **instrumenting zone-state history** first. Until that
collection exists and has ≥14 days of data, the current heuristic (`predict_trend`
in `generate_forecast`) is the correct answer.

**When zone-state history exists:** adopt **Prophet** (Phase 1 below). It was
designed for the sparse/irregular data shape that this platform will have early on,
and its horizon structure (`periods=[30, 60, 90]`) maps directly to the existing
`EcosystemForecast` schema with no model changes.

---

## 4. Incremental Path

### Phase 0 — Instrument zone history (prerequisite, recommended from this spike)

Add a `db.zone_snapshots` collection. Each document:

```json
{
  "zone_id": "<uuid>",
  "ts": "<ISO-8601>",
  "biodiversity_index": 0.72,
  "soil_health": 0.65,
  "predator_prey_balance": 0.58,
  "vegetation_coverage": 0.85,
  "trigger": "seed|intervention|periodic"
}
```

Write one record:
- At `POST /api/seed` (seed trigger, one per zone).
- At the end of `execute_intervention` (after-state, intervention trigger).
- From a periodic background task ticked every 24 h alongside
  `simulate_drone_movements` (periodic trigger, one per zone per day).

This is a pure append; it does not change `generate_forecast` behavior. It is the
prerequisite for all downstream model work and costs nothing in the current image.

**No new library dependencies required for Phase 0.**

### Phase 1 — Introduce Prophet behind a feature flag (≥14 snapshots per zone)

Trigger: any zone accumulates ≥14 snapshots (≈2 weeks of daily records).

Changes scoped to `generate_forecast`:
1. Query `db.zone_snapshots` for the requesting zone, sorted by `ts` descending,
   limit to the most recent 180 days.
2. If count ≥ 14: fit Prophet on the `biodiversity_index` / `soil_health` series;
   use `uncertainty_samples=0` (MAP) for fast inference without cmdstan.
3. If count < 14: keep the heuristic unchanged.
4. Return `model: "prophet"` or `model: "heuristic"` in the response (add to
   `EcosystemForecast` model) so the UI and auditors can distinguish.

**Dependencies added in Phase 1:** `prophet` (MAP mode; cmdstan not required). Add
to `backend/requirements.txt` only when implementing Phase 1, not before.

### Phase 2 — Full MCMC uncertainty intervals (≥90 snapshots per zone)

Enable Prophet's MCMC sampler (`mcmc_samples=300`) for zones with ≥90 daily
snapshots. This requires cmdstanpy + cmdstan. Meaningful credible intervals (not MAP
point estimates) map directly to the `confidence` field. A/B comparison against the
heuristic baseline should be run at this phase to confirm measurable improvement
(Rule of ML #4: measure the outcome, not just the model metric).

### Phase 3 — Greykite for auditor reports (pilot request)

Greykite's trend-decomposition output (trend component, seasonality component,
residuals) is well-suited for external auditor reports that need to explain *why* a
biodiversity index is changing. Adopt only if a pilot explicitly asks for this
interpretability layer.

### Summary

| Phase | Trigger | Action | New deps |
|---|---|---|---|
| **0 (now)** | This spike | Add `db.zone_snapshots` writer | None |
| **1** | ≥14 snapshots / zone | Prophet MAP mode in `generate_forecast` | `prophet` (no cmdstan) |
| **2** | ≥90 snapshots / zone | Prophet MCMC, full credible intervals | `cmdstanpy`, cmdstan |
| **3** | Pilot request | Greykite for auditor decomposition reports | `greykite`, LightGBM |
