# GatewayX

A custom JavaScript API gateway built with Node.js and Express. It demonstrates
how to route, balance, limit, aggregate, and recover API calls across independent
services. PostgreSQL + Prisma replace the original assignment's MongoDB stack.

The local deployment runs two gateways, two Product Service replicas, User
Service, Review Service, Redis, PostgreSQL, and an Nginx entry load balancer.
Nginx only distributes traffic between gateway processes. API routing, rate
limiting, sessions, aggregation, and circuit breakers are implemented in Node.

![Architecture](docs/architecture-diagram.png)

## Run locally

Prerequisites: Node.js 22.14+ in the Node 22 line, npm, and Docker Desktop running
Linux containers with Docker Compose. Commands below run from the repository
root. The implementation was tested on Windows PowerShell.

### 1. Create configuration

```powershell
node scripts/setup-local.mjs
```

This copies sanitized examples into ignored environment files, generates a
session secret, and leaves existing files untouched. It also creates host-side
configuration for tests. Both Docker gateways use the same `gateway/.env.docker`.
If you already have PostgreSQL data, the credentials in these files must match
that installation. Default service credentials are local demo values in
`infrastructure/postgres/init.sql`.

### 2. Start infrastructure and build the application images

```powershell
docker compose up -d --wait postgres redis
docker compose --profile apps build product-service review-service user-service gateway-1
```

PostgreSQL initialization creates three databases with separate owners. Its init
script runs only when the data volume is empty. Redis uses AOF persistence and
a named volume. No database data needs to be deleted to restart this project.

### 3. Apply migrations and seed products/reviews

```powershell
docker compose --profile apps run --rm user-service npx prisma migrate deploy
docker compose --profile apps run --rm product-service npx prisma migrate deploy
docker compose --profile apps run --rm review-service npx prisma migrate deploy
docker compose --profile apps run --rm product-service npm run seed
docker compose --profile apps run --rm review-service npm run seed
```

Run migrations once per logical service database. Product replicas share
`products_db`. `migrate deploy` does not use a shadow database. The shadow URLs in
the examples are configuration placeholders; creating migrations with
`migrate dev` requires separately provisioning those shadow databases.

### 4. Start the complete application

```powershell
docker compose --profile apps up -d --wait entry
docker compose --profile apps ps
```

Open [products](http://localhost:3380/api/products) or the
[product overview](http://localhost:3380/api/products/11111111-1111-4111-8111-111111111111/overview).

| Component | Host URL / port | Container port |
| --- | --- | --- |
| Main entry | http://localhost:3380 | 80 |
| Gateway 1 / 2 diagnostics | http://localhost:3320 / http://localhost:3321 | 3000 |
| Product replica 1 / 2 | http://localhost:3312 / http://localhost:3314 | 3002 |
| Review Service | http://localhost:3313 | 3003 |
| User Service | http://localhost:3315 | 3001 |
| PostgreSQL | 5432 by default | 5432 |
| Redis | 6380 by default | 6379 |

All published ports bind to localhost. Within Docker, services use Compose names
such as `redis:6379`, not host ports or localhost. Port 3380 avoids this machine's
blocked port 8080. If a port is occupied, edit its host mapping; changing a
container port also requires updating downstream configuration. The ingress
network uses `172.30.88.0/24`; its proxy address and trusted address must match if
you change the subnet.

## Public APIs

Use the base URL `http://localhost:3380`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Gateway liveness |
| GET | `/api/products` | Product list |
| GET | `/api/products/:id` | Product detail |
| GET | `/api/products/:id/overview` | Product + reviews, fetched in parallel |
| POST | `/api/users` | Register `{name,email,password}` |
| POST | `/api/auth/login` | Login `{email,password}` and receive a session cookie |
| GET | `/api/auth/me` | Current user; requires session cookie |
| POST | `/api/auth/logout` | Destroy session; send JSON `{}`; returns 204 |
| GET | `/debug/circuits` | Per-instance state, development only |
| GET | `/entry-health` | Nginx liveness, entry URL only |

Import the [Postman collection](docs/postman/GatewayX.postman_collection.json)
and [Docker environment](docs/postman/GatewayX-Docker.postman_environment.json).
Keep its cookie jar enabled. See [Postman instructions](docs/postman/README.md).
Direct backend routes are diagnostic/internal interfaces; `/auth/verify` on
User Service does not create a session. Product/review write APIs are not provided.

## How requests work

1. Nginx selects a gateway using round robin.
2. Express loads any session from Redis and determines the user/IP identity.
3. An atomic Redis Lua script refills and consumes the applicable token buckets.
4. Routes and controllers call service clients. The client selects a downstream
   instance, checks its circuit breaker, and bounds the HTTP call with a timeout.
5. The overview calls Product and Review Services with `Promise.all`. Product
   data is essential. Review failure returns HTTP 200 with `reviews: null` and
   a `REVIEWS_UNAVAILABLE` warning; it does not hide the product.

The MVC organization uses Prisma schemas as database models, route/controller
layers for HTTP, and service layers for business logic and downstream access.
API responses are JSON; there is no server-rendered view layer.

### Load balancing and state

Each gateway has its own round-robin pointer and per-instance circuit breakers.
Equal replicas and similar request costs make round robin simple to demonstrate;
it does not guarantee equal CPU utilization when request costs differ. All
session data and rate allowances are shared in Redis, so sticky sessions are
unnecessary and gateway restarts do not reset those states. Process-local
breaker/routing bookkeeping resets on restart.

Nginx overwrites forwarding headers. Gateways trust only Nginx's explicit address
`172.30.88.10`; direct callers cannot choose their rate identity with a forged
X-Forwarded-For. NAT clients still share an anonymous IP allowance.

### Hand-written circuit breakers

![Circuit states](docs/circuit-breaker-state-diagram.png)

Defaults: three consecutive failures open the circuit; after ten seconds, the
next eligible request is a single half-open probe. A successful probe closes the
circuit; a failure restarts the cooldown. Old in-flight results cannot overwrite
newer states. The default downstream timeout is two seconds. Network errors,
timeouts, 5xx, and invalid JSON count as failures; normal 4xx do not. Reviews also
validate successful payloads before counting them as healthy.

Requests already sent to an unhealthy instance can fail before its breaker
opens. There is no automatic downstream retry. Open product circuits are skipped
in favor of a healthy replica; when all instances are unavailable, selection
fails immediately. Optional reviews degrade the overview instead.

### Custom token-bucket rate limiter

The limiter is hand-written Lua executed atomically in Redis. Redis TIME supplies
a common clock. Concurrent requests across both gateways cannot independently
spend the same token. Multi-bucket admission is all-or-nothing.

| Policy | Capacity | Refill |
| --- | --- | --- |
| Authenticated user ID | 10 tokens | 2 per second |
| Anonymous IP | 20 tokens | 1 per second |
| Additional registration/login IP bucket | 5 tokens | 0.1 per second |

Token buckets allow controlled bursts with bounded average rates. A fixed window
has boundary bursts; sliding logs store per-request history; a leaky-bucket queue
adds waiting rather than this project's immediate admission/rejection behavior.
These are token budgets, not exact rolling-window quotas.

Rejections return 429 and a rounded-up `Retry-After`. Each admitted API request
costs one token, including an aggregate call. Health/debug routes are exempt.
Redis failures fail closed with 503; there is no per-process fallback allowance.
See [rate-limiter details and load evidence](docs/rate-limiting.md).

### Sessions

`express-session` and `connect-redis` store minimal user identity in Redis. Login
rotates the session ID; logout deletes it. Cookies are HttpOnly and SameSite=Lax.
User Service hashes passwords with salted scrypt. Both gateways must share the
session secret, cookie name, Redis prefix, and rate-limit configuration.

## Live demonstration

Host-side dependencies and Prisma Client for the live demos:

```powershell
npm ci
npm exec --workspace=user-service -- prisma generate
```

Automated unit/integration suites and smoke-test scripts have been removed at
the project owner's request. Earlier verification results are retained as
historical evidence in the docs. The live demos below remain available.

Run these live demos individually with the full Docker stack up:

```powershell
node --env-file=services/user-service/.env scripts/docker-load-balancing-demo.mjs
node scripts/docker-review-outage-demo.mjs
```

They demonstrate product-instance failure, gateway failure with a shared
session, review degradation, and automatic recovery. Each restores containers it stops; account-based demos remove their
temporary users and session keys. Normal rate limits apply, so allow buckets to
refill between repeated runs. Avoid unrelated traffic during call-count checks.

For a live review, show both circuit dashboards, stop a product replica, make
requests until each breaker opens, then restart it and demonstrate recovery:

```powershell
docker compose stop product-service-2
# Send requests through both gateways; inspect /debug/circuits on 3320 and 3321.
docker compose logs --tail 100 gateway-1 gateway-2
docker compose --profile apps up -d --wait product-service-2
# After cooldown, make requests again to trigger half-open probes.
```

Evidence: [load balancing](docs/docker-load-balancing.md),
[review outage](docs/review-circuit-breaker.md), and
[two-gateway sessions](docs/docker-gateways.md). Recorded runs demonstrate the
behavior; the assignment still requires presenting it live to the reviewer.

## Layout and diagrams

```text
gateway/src/                 # MVC HTTP layer and custom gateway policies
  routes/ controllers/ services/
  circuit-breaker/ downstream/ load-balancer/
  rate-limiter/ session/ middleware/
services/                    # User, Product, Review; own Prisma schemas/migrations
infrastructure/              # PostgreSQL initialization and Nginx config
scripts/                     # Setup, reproducible demos, diagram generation
docs/                        # Diagrams, architecture notes, Postman artifacts
docker-compose.yaml
```

Editable sources: [architecture](docs/architecture-diagram.excalidraw) and
[circuit states](docs/circuit-breaker-state-diagram.excalidraw). Open them in
Excalidraw. Matching PNGs are included above. `scripts/draw-diagrams.py` regenerates
both formats using Python + Pillow; it is not needed to run the application.

## Scope and remaining submission work

This is a local HTTP learning deployment. Compose sets development mode for
HTTP cookies and circuit diagnostics. Production requires HTTPS, production
cookie settings, secret management, and access restrictions. Nginx, Redis and
PostgreSQL each have one instance here; their high availability is not tested.
The Lua script targets standalone Redis, not arbitrary Redis Cluster slots.
Rate limiting is not an in-flight concurrency cap or a queue. RabbitMQ is not
needed for this synchronous assignment and is not included.

The database technology intentionally differs from the assignment: PostgreSQL
with Prisma replaces MongoDB/Mongoose. Confirm that substitution with the
reviewer. Bonus logging covers downstream attempts and latency; it is not a full
centralized tracing system. Health endpoints report liveness, not full readiness.

The project is prepared for publication as GatewayX. See the [submission audit](docs/submission-checklist.md)
for evidence and verification limits. Review `.gitignore` before publishing: environment secrets,
node_modules, and generated Prisma clients must remain untracked. Present the live outage demo to the assignment reviewer.

To stop without deleting data: `docker compose --profile apps stop`.
`docker compose down -v` deletes the database and Redis volumes; it is not a
normal restart command.
