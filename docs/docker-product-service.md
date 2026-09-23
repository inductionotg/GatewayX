# Dockerization step 1: Product Service

This step packages Product Service as an independent Linux container. Local
product processes on 3102/3104 and gateways on 3200/3201 remain unchanged.

## What changed

- `services/product-service/Dockerfile` installs this workspace's dependencies
  from the root lockfile and generates Prisma Client inside Linux.
- `.dockerignore` excludes local secrets, Windows node_modules, and generated
  clients from the build context. Runtime credentials are supplied separately.
- The image runs as the non-root `node` user and includes a liveness healthcheck.
- Compose has a `product-service` application in the optional `apps` profile.
- `services/product-service/.env.docker` points to PostgreSQL using its Compose
  service name `postgres`, not localhost. A sanitized example is committed.

```text
localhost:3312 -> Product Service container:3002 -> postgres:5432/products_db
```

Inside a container, localhost refers to that container. Containers on the same
Compose network reach PostgreSQL using `postgres:5432`. Host port 5432 and the
Redis host mapping 6380 are for applications running on Windows, not inter-
container connections.

## Commands (repository root)

On a fresh checkout, copy `services/product-service/.env.docker.example` to
`.env.docker` in that folder and adjust its credentials to match PostgreSQL.

```powershell
docker compose up -d --wait postgres redis
docker compose --profile apps build product-service
docker compose --profile apps run --rm product-service npx prisma migrate deploy
docker compose --profile apps up -d --wait product-service
```

Deployment migrations are an explicit step, not run independently by every
replica at startup. The image retains Prisma CLI for this command. `migrate
deploy` uses the checked-in migrations and does not require the shadow database.
It does not insert sample products. Use the existing seed script only if needed:

```powershell
docker compose --profile apps run --rm product-service npm run seed
```

Check `http://localhost:3312/health` and `http://localhost:3312/products`.
The health endpoint checks HTTP liveness; the products endpoint also verifies
database connectivity. Use the existing seeded ID for an individual lookup.

```powershell
docker compose logs --tail 50 product-service
docker compose stop product-service
```

Stopping this application container does not delete PostgreSQL data. Do not run
`down -v` unless you intend to delete the database and Redis volumes.

## Next step

Review and User Services are now containerized; see [step 2](docker-backend-services.md).
Next, containerize both gateways. The final full-system
Compose deployment will add explicit migration jobs and an entry load balancer.
The current gateway still routes to the existing local product instances; this
first step verifies the image separately before switching application routing.
