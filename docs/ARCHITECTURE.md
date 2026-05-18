# Architecture

> Audience: new engineers, auditors, and pilot integrators. This is the
> structural map. Operational detail lives next to the code in
> [`CLAUDE.md`](../CLAUDE.md) / [`AGENTS.md`](../AGENTS.md); methodology lives
> in [`METHODOLOGY_v0.1.md`](METHODOLOGY_v0.1.md).

## 1. What this system is

**Autonomous Ecosystem Architect** is a platform that runs swarms of
"ASI-controlled" drones and sensors over rewilding zones and emits a
**signed, append-only chain of observations** that third parties (Verra,
Gold Standard, regulators, pilot customers) can independently verify
without trusting our servers.

The product is *not* the dashboard. The dashboard is the operating
surface. The product is the **evidence layer** — every drone telemetry
point, sensor reading, zone transition, species identification, and
Sentinel-2 satellite cross-witness is SHA-256 hashed over a canonical
serialization and Ed25519-signed by a key whose public half is
published at `/.well-known/keys.json`.

Clone the dashboard in three months and you cannot clone six months of
signed history. That is the moat.

## 2. Bird's-eye view

```
                  Browser (React 18 + Tailwind + Shadcn)
                  ─────────────────────────────────────
                  ProtectedRoute → DashboardLayout
                  Pages (23x) ──┐
                  WebSocket ────┼──────────────┐
                  axios + cookies ─────┐       │
                                       ▼       ▼
   Auditor (curl)                FastAPI app (server.py, 3.5k LOC)
   ────────────  ───────────────────────────────────────────────
   /.well-known/keys.json          auth (JWT in httpOnly cookies)
   /api/observations               ├─ routes (auth → ... → seed)
   /api/zones/{id}/attestation     ├─ Phase-A auth-gate middleware
   /api/public/...                 ├─ ConnectionManager (WS)
   /api/observations/verify        ├─ CORS allowlist
                                   └─ Mongo _id leak monkey-patch

   MCP client (Claude Desktop, custom agent)
   ─────────────────────────────────────────
   /mcp (FastMCP, gated by MCP_API_KEY) ─── tools call REST helpers
                                            (same _plan_mission, etc.)

                                  │
                                  ▼
                       provenance.py (Ed25519 chain)
                       │
                       │  every observation: hash → sign → append
                       ▼
                    MongoDB (motor async)
                    ├─ observations   ← the chain
                    ├─ users          ← ObjectId-keyed (special)
                    ├─ zones, drones, sensors, alerts, missions,
                    │  patrols, species_identifications,
                    │  interventions, geofences, tasks, comments,
                    │  reports, notifications, weather, forecasts
                    └─ everything else: UUID-keyed

                       background loops
                       ─────────────────
                       simulator.py     ── 5s drone tick (always on)
                       satellite.py     ── 6h Sentinel-2 witness (off
                                           by default; flag-gated)
```

Two Railway services: backend (Python, `Procfile`) and frontend (Node,
`railpack.json`). They are independently deployable. GitHub auto-deploys
`main` on push. There is no separate CI — the Railway build is the
build. Post-deploy verification is [`scripts/railway-smoke.mjs`](../scripts/railway-smoke.mjs).

## 3. Backend layout (`backend/`)

The backend is intentionally *not* split into micro-packages. Routes are
grouped by prefix inside one big `server.py`. The grouping itself is
the navigation system. Cross-cutting concerns get their own module.

| Module | LOC | Role |
|---|---|---|
| `server.py` | 3501 | FastAPI app, every `@api_router` route, auth, `ConnectionManager`, CORS, startup/shutdown, Phase-A auth-gate, `_id`-leak monkey-patch, `_plan_mission`, `_redact_for_public` |
| `models.py` | 604 | Every Pydantic request/response/entity model. Specific names are explicitly imported into `server.py` — no star-import |
| `provenance.py` | 184 | **The chain.** Canonical serialization + Ed25519 sign/verify. Key resolution: `OBSERVATION_PRIVATE_KEY_B64` env, else HKDF from `JWT_SECRET`. Publishes public key + `kid` at `/.well-known/keys.json` |
| `mcp_server.py` | 437 | MCP surface mounted at `/mcp`. Tools (`list_zones`, `pick_high_leverage_zone`, `generate_mission`, `authorize_mission`, `execute_intervention`, `verify_observation`) reuse server-internal helpers via in-function imports to break the cycle |
| `satellite.py` | 266 | Sentinel-2 cross-witness loop. Default-off (`SATELLITE_WITNESS_ENABLED=1`). Manual trigger: `POST /api/_internal/satellite-tick` (admin) |
| `species_id.py` | 233 | Image → candidate species + confidence. Result is signed into the chain with `source_type="species_identification"`. Chain failure must not fail the ID request (logged + skipped) |
| `simulator.py` | 143 | `tick_drone_simulation(db, manager)` + supervised loop. Dependencies passed in explicitly — no compile-time dependency on `server.py` |

### Trust boundaries

```
                public auditor
                       │
                       ▼
   ┌─────────────── PUBLIC_ROUTES / PUBLIC_ROUTE_PATTERNS ──────────────┐
   │  /api/auth/{login,register,refresh}                                │
   │  /api/public/*                                                     │
   │  /api/observations (read; _redact_for_public on the way out)       │
   │  /api/observations/verify                                          │
   │  /api/zones/{id}/attestation  (clamped to 7d, ATTESTATION_MAX_HOURS)│
   │  /.well-known/keys.json                                            │
   └────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
   ┌─────────────── auth_gate_phase_a middleware (AUTH_GATE_PHASE_A) ───┐
   │  Default-off. When on: 401 anything outside the allowlist.         │
   │  CORS preflights bypass. /mcp/* bypasses (own MCP_API_KEY auth).   │
   └────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
   ┌─────────────── gated routes (Depends(get_current_user)) ───────────┐
   │  Most CRUD. role-checked via require_role([...]); admin always     │
   │  passes. W2_UNGATED_BACKLOG is the explicit list of routes still   │
   │  scheduled for hardening — test_public_surface_is_locked enforces  │
   │  this triad.                                                       │
   └────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
   ┌─────────────── admin-only ─────────────────────────────────────────┐
   │  /api/seed, /api/_internal/drone-tick, /api/_internal/satellite-   │
   │  tick, redact flag mutations, /ws/updates                          │
   └────────────────────────────────────────────────────────────────────┘
```

### The signed-observation chain — what's actually signed

Every write that matters routes through `provenance.append(...)`:

1. Build the observation dict (drone position, sensor reading, species ID, satellite scene hash, zone transition).
2. Canonical-serialize → SHA-256 hash.
3. Ed25519-sign the hash with the platform key.
4. Persist `{id, source_type, payload, hash, signature, kid, ts}` to `observations`.
5. Public consumers read through `_redact_for_public()` — if `redacted=true`, the payload is blanked but the signature still verifies against the *original* bytes for auditors with cause.

The redact flag exists because the chain is immutable on purpose. Mutating a signed payload would invalidate every downstream verification. See [`METHODOLOGY_v0.1.md`](METHODOLOGY_v0.1.md) §3 and [`THREAT_MODEL.md`](THREAT_MODEL.md).

## 4. Frontend layout (`frontend/src/`)

```
src/
├── App.js                       routes + ProtectedRoute wrapping
├── contexts/AuthContext.js      useAuth(), session restore via /me
├── lib/
│   ├── api.js                   single axios instance, withCredentials,
│   │                            single-flight 401 → refresh → retry
│   ├── toast.js                 imperative toast store (no provider)
│   └── utils.js
├── hooks/
│   └── useWebSocket.js          auto-reconnect 3s, ping 25s, cookie auth
├── components/
│   ├── layout/                  Sidebar, Header, DashboardLayout
│   ├── state/                   LoadingState, EmptyState, ErrorState,
│   │                            Skeleton*, Toaster — the state kit
│   └── ui/                      Shadcn primitives
└── pages/                       23 feature pages (one file each)
    ├── Login.jsx / Register.jsx
    ├── Dashboard.jsx, EcosystemMap.jsx, DroneFleet.jsx,
    │   RoboticsCommandCenter.jsx, MissionControl.jsx,
    │   DroneCameraFeeds.jsx, PatrolScheduling.jsx,
    │   PatrolReports.jsx, SpeciesIdentification.jsx,
    │   ZoneManagement.jsx, Geofencing.jsx,
    │   InterventionRules.jsx, AIRecommendations.jsx,
    │   EcosystemForecasting.jsx, WeatherDashboard.jsx,
    │   TeamCollaboration.jsx, Reports.jsx, Analytics.jsx,
    │   NotificationSettings.jsx
    ├── PublicDashboard.jsx      /public — investor HUD (dark Gaia)
    └── GaiaPrime.jsx            /gaia-prime — auditor surface (Earthy)
```

Two surfaces, different audiences:

- `/public` — investor HUD, dark theme, vanity-friendly.
- `/gaia-prime` — auditor surface, calm terminal-flavored, sources counters from the same Mongo collection `/api/observations` reads so what the page shows and what an auditor pulls agree by construction.

State management is intentionally minimal: React Context for auth, axios + cookies for everything else, imperative toast store, no Redux/Zustand/Jotai. Pages must use the state kit (`LoadingState` / `EmptyState` / `ErrorState`) — empty surfaces are how silent failures masquerade as "no data."

## 5. Key data flows

### 5.1 Login → authenticated page → API call → 401 refresh

```
Browser              Backend
   │   POST /api/auth/login (email, pw)
   │──────────────────────────────────▶│
   │                                    │ verify bcrypt
   │                                    │ Set-Cookie: access_token (60min, httpOnly)
   │                                    │ Set-Cookie: refresh_token (7d, httpOnly)
   │◀───────────────────────────────────│ body echoes tokens (for non-browser clients)
   │   GET /api/auth/me   [cookie]
   │──────────────────────────────────▶│ get_current_user(request)
   │◀───────────────────────────────────│ {id, email, name, role}
   │
   │   GET /api/drones    [cookie]
   │──────────────────────────────────▶│
   │◀────────── 401 ────────────────────│ access_token expired
   │   POST /api/auth/refresh [cookie]
   │──────────────────────────────────▶│ rotates access_token cookie
   │◀───────────────────────────────────│ 200
   │   GET /api/drones (retried)
   │──────────────────────────────────▶│
   │◀───────────────────────────────────│ 200
```

The single-flight queue in [`lib/api.js`](../frontend/src/lib/api.js) prevents concurrent 401s from triggering multiple refreshes. The JS bundle never sees raw tokens — they ride entirely on httpOnly cookies. Cross-site cookies in prod require `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none` (see [`RAILWAY_PRODUCTION.md`](RAILWAY_PRODUCTION.md)).

### 5.2 Drone tick (5s, background)

```
simulator.run_drone_simulation_loop(db, manager)
   │
   │ every DRONE_TICK_INTERVAL_S (5s)
   ▼
tick_drone_simulation(db, manager)
   │ pull drones where status in {"patrolling","deployed"}
   │ for each drone:
   │   look up assigned zone_id → zone center
   │   step toward center by DRONE_STEP_DEG (~5km)
   │   drain battery 0.05 + 5×distance (floor DRONE_MIN_BATTERY=5)
   │   provenance.append(source_type="drone_telemetry", payload={...})
   ▼
manager.broadcast({"type":"drone_positions","drones":[...],"ts":...})
   │
   ▼  WebSocket
all connected dashboard clients
```

Tests drive the simulator deterministically via the admin-only unlisted `POST /api/_internal/drone-tick` endpoint — much faster than waiting 5s.

### 5.3 Satellite cross-witness (6h, opt-in)

```
satellite.run_satellite_witness_loop(db)  ← only if SATELLITE_WITNESS_ENABLED=1
   │ every SATELLITE_TICK_INTERVAL_S (6h)
   ▼
tick_satellite_witness(db)
   │ for each zone (cap SATELLITE_MAX_ZONES_PER_TICK=20):
   │   query Element84 earth-search STAC API
   │   filter: cloud_cover ≤ SATELLITE_MAX_CLOUD_COVER, bbox covers zone
   │   fetch thumbnail bytes, SHA-256 hash
   │   provenance.append(source_type="satellite_image_hash",
   │     payload={zone_id, scene_id, hash, taken_at, cloud_cover})
   │   idempotent on (zone_id, scene_id) — no duplicate witness
```

This is the "the platform isn't lying about a zone existing" gate. Auditor verification flow: [`METHODOLOGY_v0.1.md`](METHODOLOGY_v0.1.md) §2.

### 5.4 MCP tool call (agent → platform)

```
Claude Desktop / custom agent
   │  POST /mcp/...   header: x-mcp-key: $MCP_API_KEY
   ▼
FastMCP app (mounted in server.py)
   │  tool: generate_mission(zone_id, ...)
   ▼
In-function imports from server.py:
   _plan_mission(...)          ← same fn the REST route uses
   MISSION_GO_SCORE_FLOOR      ← same constant
   Mission(...)                 ← same Pydantic model
   │
   ▼
Mongo write + provenance.append(...)
   │
   ▼
MCP response (signed observation id)
```

**Parity is enforced by AST test.** `tests/test_unit.py::test_mcp_generate_mission_reuses_rest_planner` walks the MCP tool's source and asserts it still imports `_plan_mission`, `MISSION_GO_SCORE_FLOOR`, `Mission`, and `MissionGenerateRequest` from `server` / `models`. Fork the planner for MCP-only behavior and this test fails. That is the only thing preventing the dashboard loop and the agent loop from silently diverging.

## 6. Storage model

MongoDB, accessed via `motor.motor_asyncio`. One async client, one DB (`DB_NAME` env), many collections.

| Collection | Key | Special |
|---|---|---|
| `users` | `_id: ObjectId` | The only ObjectId-keyed collection. Auth code converts to/from `str` at the boundary. **Not** modeled in `models.py` — raw dict. |
| `observations` | `id: uuid` | The chain. Append-only. `redacted=true` blanks payload for public consumers, signature still verifies. |
| `zones`, `drones`, `sensors`, `alerts`, `missions`, `patrols`, `species_identifications`, `interventions`, `geofences`, `tasks`, `comments`, `reports`, `notifications`, `weather`, `forecasts` | `id: uuid` | Standard UUID-keyed entities. |

`motor.insert_one(doc)` mutates `doc` to attach a Mongo `_id`. That used to 500 routes that returned the dict directly. Fixed once at import time in `server.py` via a monkey-patch of `AsyncIOMotorCollection.insert_one` that pops `_id` after insert. Regression guard: `tests/test_api.py::test_no_id_leak_across_create_endpoints`. Don't remove the patch.

## 7. External surfaces — what's public

| Surface | Auth | Audience |
|---|---|---|
| `/.well-known/keys.json` | none | auditors, regulators, anyone verifying signatures |
| `/api/public/dashboard` | none | investor HUD, marketing |
| `/api/public/provenance/stats` | none | `/gaia-prime` chain counters |
| `/api/observations` (GET) | none, `_redact_for_public` applied | auditors pulling the chain |
| `/api/observations/verify` (POST) | none | auditors verifying a payload + signature offline |
| `/api/zones/{id}/attestation` | none, clamped to 7d | auditors pulling per-zone Merkle/aggregate roots |
| `/api/auth/*` | none for login/register/refresh | the login flow itself |
| `/api/*` (rest) | cookie or Bearer JWT | dashboard + integrators |
| `/ws/updates` | cookie (preferred) / `?token=` / `Authorization: Bearer` | dashboard real-time updates |
| `/mcp/*` | `x-mcp-key: $MCP_API_KEY` (503 if unset) | MCP agents |

The triad **public allowlist / gated / W2_UNGATED_BACKLOG** is enforced by `tests/test_unit.py::test_public_surface_is_locked`. Adding a new ungated route fails the test with a hint pointing at the three remediation options.

## 8. Configuration model

`.env` is loaded with `override=False` — explicitly-set environment variables (Railway, CI, the shell) win over the file. Required:

- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET` (≥32 chars, not a known default — server refuses to boot otherwise; `JWT_SECRET_ALLOW_INSECURE=1` bypasses for local-only and logs CRITICAL every boot)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `EMERGENT_LLM_KEY` (or, preferred: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — the proprietary key is rejected by api.openai.com)

Auth/cookies in prod (cross-site):

- `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`
- `FRONTEND_URL` (CORS allowlist seed) + `CORS_ORIGINS` (additional)
- `allow_credentials=True` — `*` is incompatible, so the named allowlist is mandatory

Feature flags:

- `AUTH_GATE_PHASE_A` — turn on the middleware. **Default-off**, ships dark, fully reversible.
- `SATELLITE_WITNESS_ENABLED` — start the 6h Sentinel-2 loop.
- `DEV_MODE=1` — write admin password to `memory/test_credentials.md` on startup (off by default; that file is a credential leak waiting to happen).
- `ADMIN_FORCE_RESET=1` — recover from a forgotten admin password.
- `LLM_DISABLE=1` — force the deterministic LLM fallback.
- `ENABLE_HEALTH_CHECK=true` (frontend) — load the optional `plugins/health-check/*` modules.

Provenance key:

- `OBSERVATION_PRIVATE_KEY_B64` — raw 32-byte base64. **If unset**, the key is HKDF-derived from `JWT_SECRET`. Rotating `JWT_SECRET` therefore rotates the chain. Don't rotate it casually.

## 9. Testing topology

```
tests/
├── conftest.py                shared fixtures
│                              api · admin_token · auth_headers
│                              seeded · unique_name
├── test_api.py                live HTTP — needs backend + Mongo running
│                              auto-skips when backend is unreachable
└── test_unit.py               pure unit + AST regression guards:
                               · test_mcp_generate_mission_reuses_rest_planner
                               · test_public_surface_is_locked
                               · test_phase_a_middleware_*
```

`tests/test_api.py` hits a live backend over HTTP. `BACKEND_URL=...` overrides the target. `pytest -k <substring>` filters; `-x` stops on first failure.

`test_reports/iteration_*.json` are previous run snapshots — informational, not fixtures.

## 10. Deployment

```
GitHub main ── push
                │
                ▼
        Railway (auto-deploy)
        │
        ├─── backend service (Root Directory: backend/)
        │     Procfile: web: uvicorn server:app --host 0.0.0.0 --port $PORT
        │     env: MONGO_URL, JWT_SECRET, ADMIN_*, COOKIE_*, FRONTEND_URL, ...
        │
        └─── frontend service (Node, fallback to railpack.json at repo root)
              build: react-scripts build
              run: serve -s build
              env: REACT_APP_BACKEND_URL
                │
                ▼
            scripts/railway-smoke.mjs  ← run after every prod deploy
```

There is no separate CI. The Railway build is the build. "Build succeeded" is not "feature works" — the smoke script is non-optional.

See [`RAILWAY_PRODUCTION.md`](RAILWAY_PRODUCTION.md) for the env-var checklist.

## 11. Where to extend

| Task | Where |
|---|---|
| New REST route | `server.py`, in the existing prefix group |
| New Pydantic model | `models.py`, then import the name into `server.py` |
| New observation source | Build the payload, call `provenance.append(source_type=..., payload=...)`. Wrap chain failure in try/except — must not fail the original write. |
| New MCP tool | `mcp_server.py`, import server helpers **inside** the function body (cycle break). No `from __future__ import annotations`. No `Optional[T]` in signatures (FastMCP 1.12.4 bug). |
| New page | `frontend/src/pages/<Name>.jsx` + route in `App.js`. Use the state kit. Add `data-testid` (kebab-case) to interactives. |
| New API client group | Named export in `frontend/src/lib/api.js`. Don't call axios directly from pages. |
| New public route | Add to `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PATTERNS` in `server.py`. Add regression test in `tests/test_unit.py`. |
| Harden a W2 backlog route | Add `Depends(get_current_user)` or `Depends(require_role(...))`. Remove from `W2_UNGATED_BACKLOG`. `test_public_surface_is_locked` will confirm. |

## 12. Things that look weird and aren't

- **`server.py` is 3.5k lines.** The grouping by route prefix is the navigation system. Don't split for splitting's sake. Cross-cutting concerns earn their own module (`provenance.py`, `mcp_server.py`, `satellite.py`, `simulator.py`).
- **The `User` doc is not in `models.py`.** It's a raw Mongo dict keyed by `ObjectId`. Auth converts at the boundary. Don't "consolidate" without rewriting `get_current_user`.
- **`emergentintegrations/` is a local replacement** of a proprietary SDK. Real OpenAI/Anthropic when keys are set, deterministic fallback otherwise. If you ever install the real PyPI package, delete this stub or it shadows the install.
- **`/gaia-prime` deliberately uses the Earthy/Light theme, not the dark Gaia HUD on `/public`.** The audience is "verify us" reviewers, not investors. Don't make it match `/public`.
- **No framer-motion / GSAP.** `design_guidelines.json` mandates calm 0.2s ease transitions only.
- **`AGENTS.md` is a near-duplicate of `CLAUDE.md`.** Codex's harness reads `AGENTS.md`; Claude Code reads `CLAUDE.md`. Update both when run/build/test or repo conventions change.
