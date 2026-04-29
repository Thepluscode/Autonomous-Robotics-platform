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
```

If you use a custom frontend domain, add it to `FRONTEND_URL`. Multiple origins are comma-separated.

## Smoke test

After deployment:

```bash
node scripts/railway-smoke.mjs \
  --frontend https://<frontend-service>.up.railway.app \
  --backend https://<backend-service>.up.railway.app
```

The script checks:

- `/gaia-prime`
- `/login`
- `/api/`
- `/api/public/dashboard`

Then open `/gaia-prime` in a browser and confirm the console no longer shows public-page `/api/auth/me` noise.
