# Autonomous Ecosystem Architect

Dashboard for managing drones, sensors, patrols, alerts, and AI-assisted monitoring across rewilding zones.

## Stack

- Backend: FastAPI, Motor, MongoDB
- Frontend: React 18, Craco, Tailwind CSS, Shadcn-style UI, Recharts, Leaflet
- AI: local `emergentintegrations` compatibility layer with optional OpenAI or Anthropic provider keys

## Run Locally

Backend requires MongoDB on `localhost:27017`.

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Frontend:

```bash
cd frontend
npm install
npm start
```

The frontend expects `REACT_APP_BACKEND_URL`, defaulting to `http://localhost:8001`.

## Test

The pytest suite hits a live backend and auto-skips when the backend is unreachable.

```bash
pytest tests/
```

Override the target with:

```bash
BACKEND_URL=http://localhost:8001 pytest tests/
```

## Useful Notes

- API routes are under `/api`.
- WebSocket updates are available at `ws://localhost:8001/ws/updates`.
- Default local admin credentials are documented in `AGENTS.md`.
- Add new API tests to `tests/test_api.py`; `backend_test.py` is legacy.
- New Mongo write endpoints should use `insert_and_return` to avoid leaking Mongo `_id` values.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — structural map: backend modules, frontend layout, data flows, trust boundaries, where to extend. Start here.
- [`docs/METHODOLOGY_v0.1.md`](docs/METHODOLOGY_v0.1.md) — how the signed-observation chain works end-to-end.
- [`docs/AUDITOR_WALKTHROUGH.md`](docs/AUDITOR_WALKTHROUGH.md) — independent verification recipe (curl + python, ~10 min).
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — adversary analysis. Read before touching `provenance.py`.
- [`docs/RAILWAY_PRODUCTION.md`](docs/RAILWAY_PRODUCTION.md) — env-var checklist for prod deploys.
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — operational gotchas for the agent harnesses.
