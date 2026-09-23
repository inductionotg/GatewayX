# Redis-backed gateway sessions

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

The gateway verifies credentials through User Service, regenerates the session
ID, and explicitly saves `{id, name, email}` in Redis before returning success.
Passwords and hashes are never stored in the session or cookie. The HTTP-only
cookie contains a signed opaque session ID. Redis keys default to
`gatewayx:sessions:<id>`. There is no MemoryStore fallback.

## Configuration and running

`gateway/.env` contains a generated random SESSION_SECRET. Both gateways read
the same file; `.env.instance2` overrides only PORT. Never commit the secret.
The committed `.env.example` has a blank placeholder; generate at least 32 random
bytes when setting up a new environment.

```dotenv
PORT=3200
REDIS_URL=redis://127.0.0.1:6380
SESSION_COOKIE_NAME=gatewayx.sid
SESSION_TTL_SECONDS=1800
SESSION_REDIS_PREFIX=gatewayx:sessions:
SESSION_REDIS_TIMEOUT_MS=2000
```

Start Redis and User Service, then run separate gateway terminals from the root:

```powershell
npm run dev -w gateway
npm run dev:instance2 -w gateway
```

Gateway 1 uses 3200 and gateway 2 uses 3201. Use one hostname consistently;
cookies are not scoped by port, but localhost and 127.0.0.1 are different hosts.
On a fresh checkout, create `gateway/.env.instance2` containing `PORT=3201`;
local `.env` files are intentionally excluded from version control.

## Endpoints

| Method and path | Behavior |
|---|---|
| POST /api/auth/login | JSON email/password; returns safe user data and session cookie |
| GET /api/auth/me | Returns session user, or 401 |
| POST /api/auth/logout | JSON `{}`; deletes Redis session and clears cookie; returns 204 |

Login/logout accept only JSON. Browser Origin, when present, must match the
gateway's origin. No permissive cross-origin credentials policy is enabled.
Use a same-origin frontend initially. Products and registration remain public;
`requireAuth` is reusable when later routes require login.

Cookie settings: HttpOnly, SameSite=Lax, Path=/, rolling 30-minute inactivity
expiry. Secure is forced in production; use HTTPS there. Set TRUST_PROXY_HOPS
only to match an explicitly trusted reverse-proxy deployment so Express can
recognize HTTPS termination. Do not blindly trust arbitrary forwarded headers.

Authenticated API requests refresh the Redis TTL using EXPIRE before the response
is sent. EXPIRE cannot recreate a key removed by logout. Existing sessions are
not resaved on ordinary requests. Anonymous public requests create no session;
the subsequently added rate limiter still requires Redis for their counters.
Existing session cookies and authentication routes
require Redis; connection/store failures return 503. Health remains independent.

The Redis connection reconnects automatically, disables offline command queues,
and session store operations have a deadline. Failed login saves never return
success or issue a usable cookie. A logout whose deletion fails returns 503:
the client must not assume the session was invalidated. Requests already
authorized before a concurrent logout may finish; later requests are rejected.

## Manual cross-gateway demonstration

Register an account via POST /api/users first. Then in PowerShell:

```powershell
$credentials = @{
  email = "demo@example.com"
  password = "A-long-demo-password-42"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3200/api/auth/login `
  -ContentType application/json -Body $credentials -SessionVariable loginSession

Invoke-RestMethod http://localhost:3201/api/auth/me -WebSession $loginSession
```

Restart only gateway 1. Repeat `/api/auth/me` on port 3200 with the same session.
Then log out through gateway 2:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3201/api/auth/logout `
  -ContentType application/json -Body '{}' -WebSession $loginSession
```

`/api/auth/me` now returns 401 on both gateways. No sticky sessions are needed.

## Verification

```powershell
node scripts/session-live-demo.mjs
```

Session integration tests use real Redis with a unique prefix and clean up only
their own keys. They check shared sessions, rotation, tampered cookies, expiry,
idle refresh, logout, unavailable connections, failed saves, and origin checks.
The live demo additionally starts two independent Node gateway processes on
temporary ports, creates a temporary real user, terminates/restarts one process,
and verifies the original cookie still works. It removes its test user/session
and stops its own gateway processes afterward. User Service must be running.

The token-bucket rate limiter now limits API requests and applies a stricter IP
allowance to login and registration. Redis persistence/redundancy determine survival of Redis failures;
this step proves survival of gateway restarts.

## Recorded result — 2026-09-23

All 13 gateway checks and both Redis session integration scenarios passed.
The live two-process demonstration also passed all three assertions: shared
login, survival of a complete gateway process restart, and cross-gateway logout.
Temporary test accounts and session keys were cleaned up. Updated gateways were
left running on 3200 and 3201; unauthenticated `/api/auth/me` returned 401 on
both, and `/health` returned 200 without issuing a session cookie.

References: [Express session](https://expressjs.com/en/resources/middleware/session/)
and [connect-redis](https://github.com/tj/connect-redis).
