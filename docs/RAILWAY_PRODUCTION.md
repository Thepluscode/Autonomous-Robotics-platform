# Railway Production Checklist

Use this when deploying the Gaia Prime frontend and FastAPI backend as separate Railway services.

## Frontend variables

Set these on the frontend service:

```bash
REACT_APP_BACKEND_URL=https://<backend-service>.up.railway.app
REACT_APP_WS_URL=wss://<backend-service>.up.railway.app
ENABLE_HEALTH_CHECK=false
```

`REACT_APP_WS_URL` is optional when the WebSocket endpoint uses the same host as `REACT_APP_BACKEND_URL`, but setting it explicitly makes production behavior obvious.

## Backend variables

Set these on the backend service:

```bash
MONGO_URL=<railway-mongodb-url>
DB_NAME=<database-name>
JWT_SECRET=<long-random-secret>
ADMIN_EMAIL=<admin-email>
ADMIN_PASSWORD=<admin-password>
FRONTEND_URL=https://<frontend-service>.up.railway.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
# AUTH_GATE_PHASE_A is ON by default (secure-by-default). Leave it UNSET in prod.
# Set to 0/false ONLY for temporary debugging — that disables the auth gate.
```

If you use a custom frontend domain, add it to `FRONTEND_URL`. Multiple origins are comma-separated.

**Auth gate:** `AUTH_GATE_PHASE_A` is **enabled by default** — every non-public route requires a valid access JWT. The public surface is the `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PATTERNS` allowlist (login + refresh, `/api/public/*`, observations, attestation, `.well-known/keys.json`). Do **not** set it to `0` in production; the post-deploy smoke test asserts a protected route returns `401`.

## Smoke test

After deployment:

```bash
node scripts/railway-smoke.mjs \
  --frontend https://<frontend-service>.up.railway.app \
  --backend https://<backend-service>.up.railway.app
```

The script checks:

- `frontend /gaia-prime` — HTML 200
- `frontend /login` — HTML 200
- `backend /api/` — JSON 200
- `backend /api/public/dashboard` — JSON 200 (deliberate public route)
- `backend /.well-known/keys.json` — JSON 200 (auditor public-key endpoint must stay reachable)
- `backend /api/drones` (anonymous) — **401** (auth gate is ON; failure here means the gate is disabled)

Then open `/gaia-prime` in a browser and confirm the console no longer shows public-page `/api/auth/me` noise.
