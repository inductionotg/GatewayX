# Dockerization step 2: User and Review Services

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

Each backend now has its own Dockerfile and can run independently. Images install
the selected npm workspace from the root lockfile, generate Prisma Client for
Linux, and run Express as the non-root `node` user. Local environment files are
excluded from images; Compose supplies credentials at runtime.

| Service | Host URL | Container port | Database |
| --- | --- | --- | --- |
| Product | http://localhost:3312 | 3002 | products_db |
| Review | http://localhost:3313 | 3003 | reviews_db |
| User | http://localhost:3315 | 3001 | users_db |

All connect to `postgres:5432` on the Compose network with their own database
credentials. User Service sets `HOST=0.0.0.0` inside Docker so requests can reach
it through the container network. Host ports are bound to localhost for this
development setup.

## Setup

From the repository root, copy each service's `.env.docker.example` to
`.env.docker` in the same directory, if missing. Set credentials to match your
PostgreSQL installation. Do not replace an existing configured file.

```powershell
docker compose up -d --wait postgres redis
docker compose --profile apps build user-service review-service
docker compose --profile apps run --rm user-service npx prisma migrate deploy
docker compose --profile apps run --rm review-service npx prisma migrate deploy
docker compose --profile apps up -d --wait user-service review-service
```

Migrations run explicitly before application startup. They do not seed records.
If you need sample reviews, run:

```powershell
docker compose --profile apps run --rm review-service npm run seed
```

## Verify

- `GET http://localhost:3313/health`
- `GET http://localhost:3313/reviews?productId=11111111-1111-4111-8111-111111111111`
- `GET http://localhost:3315/health`
- `POST http://localhost:3315/users` with JSON
  `{"name":"Docker Demo","email":"docker-demo@example.com","password":"Docker-demo-password-42"}`
- `POST http://localhost:3315/auth/verify` with the same email and password.

Use a new email for repeated registration tests. `/auth/verify` is an internal
backend operation: gateway login creates the Redis session, not this endpoint.
Health checks verify HTTP liveness; fetching reviews and registering/verifying
a user also exercise the databases.

```powershell
docker compose --profile apps ps
docker compose logs --tail 50 user-service review-service
docker compose stop user-service review-service
```

## Recorded verification

Both images built successfully and both containers became healthy. Migration
deployment found no pending migrations in either database. The smoke check
passed both health endpoints, retrieved two seeded reviews, registered and
verified a temporary user, and rejected an incorrect password with HTTP 401.
It deleted only its temporary user afterward.

To repeat these checks, use the manual API requests above.



## Next step

Two gateway containers now connect through Compose service names; see
[step 3](docker-gateways.md) for startup and verification. Existing local gateways
still use their existing downstream addresses.
