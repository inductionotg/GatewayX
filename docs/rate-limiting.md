# Custom Redis token bucket

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

The gateway implements token bucket logic itself in
`gateway/src/rate-limiter/token-bucket.lua`. Redis is shared by all gateways.
There is no rate-limiting library or in-memory fallback.

For each request, Redis TIME supplies the timestamp. A single atomic Lua
execution refills every applicable bucket, checks allowance, and consumes one
token from each bucket only if all allow the request. When either bucket rejects,
neither loses tokens. Rejected attempts still update calculated refill state.

`tokens = min(capacity, previousTokens + elapsedSeconds * refillPerSecond)`

No background refill timer is required. State uses two hash fields per bucket.
Keys expire after an idle interval long enough to refill the entire bucket (at
least one second). Expiration cannot grant a full bucket earlier than refill
would. Backwards clock movement mints no tokens and extends the wait safely.

## Policies

| Caller/request | Bucket | Default burst capacity | Refill per second |
|---|---|---|---|
| Authenticated | Session user ID | 10 | 2 |
| Anonymous | Express client IP | 20 | 1 |
| POST login or registration | Additional IP bucket | 5 | 0.1 |

These are burst capacities and average rates, **not** exact rolling-window
counts. Every incoming API request that passes the limiter costs one token,
including downstream errors and route 404s. An aggregate request costs one token
even though it calls multiple backends. Health and development diagnostics sit
outside `/api` and are exempt. Malformed JSON is rejected by the parser first.

Identity comes only from verified session data or Express `req.ip`. Cookies from
multiple sessions for the same user share one user bucket. Supplied X-User-Id
headers are ignored. With the default TRUST_PROXY_HOPS=0, X-Forwarded-For cannot
change the anonymous identity. Configure trusted proxies deliberately when
adding the entry load balancer. NAT users share anonymous/authentication IP
allowances. Per-IP limits are not a defense against distributed attackers.

The limiter runs after session loading and before controllers. Thus sessions are
identified before selecting the bucket, and rejected login attempts do not call
User Service or run password verification. Session lookups can occur before a
429. Logout also consumes the user's general allowance; exhausted clients must
wait for refill before logging out.

## Configuration

Both gateways must use identical settings and prefix:

```dotenv
RATE_LIMIT_PREFIX=gatewayx:rate:
RATE_LIMIT_USER_CAPACITY=10
RATE_LIMIT_USER_REFILL_PER_SECOND=2
RATE_LIMIT_ANONYMOUS_CAPACITY=20
RATE_LIMIT_ANONYMOUS_REFILL_PER_SECOND=1
RATE_LIMIT_AUTH_CAPACITY=5
RATE_LIMIT_AUTH_REFILL_PER_SECOND=0.1
RATE_LIMIT_REDIS_TIMEOUT_MS=2000
```

Restart gateways after changing environment variables. Restarting a gateway
does not reset Redis counters. An idle bucket may expire naturally. Never use
different prefixes per gateway in the real deployment. Tests use unique prefixes
to avoid modifying real allowances. Keys hash identities instead of storing raw
emails/IPs in their names. Redis itself remains trusted internal infrastructure.

This implementation targets the project's standalone Redis. The atomic script
can touch two keys; Redis Cluster would require a deliberate hash-slot design.
Do not distribute this script across arbitrary cluster slots unchanged.

## Responses and failure behavior

Admitted/denied requests include X-RateLimit-Limit, X-RateLimit-Remaining, and
X-RateLimit-Policy. On rejection the policy identifies the bucket requiring the
longest wait. On admission the headers describe the primary user/IP bucket.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1
X-RateLimit-Remaining: 0
Cache-Control: no-store
```

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests; retry later",
    "retryAfter": 1
  }
}
```

Retry-After is rounded up to whole seconds based on the token deficit and refill
rate. It is an estimate assuming no other concurrent request spends the new
token first. Redis failures/timeouts return 503 RATE_LIMIT_STORE_UNAVAILABLE.
No local allowance is granted. Session-dependent requests can instead report
SESSION_STORE_UNAVAILABLE if session loading detects the outage first. A timed-out
Redis operation may still finish server-side, conservatively consuming a token.

## Verification

```powershell
node scripts/session-live-demo.mjs --rate-limit
```

The rate suite sends 200 concurrent HTTP requests across two Express gateways
sharing real Redis. With capacity 10 and refill 0.001 tokens/sec, exactly 10 must
succeed and 190 must return 429. The deliberately slow test refill prevents time
passing during the burst from adding a whole token; production defaults remain
2 tokens/sec. It also tests per-user isolation, new-session non-bypass, stricter
auth limits, atomic all-or-none deductions, untrusted headers, fractional refill,
capacity bounds, clock rollback, idle expiration, and unavailable Redis.

The live demo additionally launches two independent Node processes, registers
and logs in a temporary real user, runs the same burst, and restarts one gateway
to prove its allowance remains exhausted. It cleans up its own account, session,
bucket keys, and temporary gateway processes. Keep User Service and Redis running.

This protects per-caller admission, not total system concurrency. Many distinct
users may still collectively overload a backend. Concurrency caps and broader
capacity testing remain separate work.

Redis guarantees atomic script execution: [Redis Lua documentation](https://redis.io/docs/latest/develop/programmability/eval-intro/).

## Recorded verification — 2026-09-23

- Gateway unit/integration checks: 16 passed.
- Real Redis rate-limit scenarios: 5 passed.
- Real Redis session scenarios: 2 passed.
- Independent-process load demo: 200 concurrent requests, 10 accepted, 190
  rejected, 172 ms burst duration. Test capacity 10, refill 0.001 tokens/sec.
- Restarted gateway still rejected the exhausted user's cookie with 429.
- The existing live cross-gateway session/restart/logout demonstration also passed
  with limiting enabled.
- Gateways were restarted on 3200 and 3201 with default production-development
  policy values. Anonymous `/api/auth/me` requests showed shared remaining counts
  of 19 then 18, while health remained 200.
