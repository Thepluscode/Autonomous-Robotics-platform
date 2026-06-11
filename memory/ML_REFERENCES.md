# Production ML References (dMRV-relevant)

Curated from [eugeneyan/applied-ml](https://github.com/eugeneyan/applied-ml) (2026-06-11).
Internal research note — lives in `memory/` because `docs/` is the external
auditor/pilot packet. Use these as prior art before building or replacing any
ML component on the platform (doctrine step 0: research & reuse).

## Computer vision / satellite (species ID, satellite witness)

- **AI for AG: Production ML for agriculture** — Blue River, 2020
  https://medium.com/pytorch/ai-for-ag-production-machine-learning-for-agriculture-e8cfdb9849a1
  Closest published analog to our field species-ID pipeline (`backend/species_id.py`):
  edge inference on farm machinery, label-quality discipline, model-update cadence.
- **ML-based Damage Assessment for Disaster Relief** — Google, 2020
  https://ai.googleblog.com/2020/06/machine-learning-based-damage.html
  ([paper](https://arxiv.org/pdf/1910.06444.pdf))
  Building-level change detection from satellite imagery — directly relevant if the
  Sentinel-2 witness loop (`backend/satellite.py`) ever grows from hash-witnessing
  to content analysis (deforestation/flood change detection per zone bbox).
- **A Neural Weather Model for Eight-Hour Precipitation Forecasting (MetNet)** — Google, 2020
  https://ai.googleblog.com/2020/03/a-neural-weather-model-for-eight-hour.html
  ([paper](https://arxiv.org/pdf/2003.12140.pdf))
  Satellite+radar → short-horizon precipitation. Reference point for the weather
  routes if pilots ask for forecast-grade weather instead of current conditions.
- **How We Improved CV Metrics >5% Only by Cleaning Labelling Errors** — Deepomatic
  https://deepomatic.com/en/how-we-improved-computer-vision-metrics-by-more-than-5-percent-only-by-cleaning-labelling-errors/
  Label quality > model tweaks. Applies to any species-ID ground-truth set we collect.

## Forecasting (zone biodiversity/soil forecasts)

Current state: `POST /api/forecasts/generate/{zone_id}` (backend/server.py) is a
simulated trend heuristic (priority-based drift + uniform noise), not a model.
See Linear issue on evaluating a real time-series library.

- **Orbit: Open Source Package for Time Series Inference and Forecasting** — Uber, 2021
  https://eng.uber.com/orbit/ ([paper](https://arxiv.org/abs/2004.08492),
  [code](https://github.com/uber/orbit))
  Bayesian structural time series; native uncertainty intervals — matches our
  confidence-decay UX (forecasts carry per-horizon `confidence`).
- **Greykite** — LinkedIn, 2021
  https://engineering.linkedin.com/blog/2021/greykite--a-flexible--intuitive--and-fast-forecasting-library
  Fast, interpretable; strong changepoint/seasonality handling, lighter dependency
  footprint than Orbit (no PyStan/cmdstan).
- **Prophet in production (Atlassian walkthrough)** — 2020
  https://www.youtube.com/watch?v=TkcpjnLh690 ([code](https://github.com/facebook/prophet))
  The boring default; works with sparse/irregular observations.
- **Forecasting at Uber: An Introduction** — Uber, 2018
  https://eng.uber.com/forecasting-introduction/
  Framing reference: when classical (ETS/ARIMA) beats ML, backtesting windows.

## Data quality (upstream of the provenance chain)

The signature chain proves an observation wasn't tampered with *after* signing —
it cannot prove the reading was sane when produced. These cover the validation
layer that belongs upstream of `provenance.py` signing.

- **Automating Large-Scale Data Quality Verification** — Amazon, 2018
  https://www.amazon.science/publications/automating-large-scale-data-quality-verification
  Declarative constraints (completeness, ranges, anomaly bounds) checked continuously.
- **Data Validation for Machine Learning (TFDV)** — Google, 2019
  https://mlsys.org/Conferences/2019/doc/2019/167.pdf
  Schema-based validation + drift detection between data batches.
- **Monitoring Data Quality at Scale with Statistical Modeling** — Uber, 2017
  https://eng.uber.com/monitoring-data-quality-at-scale/
  Statistical, low-ceremony quality monitors — the right weight for sensor feeds.

## Cross-cutting practice (any project)

- **Rules of Machine Learning** — Google, 2018
  https://developers.google.com/machine-learning/guides/rules-of-ml
  Rule #1: don't be afraid to launch without ML — our heuristic forecast was the
  right v1; replace it only when real observation history exists.
- **Hidden Technical Debt in ML Systems** — Google, 2014/2015
  https://papers.nips.cc/paper/5656-hidden-technical-debt-in-machine-learning-systems.pdf
- **150 Successful ML Models: 6 Lessons Learned** — Booking.com, 2019
  https://booking.ai/150-successful-machine-learning-models-6-lessons-learned-at-booking-com-681e09107bec
  Model value ≠ business value; measure the latter.
- **Interpreting A/B Test Results: False Positives / False Negatives** — Netflix, 2021
  https://netflixtechblog.com/interpreting-a-b-test-results-false-positives-and-statistical-significance-c1522d0db27a
  https://netflixtechblog.com/interpreting-a-b-test-results-false-negatives-and-power-6943995cf3a8
  Pairs with engineering Rule 4 (no detector without FP/FN evaluation).
- **Automatic Retraining for ML Models** + **Real-time ML Alerting** — Nubank, 2022
  https://building.nubank.com.br/automatic-retraining-for-machine-learning-models/
  https://building.nubank.com.br/best-practices-for-real-time-machine-learning-alerting/
  Pairs with Rule 8 (no silent failures) once any real model serves traffic.
