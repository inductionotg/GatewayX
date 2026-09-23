# Dockerization step 3: two gateways

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

Both gateway containers use the same image and `gateway/.env.docker`. Requests
reach backend containers by Compose DNS name. Sessions and rate counters live
in shared Redis; round-robin pointers and circuit states remain local to each
gateway process.

```text
localhost:3320 -> gateway-1:3000 --+--> product-service:3002 -> products_db
localhost:3321 -> gateway-2:3000 --+--> review-service:3003  -> reviews_db
                                +--> user-service:3001    -> users_db
                                +--> redis:6379 (sessions and rate limits)
```

Step 4 adds a shared entry URL on port 3380 and a second product replica. See
[load balancing and outage demo](docker-load-balancing.md). The direct gateway
ports remain available for local diagnostics.

## Configuration and startup

On a fresh checkout, copy `gateway/.env.docker.example` to `gateway/.env.docker`.
Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
and set `SESSION_SECRET` in that file. Both gateways must use the same value.
Complete the backend setup and migrations from [step 2](docker-backend-services.md).

```powershell
docker compose --profile apps build gateway-1
docker compose --profile apps up -d --wait gateway-1 gateway-2
```

The Dockerfile defaults to production. This local Compose configuration sets
`NODE_ENV=development` for HTTP testing, including non-Secure cookies and the
circuit debug endpoint. Production requires HTTPS and `NODE_ENV=production`;
the application then requires Secure cookies and hides that debug endpoint.
Ports bind only to localhost. Compose now trusts only the entry proxy's explicit
IP address; direct callers' forwarding headers remain untrusted.

Docker uses the separate cookie `gatewayx.docker.sid` and Redis prefixes
`gatewayx:docker:sessions:` / `gatewayx:docker:rate:` so local Node gateways do
not interfere with this demo. Both Docker gateways share these exact values.
Cookies are not isolated by port, so a browser can reuse the cookie across
3320 and 3321 when you use the same hostname.

## Verify

- GET `http://localhost:3320/health` and `http://localhost:3321/health`.
- GET `/api/products` or `/api/products/11111111-1111-4111-8111-111111111111/overview`
  on either gateway.
- Register via POST `/api/users`, then login via POST `/api/auth/login` on 3320.
- Send the session cookie to GET `/api/auth/me` on 3321.
- Restart gateway-1, then send that cookie to `/api/auth/me` on 3320 again.

Use the manual steps above for session checks. The retained load-balancing demo
also checks session access when a gateway stops. Normal anonymous/auth rate
limits apply, so allow the auth bucket to refill before repeated login attempts.

```powershell
docker compose --profile apps ps
docker compose logs --tail 50 gateway-1 gateway-2
```

Health checks are liveness checks; use API requests to verify dependencies.

## Verified result

The smoke test passed aggregation on both gateways, login on gateway-1 followed
by session access on gateway-2, session survival after a real gateway-1 restart,
and logout invalidation on both gateways. A burst of 50 concurrent authenticated
requests across the two containers returned 9 successful responses and 41 HTTP
429 responses with Retry-After. The exact admitted count depends on earlier
requests and token refill; the test checks the shared capacity/refill bound.
