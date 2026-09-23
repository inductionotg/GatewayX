# GatewayX

A custom Node.js and Express API gateway with round-robin routing, hand-written
circuit breakers, parallel request aggregation, Redis sessions, and atomic
token-bucket rate limiting. Backend services use PostgreSQL and Prisma.

Docker runs two gateways, two product replicas, User Service, Review Service,
Redis, PostgreSQL, and an Nginx entry load balancer.

- [Project guide: setup, APIs, architecture, and live demos](docs/GUIDE.md)
- [Architecture diagram](docs/architecture-diagram.png)
- [Circuit-breaker diagram](docs/circuit-breaker-state-diagram.png)

After following the setup guide, the main API URL is **http://localhost:3380**.
