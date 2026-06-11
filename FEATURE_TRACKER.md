# FEATURE_TRACKER.md — Autonomous Ecosystem Architect

## Lifecycle

```
PLANNED → IN PROGRESS → DEPLOYED → VERIFIED
```

**Rules:**
- **PLANNED** — scoped and documented, not yet implemented.
- **IN PROGRESS** — actively being built or PR open, not yet merged to main.
- **DEPLOYED** — code merged to main and running in Railway production (or designed to run with no additional code work). A feature can be DEPLOYED but dark (e.g. behind a disabled env flag).
- **VERIFIED** — production evidence exists: logs, an observable API response from the Railway deployment, or a test that hit the live service. **Never mark VERIFIED without that evidence.** When in doubt, use DEPLOYED.

---

## Auth & Access Control

| Feature | Status | Notes / Evidence |
|---|---|---|
| User registration & login (JWT httpOnly cookies) | DEPLOYED | `backend/server.py` `/api/auth/register`, `/api/auth/login`; access token 60 min, refresh 7 d |
| httpOnly cookie auth (no token in JS-readable storage) | DEPLOYED | `frontend/src/lib/api.js` `withCredentials: true`; `frontend/src/contexts/AuthContext.js` discards raw tokens |
| 401 → refresh → retry interceptor | DEPLOYED | `frontend/src/lib/api.js` response interceptor; single-flight queue |
| Role-based access control (`admin`, `field_operator`, `scientist`, `viewer`) | DEPLOYED | `ROLE_PERMISSIONS` in `backend/server.py`; `require_role()` dependency |
| JWT secret strength validator (boot-time) | DEPLOYED | `backend/server.py` — refuses boot if `JWT_SECRET` < 32 chars or is a known default |
| W2 route auth hardening (batch 1 — drones & robots) | DEPLOYED | THE-16 merged; PR linked in Linear; `tests/test_unit.py::test_public_surface_is_locked` |
| W2 route auth hardening (batches 2–4 — zones, sensors, species, patrols, forecasts, weather, AI) | IN PROGRESS | THE-17, THE-18, THE-19 in progress; 24 routes in `W2_UNGATED_BACKLOG` in `tests/test_unit.py` |
| Phase-A auth gate (`AUTH_GATE_PHASE_A` env var) | DEPLOYED (dark) | Code merged; middleware default-off; flip `AUTH_GATE_PHASE_A=1` in Railway after batches 1–4 merge (THE-21); `tests/test_unit.py::test_phase_a_middleware_*` |
| WebSocket JWT auth (cookie + Bearer + query param) | DEPLOYED | `backend/server.py` `/ws/updates`; invalid token closes with code 4401 |

---

## Drone Fleet

| Feature | Status | Notes / Evidence |
|---|---|---|
| Drone CRUD (create, read, update, delete) | DEPLOYED | `backend/server.py` `/api/drones`; UUID regex on path param (`_DRONE_ID_PATTERN`) |
| Drone deployment | DEPLOYED | `POST /api/drones/deploy`; `backend/server.py` |
| Background drone movement simulation | DEPLOYED | `backend/simulator.py` `tick_drone_simulation()`; 2 s tick, 0.5° step, battery drain |
| Drone telemetry signed observations | DEPLOYED | Every simulator tick writes `source_type="drone_telemetry"` observation via `backend/provenance.py` |
| Live drone position WebSocket broadcast | DEPLOYED | `ConnectionManager.broadcast()` in `backend/server.py`; `{"type":"drone_positions"}` |
| Drone camera feeds page | PLANNED | `frontend/src/pages/DroneCameraFeeds.jsx` page exists but real stream metadata / online-offline status not implemented (PRD P1) |
| `/drones/feeds` route ordering safety (UUID regex) | DEPLOYED | `Path(..., regex=_DRONE_ID_PATTERN)`; regression: `tests/test_api.py::test_drones_feeds_not_swallowed_by_uuid_route` |

---

## Multi-domain Robotics

| Feature | Status | Notes / Evidence |
|---|---|---|
| Robot CRUD (aerial, ground, aquatic, fixed_sensor, orbital) | DEPLOYED | `backend/server.py` `/api/robots`; multi-domain status fields |
| Robot deployment & task assignment | DEPLOYED | `POST /api/robots/deploy`, `POST /api/robots/{robot_id}/task` |
| Robotics Command Center UI | DEPLOYED | `frontend/src/pages/RoboticsCommandCenter.jsx` |

---

## Zone Management

| Feature | Status | Notes / Evidence |
|---|---|---|
| Zone CRUD (biodiversity, soil health, predator/prey, vegetation, priority) | DEPLOYED | `backend/server.py` `/api/zones` |
| Zone metrics visualization | DEPLOYED | `frontend/src/pages/ZoneManagement.jsx` |
| Interactive map with live drone positions & zone circles | DEPLOYED | `frontend/src/pages/EcosystemMap.jsx`; `react-leaflet` |

---

## Sensor & Alert Management

| Feature | Status | Notes / Evidence |
|---|---|---|
| Sensor CRUD | DEPLOYED | `backend/server.py` `/api/sensors` |
| Alert CRUD & read-marking | DEPLOYED | `backend/server.py` `/api/alerts`; `PUT /api/alerts/{id}/read`, `PUT /api/alerts/read-all` |

---

## Patrol Operations

| Feature | Status | Notes / Evidence |
|---|---|---|
| AI-optimized patrol route generation | DEPLOYED | `POST /api/patrols/generate`; `backend/server.py` |
| Patrol lifecycle (generate → complete) | DEPLOYED | `backend/server.py` `/api/patrols` |
| Patrol completion reports with biodiversity data | DEPLOYED | `frontend/src/pages/PatrolReports.jsx`; `GET /api/patrols/reports` |
| Patrol scheduling UI | DEPLOYED | `frontend/src/pages/PatrolScheduling.jsx` |

---

## Mission Control

| Feature | Status | Notes / Evidence |
|---|---|---|
| Mission planning (generate, authorize, abort, complete) | DEPLOYED | `backend/server.py` `/api/missions`; `_plan_mission()` |
| Mission counterfactual trajectories & 80% CI | DEPLOYED | `backend/server.py`; MCP `generate_mission` reuses same planner — parity locked by `tests/test_unit.py::test_mcp_generate_mission_reuses_rest_planner` |
| Mission evidence (counterfactuals + source hashes + attestation) | DEPLOYED | `GET /api/missions/{mission_id}` returns evidence bundle |
| Mission go/no-go score (`MISSION_GO_SCORE_FLOOR`) | DEPLOYED | `backend/server.py`; `MISSION_GO_SCORE_FLOOR` constant |

---

## Species Identification

| Feature | Status | Notes / Evidence |
|---|---|---|
| Species identification from image URL | DEPLOYED | `POST /api/species/identify`; `backend/species_id.py` deterministic taxonomy (5 biomes, IUCN-sourced) |
| Species ID history & statistics | DEPLOYED | `backend/server.py`; `frontend/src/pages/SpeciesIdentification.jsx` |
| Species ID signed as provenance observation | DEPLOYED | `backend/species_id.py` writes `source_type="species_identification"` chain entry; failure skipped with warning (non-fatal) |
| BioCLIP model swap-in | PLANNED | `SPECIES_IDENTIFIER=bioclip` env var slot prepared in `backend/species_id.py`; torch + open_clip deps not yet included |

---

## Ecosystem Forecasting

| Feature | Status | Notes / Evidence |
|---|---|---|
| Forecast generation (per-zone) | DEPLOYED | `POST /api/forecasts/generate/{zone_id}`; heuristic model (priority-based drift + random noise) |
| Counterfactual forecast endpoint | DEPLOYED | `POST /api/forecasts/counterfactual/{zone_id}` |
| Real time-series forecasting (Orbit / Greykite / Prophet) | PLANNED | Current model is simulated heuristic — no relationship to observed zone history; spike scoped in THE-22 |
| Forecasting UI | DEPLOYED | `frontend/src/pages/EcosystemForecasting.jsx` |

---

## Intervention Rules & Execution

| Feature | Status | Notes / Evidence |
|---|---|---|
| Intervention rule CRUD | DEPLOYED | `backend/server.py` `/api/interventions/rules` |
| Intervention execution (drop_seed_pod, deploy_predator_deterrent, deploy_water_sampler) | DEPLOYED | `POST /api/interventions/execute`; writes signed before/action/after triple via `backend/provenance.py` |
| Intervention execution signed observations | DEPLOYED | `tests/test_api.py::test_intervention_execute_writes_signed_triple` |
| Intervention UI | DEPLOYED | `frontend/src/pages/InterventionRules.jsx` |

---

## Weather

| Feature | Status | Notes / Evidence |
|---|---|---|
| Zone weather data | DEPLOYED | `backend/server.py` `/api/weather`, `/api/weather/{zone_id}` |
| Weather UI | DEPLOYED | `frontend/src/pages/WeatherDashboard.jsx` |

---

## Geofencing

| Feature | Status | Notes / Evidence |
|---|---|---|
| Geofence CRUD & boundary checks | DEPLOYED | `backend/server.py` `/api/geofences`; `POST /api/geofences/check` |
| Geofencing UI | DEPLOYED | `frontend/src/pages/Geofencing.jsx` |

---

## AI Recommendations

| Feature | Status | Notes / Evidence |
|---|---|---|
| AI analysis endpoint | DEPLOYED | `POST /api/ai/analyze`; uses `backend/emergentintegrations/llm/chat.py` (stub → OpenAI/Anthropic when key set) |
| AI recommendation history | DEPLOYED | `GET /api/ai/history`; `frontend/src/pages/AIRecommendations.jsx` |
| Evidence-backed AI recommendations (input snapshots, model metadata, accepted/ignored/actioned status) | PLANNED | Not yet implemented; PRD P1 |

---

## Team Collaboration & Tasks

| Feature | Status | Notes / Evidence |
|---|---|---|
| Task CRUD | DEPLOYED | `backend/server.py` `/api/tasks`; all mutations gated |
| Comments on tasks/entities | DEPLOYED | `backend/server.py` `/api/comments`; `POST` gated; `GET` in W2_UNGATED_BACKLOG |
| Team collaboration UI | DEPLOYED | `frontend/src/pages/TeamCollaboration.jsx` |

---

## Reports & Analytics

| Feature | Status | Notes / Evidence |
|---|---|---|
| Data export (CSV/PDF) | DEPLOYED | `backend/server.py` `/api/reports`; `frontend/src/pages/Reports.jsx` |
| Analytics / trend charts | DEPLOYED | `frontend/src/pages/Analytics.jsx`; `recharts` |
| Dashboard stats & trends | DEPLOYED | `GET /api/dashboard/stats`, `GET /api/dashboard/trends`; `frontend/src/pages/Dashboard.jsx` |

---

## Notifications

| Feature | Status | Notes / Evidence |
|---|---|---|
| Notification preference settings | DEPLOYED | `backend/server.py` `/api/notifications`; `frontend/src/pages/NotificationSettings.jsx` |
| Email / push notification delivery | PLANNED | Settings page exists; actual sending not implemented (PRD P1) |

---

## Signed Observation Chain (Provenance / DMRV)

| Feature | Status | Notes / Evidence |
|---|---|---|
| Ed25519 signed observations (drone telemetry, sensor readings, zone transitions, species ID, interventions) | DEPLOYED | `backend/provenance.py`; `sign_observation()`, `record_observation()` |
| HKDF key derivation from `JWT_SECRET` | DEPLOYED | `backend/provenance.py`; stable across restarts as long as `JWT_SECRET` unchanged |
| Public key publication (`/.well-known/keys.json`) | DEPLOYED | `backend/server.py` public route; auditors verify without trusting the platform |
| Observation verification endpoint | DEPLOYED | `POST /api/observations/verify` |
| Observation redact flag (admin-gated) | DEPLOYED | `_redact_for_public()` in `backend/server.py`; original bytes still verify; `PATCH /api/observations/{id}/redact` admin-only |
| Attestation lookback cap (168 h / 7 d) | DEPLOYED | `ATTESTATION_MAX_HOURS = 168`; `backend/server.py` `GET /api/zones/{zone_id}/attestation` |
| Satellite cross-witness (Sentinel-2 image hash) | DEPLOYED (default-OFF) | `backend/satellite.py`; requires `SATELLITE_WITNESS_ENABLED=1`; Element84 STAC backend; 6 h cadence; idempotent on `(zone_id, scene_id)` |
| Manual satellite tick endpoint | DEPLOYED | `POST /api/_internal/satellite-tick` (admin-only); `backend/server.py` |
| Mongo `_id` leak fix | DEPLOYED | Monkey-patch of `AsyncIOMotorCollection.insert_one` in `backend/server.py` import block; regression: `tests/test_api.py::test_no_id_leak_across_create_endpoints` |

---

## Auditor Surface (Gaia Prime)

| Feature | Status | Notes / Evidence |
|---|---|---|
| `/gaia-prime` auditor page (Ed25519 key, chain counters, attestation, curl cheatsheet) | DEPLOYED | `frontend/src/pages/GaiaPrime.jsx`; public endpoints only; no auth required |
| Public provenance stats endpoint | DEPLOYED | `GET /api/public/provenance/stats`; listed in `PUBLIC_ROUTES`; `backend/server.py` |
| Per-zone attestation endpoint | DEPLOYED | `GET /api/zones/{zone_id}/attestation`; `backend/server.py` |
| DMRV partner integration (Verra, Gold Standard) | PLANNED | `docs/DMRV_PARTNER_PROJECT_SHORTLIST.md`, `docs/DMRV_OUTREACH_DRAFTS.md` exist; no API integrations built |
| Measurement spec | DEPLOYED | `docs/MEASUREMENT_SPEC_v0.1.md`; `docs/METHODOLOGY_v0.1.md` |
| Auditor walkthrough guide | DEPLOYED | `docs/AUDITOR_WALKTHROUGH.md` |

---

## MCP Agent Surface

| Feature | Status | Notes / Evidence |
|---|---|---|
| MCP server (12 tools at `/mcp`) | DEPLOYED | `backend/mcp_server.py`; gated by `MCP_API_KEY` (503 if unset); graceful disable if FastMCP SDK absent |
| Tools: list_zones, pick_high_leverage_zone, generate_mission, authorize_mission, execute_intervention, verify_observation | DEPLOYED | `backend/mcp_server.py`; parity with REST planner locked by `tests/test_unit.py::test_mcp_generate_mission_reuses_rest_planner` |
| Tools: get_zone_attestation, forecast_counterfactual, identify_species_from_url, list_robots, get_dashboard_stats, get_mission | DEPLOYED | `backend/mcp_server.py` |

---

## Public Dashboard

| Feature | Status | Notes / Evidence |
|---|---|---|
| Public ecosystem status page (no auth) | DEPLOYED | `GET /api/public/dashboard`; `frontend/src/pages/PublicDashboard.jsx`; listed in `PUBLIC_ROUTES` |

---

## Infrastructure & DX

| Feature | Status | Notes / Evidence |
|---|---|---|
| Railway deployment (FastAPI backend + React frontend) | DEPLOYED | `backend/Procfile`; `railpack.json`; `docs/RAILWAY_PRODUCTION.md` |
| Post-deploy smoke test | DEPLOYED | `scripts/railway-smoke.mjs` |
| `JWT_SECRET` hardened with `AUTH_GATE_PHASE_A` gate verification in smoke test | PLANNED | Scoped in THE-21 (blocked by W2 batches 1–4) |
| MongoDB async client with `_id` leak patch | DEPLOYED | `backend/server.py` motor monkey-patch |
| pytest integration suite (auto-skip without live backend) | DEPLOYED | `tests/test_api.py` (~50+ tests); `tests/conftest.py` fixtures |
| Unit test suite including public-surface lock | DEPLOYED | `tests/test_unit.py`; `test_public_surface_is_locked`, `test_phase_a_middleware_*`, `test_mcp_generate_mission_reuses_rest_planner` |
| Frontend state kit (LoadingState, EmptyState, ErrorState, Skeleton, Toaster) | DEPLOYED | `frontend/src/components/state/`; barrel-exported as `@/components/state` |
| Comprehensive loading/error/empty states on all pages | PLANNED | State kit exists; full adoption across every page not yet verified (PRD P1) |
| Mongo indexes & structured backend logging | PLANNED | PRD P2 |
| `.env.example` files & developer reset scripts | PLANNED | PRD P2 |
| Dark mode | PLANNED | PRD P3 |
| Mobile companion app | PLANNED | PRD P3 |
