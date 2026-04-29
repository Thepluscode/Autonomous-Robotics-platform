# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

**Autonomous Ecosystem Architect** — a dashboard for managing swarms of "ASI-controlled" drones and sensors that monitor rewilding zones (biodiversity, soil health, predator/prey balance). Two-tier app: FastAPI + MongoDB backend, React (CRA/Craco) frontend. Live PRD lives in `memory/PRD.md`.

## Run / Build / Test

### Backend (FastAPI, requires MongoDB on `localhost:27017`)
```bash
cd backend
pip install -r requirements.txt          # one-time
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
- All routes mounted under `/api`. WebSocket: `ws://localhost:8001/ws/updates`.
- On first startup, the server creates the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and writes credentials to `memory/test_credentials.md`. It also kicks off `simulate_drone_movements()` (background task that mutates patrolling drones every 5s).
- Required env (`backend/.env`): `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `EMERGENT_LLM_KEY`. Optional: `DEV_MODE=1` makes the server write the admin password into `memory/test_credentials.md` on startup (off by default — that file is a credential leak waiting to happen). CORS is currently `allow_origins=["*"]` with `allow_credentials=False`.

### Frontend (React 18 + Craco)
```bash
cd frontend
npm install                               # one-time
npm start                                 # craco start → http://localhost:3000
npm run build
npm test                                  # craco test (CRA Jest)
```
- `frontend/.env` must set `REACT_APP_BACKEND_URL` (defaults to `http://localhost:8001`). The frontend derives the WebSocket URL from this by swapping `http`→`ws`.
- Set `ENABLE_HEALTH_CHECK=true` to load the optional `plugins/health-check/*` modules (the dir is gitignored / not always present — leave `false` unless you've added them).
- Path alias `@` → `frontend/src` (configured in `craco.config.js` and `jsconfig.json`).
- `@emergentbase/visual-edits/craco` is loaded only in dev and silently skipped if not installed.

### Tests
- `tests/` is the **pytest** suite (run from repo root: `pytest tests/`). Tests hit a live backend over HTTP — they need MongoDB and the FastAPI server running. The whole module **auto-skips** when the backend isn't reachable, so a missing dev server doesn't masquerade as a failure. Override the target with `BACKEND_URL=http://host:port pytest tests/`.
- Run a single test: `pytest tests/test_api.py::test_no_id_leak_across_create_endpoints -v`. Add `-k <substring>` to filter, `-x` to stop on first failure.
- Shared fixtures live in `tests/conftest.py`: `api` (ApiClient that auto-prefixes `/api`), `admin_token` / `auth_headers` (logs in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`, defaults to `admin@ecosystem.com`/`EcoAdmin2024!`), `seeded` (calls `POST /api/seed` once), `unique_name` (per-test UUID slug). Reuse these instead of re-implementing login/seed.
- `backend_test.py` was a legacy standalone CLI runner; **deleted**. All tests live in `tests/test_api.py` now.
- `test_reports/iteration_*.json` are previous run snapshots — informational, not fixtures.

### Mongo `_id` leak — fixed globally at import time
`motor.insert_one(doc)` mutates `doc` by attaching a non-serializable Mongo `_id`. Routes that returned that dict used to 500. Fixed once in `server.py` near the imports: a small monkey-patch of `AsyncIOMotorCollection.insert_one` pops `_id` from the input dict after insert. Every write site is now safe by default. The `insert_and_return` helper is preserved as a documented pattern (belt-and-suspenders) but is no longer load-bearing. Regression guard: `tests/test_api.py::test_no_id_leak_across_create_endpoints`.

### Drones route — UUID regex enforces ordering safety
The literal `/drones/feeds` route used to depend on decorator ordering (it had to come before `/drones/{drone_id}` or FastAPI would match `feeds` as a drone_id). It now uses `Path(..., regex=_DRONE_ID_PATTERN)` (UUID-only) on `get_drone` / `update_drone` / `delete_drone`, so route order no longer matters. Non-UUID drone IDs return 422 (path validation). Regression guards: `tests/test_api.py::test_drones_feeds_not_swallowed_by_uuid_route` and `::test_drones_route_rejects_non_uuid_path`.

## Architecture

### Backend — three modules in `backend/`
- **`server.py`** (~1570 lines) — FastAPI app, all `@api_router` route handlers, auth helpers, `ConnectionManager`, startup/shutdown, CORS, motor `_id`-leak monkey-patch. New routes go here, in the existing grouping (auth → weather → interventions → forecasts → geofences → tasks/comments → reports → public → drones → zones → sensors → alerts → AI → dashboard → patrols → species → notifications → seed).
- **`models.py`** (~390 lines) — every Pydantic request/response/entity model. Star-imported into server.py so handlers reference `Drone`, `Zone`, etc. by bare name. Add new models here.
- **`simulator.py`** (~110 lines) — `tick_drone_simulation(db, manager)` and the supervised `run_drone_simulation_loop(db, manager)` plus the four `DRONE_*` constants. Db handle and ConnectionManager are passed in explicitly so this module has no compile-time dependency on server.py (no circular imports).

The User document is intentionally **not** modeled — it's a raw Mongo doc keyed by `ObjectId`, with auth code converting on the way in/out. Don't try to "consolidate" it into models.py without rewriting `get_current_user`.

- **Mongo**: `motor.motor_asyncio` async client. Most documents use UUID `id` strings except `users`, which is keyed by Mongo `ObjectId` (auth code converts via `ObjectId(payload["sub"])`). Don't change this without updating `get_current_user`.
- **Auth**: JWT in `Authorization: Bearer …` (also accepts `access_token` cookie). Access tokens 60min, refresh tokens 7d. `require_role([...])` is the dependency for RBAC; `admin` always passes role checks (also enforced in the frontend `ProtectedRoute`). Currently only `/api/seed`, `/api/_internal/drone-tick`, and the `/ws/updates` WebSocket are auth-gated — most CRUD routes are still wide open. Hardening the rest is on the roadmap, not done.
- **Roles**: `admin`, `field_operator`, `scientist`, `viewer` (`ROLE_PERMISSIONS` map). Page-level role gates live in `frontend/src/App.js`.
- **WebSocket**: `ConnectionManager` broadcasts to all sockets connected on `/ws/updates`. Clients must authenticate by passing a JWT access token as `?token=...` query param (browsers can't set headers on WS) or `Authorization: Bearer <token>` header (non-browser). Invalid/missing/expired tokens close the connection with code 4401. Clients send `"ping"` and expect `{"type":"pong"}`.
- **LLM**: imports `emergentintegrations.llm.chat` — this repo ships a **local replacement** at `backend/emergentintegrations/llm/chat.py` that mirrors the proprietary SDK's interface (`LlmChat(api_key, session_id, system_message).with_model(provider, model)`, `await chat.send_message(UserMessage(text, image_urls))`). It dispatches to **real OpenAI** when `OPENAI_API_KEY` is set, **real Anthropic** when `ANTHROPIC_API_KEY` is set and `provider="anthropic"`, and otherwise produces a deterministic context-aware fallback (echoes a slice of the system message + prompt rather than a canned "Red Fox 92%" string). Optional env: `OPENAI_MODEL` (default `gpt-4o-mini`), `ANTHROPIC_MODEL` (default `claude-haiku-4-5`), `LLM_DISABLE=1` to force fallback. Note: `EMERGENT_LLM_KEY` (`sk-emergent-…`) in `.env` is rejected by api.openai.com directly — use a real `OPENAI_API_KEY` for live AI. If you ever install the real `emergentintegrations` PyPI package, delete the local stub or it will shadow the install.
- **Background simulation**: `simulate_drone_movements()` runs `_tick_drone_simulation()` every `DRONE_TICK_INTERVAL_S` (5s). Each tick pulls drones with `status in {"patrolling","deployed"}`, looks up their assigned `zone_id`, and steps them toward the zone center by `DRONE_STEP_DEG` (≈5km). Battery drains 0.05 + 5×distance per tick down to a `DRONE_MIN_BATTERY` floor of 5. Position updates are then broadcast to all WebSocket clients as `{"type":"drone_positions","drones":[...],"ts":...}`. Tests can drive the simulator deterministically via the unlisted `POST /api/_internal/drone-tick` endpoint — much faster than waiting for the loop. Drones with no assigned `zone_id` hover (no movement) instead of jittering.

### Frontend — React 18 + Tailwind + Shadcn UI
- Entry: `src/index.js` → `src/App.js`. All routes are declared in `App.js`; protected routes wrap `DashboardLayout` (Sidebar + Header) and pass an optional `roles` array to `ProtectedRoute`.
- API layer: `src/lib/api.js` — single axios instance with request interceptor (Bearer token from localStorage keys `eco_access_token`/`eco_refresh_token`) and response interceptor that handles 401 → `/api/auth/refresh` (sends `X-Refresh-Token` header) → retries the original request, with a queue so concurrent 401s don't trigger multiple refreshes. Add new API groups here as named exports rather than calling axios directly from pages.
- Auth state: `src/contexts/AuthContext.js` (`useAuth()`, `<ProtectedRoute>`). On login/register the response body's `access_token`/`refresh_token` are stored — the backend also sets cookies, but the frontend uses tokens.
- WebSocket: `src/hooks/useWebSocket.js` auto-reconnects every 3s and pings every 25s.
- Pages: each top-level feature is one file in `src/pages/*.jsx`. UI primitives (Shadcn-style) live in `src/components/ui/`; only Sidebar/Header are in `src/components/layout/`.
- Maps use `react-leaflet` + `leaflet`. Charts use `recharts`. Don't add framer-motion/GSAP — `design_guidelines.json` mandates calm 0.2s ease transitions only.

### Design system
`design_guidelines.json` is the source of truth for the visual theme (Earthy/Light, "Control Room" grid, moss-green primary, terracotta accent, Outfit/DM Sans/JetBrains Mono). Tailwind tokens are wired through CSS variables in `src/index.css`. Two non-obvious rules:
- All interactive elements need a `data-testid` in kebab-case.
- Do **not** use external placeholder image services; use only the URLs listed in `design_guidelines.json`.

## Working Conventions Specific to This Repo

- `test_result.md` is a structured agent-handoff file with a "DO NOT EDIT" header block. The main agent updates the YAML body; a separate testing agent reads it. Preserve the header verbatim if you touch this file.
- `memory/` holds the PRD and the auto-generated `test_credentials.md`. Don't commit additional secrets here.
- `gitignore.txt` (note: not `.gitignore`) is a reference file only — this directory isn't a git repo. There's no CI; "deploys" don't exist locally.
- Default admin (per `backend/.env`): `admin@ecosystem.com` / `EcoAdmin2024!`. Useful for quick logins; rotate before exposing the backend.
- The mock `emergentintegrations` package means AI features always return the same canned strings — when "the AI gave a suspiciously generic answer," that's why.
- `CLAUDE.md` (sibling file for Claude Code) is intentionally a near-duplicate of this file. When you change run/build/test commands, repo conventions, or the gotchas above, update both so the two agent harnesses stay in sync.
