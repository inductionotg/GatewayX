# Dockerization step 4: single entry and product replicas

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

The main entry URL is **http://localhost:3380**. Windows blocked port 8080, so
this deployment uses 3380. Nginx performs only gateway-instance load balancing;
routing, aggregation, sessions, rate limiting and downstream circuit breakers
remain in the custom Node.js gateway.

```text
Client -> localhost:3380 -> Nginx round robin
                           |-- gateway-1 --+-- product-service:3002
                           |-- gateway-2 --+-- product-service-2:3002
                                          +-- review-service:3003
                                          +-- user-service:3001
                                          +-- redis:6379
```

Both product replicas own the same logical service's data and use `products_db`.
User and Review Services retain separate databases. Migrations run once per
service database, not once per replica.

## Startup

Follow earlier backend setup/migration instructions, then ensure
`gateway/.env.docker` contains:

```dotenv
PRODUCT_SERVICE_URLS=http://product-service:3002,http://product-service-2:3002
```

```powershell
docker compose --profile apps build gateway-1
docker compose --profile apps up -d --wait entry
```

Compose starts both product replicas and both gateways as dependencies. The
direct gateway URLs 3320/3321 remain available for local diagnostics. The second
product replica is accessible directly on 3314. All host ports bind to localhost.

Try `/api/products` and
`/api/products/11111111-1111-4111-8111-111111111111/overview` at the entry URL.
Inspect `X-Gateway-Upstream` in response headers to see the chosen gateway IP.
Gateway logs show the selected product instance and downstream latency.

## Why round robin

The two gateways run identical code; the two product replicas run identical
code and serve similar work. Round robin provides simple, visible distribution
without sticky sessions or a shared scheduler. Each gateway maintains its own
product-selection pointer. Unequal request cost can make least-connections a
better choice later; round robin does not guarantee equal CPU utilization.

Nginx uses a shared upstream zone and Docker DNS resolution to refresh gateway
addresses after container recreation. Its passive failure handling can retry
connection failures on the other gateway, but does not retry returned HTTP
429/5xx responses. It does not enable retries of non-idempotent requests already
sent. See the [official Nginx upstream documentation](https://nginx.org/en/docs/http/ngx_http_upstream_module.html).

## Client IP and sessions

Nginx overwrites incoming forwarding headers. The gateways trust only its fixed
address `172.30.88.10`, on the dedicated `172.30.88.0/24` ingress network. Direct
requests to ports 3320/3321 cannot choose their rate-limit identity with a forged
`X-Forwarded-For`. If you change the subnet, update the Compose trusted address
and Nginx address together. Docker Desktop may present a NAT address for host
traffic; this local demo cannot distinguish clients hidden behind that address.

The original Host (including port) is preserved for same-origin login checks.
Both gateways use the same Redis sessions and user token buckets, so routing to
a different gateway does not require another login or provide extra allowance.

## Reproducible live outage demo

```powershell
node --env-file=services/user-service/.env scripts/docker-load-balancing-demo.mjs
```

The script requires Docker CLI access, host-side dependencies, and the generated
User Service Prisma client. It creates a temporary user, proves both levels of
distribution, stops product-service-2, exercises both gateways' breakers, checks
continued product/review/session operation, restores the replica, and checks
`OPEN -> HALF_OPEN -> CLOSED` in both gateway logs. It also stops gateway-1 and
verifies the entry URL and session continue through gateway-2. Finally it restores
stopped containers and deletes its temporary user/session/bucket.

**Expected outage behavior:** requests sent to the failed product replica before
its breaker trips may return errors. After three failures in each gateway, that
gateway skips the open circuit and chooses the healthy product replica. No
downstream retry is performed within the failed request. After the cooldown,
one request per gateway probes the replica; a successful probe closes the circuit.
Breaker state is local per gateway, not stored in Redis.

For manual observation:

```powershell
docker compose stop product-service-2
# Request /api/products repeatedly through both gateways.
# Read /debug/circuits on 3320 and 3321 (local development only).
docker compose logs --tail 100 gateway-1 gateway-2
docker compose --profile apps up -d --wait product-service-2
```

This remains a local HTTP demonstration. Nginx itself is a single entry instance;
production entry availability and TLS are not demonstrated by this setup.

## Recorded verification

- All 17 gateway automated tests passed.
- Entry responses identified both gateways; each gateway's logs showed calls to
  both product replicas.
- With product-service-2 stopped, the initial 12 calls returned six HTTP 200s
  and six bounded HTTP 504s. Both breakers opened after three failures each.
- With those breakers open, the healthy product replica supplied overviews,
  reviews remained available, and sessions worked through both gateways.
- After restoration, both gateway logs showed `OPEN -> HALF_OPEN -> CLOSED`.
- With gateway-1 stopped, the entry URL and existing session still worked.
- Rotating forged X-Forwarded-For values did not create attacker-selected Redis
  buckets or bypass anonymous limits, through either the entry or direct gateway.
- The demo restores stopped containers and removes its temporary account.
