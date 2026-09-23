# Submission audit

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

## Required behavior

| Requirement | Local status | Evidence |
| --- | --- | --- |
| Three independently deployable services | Implemented | User, Product and Review Dockerfiles and Compose services |
| Per-service data ownership | Implemented with PostgreSQL substitution | Separate roles/databases and Prisma schemas; `infrastructure/postgres/init.sql` |
| Single API entry point | Demonstrated | Nginx on 3380 distributes to two custom gateways |
| Multiple downstream instances | Demonstrated | Two product containers; both gateways' logs show both destinations |
| Custom circuit breaker and recovery | Demonstrated | Unit/integration tests and real container outages; CLOSED/OPEN/HALF_OPEN transitions |
| Parallel request aggregation | Tested | Overview uses Promise.all; test withholds responses until both requests arrive |
| Redis-backed concurrent rate limits | Tested | Five integration tests, including 200 requests across two HTTP servers; Docker burst test |
| 429 with Retry-After | Tested | Integration tests and Docker gateway smoke test |
| Shared Redis sessions | Demonstrated | Login across gateways, container restart, cross-gateway logout |
| Failure isolation | Demonstrated | Healthy product replica survives; optional review outage preserves product response |
| Configurable thresholds and diagnostics | Implemented | Environment settings and development-only `/debug/circuits` |
| Latency logging | Implemented | Shared downstream client logs attempts, outcomes and elapsed time |
| README and diagrams | Prepared | Root README; PNGs plus editable Excalidraw sources |
| GitHub repository | Prepared for publication | Public repository: https://github.com/inductionotg/GatewayX |
| Live presentation to reviewer | Pending | Reproducible demo scripts and recorded evidence are ready |

No numerical grade is claimed. PostgreSQL/Prisma intentionally replace
MongoDB/Mongoose and should be accepted by the reviewer before submission.

## Verification performed for the documentation step

- 18 gateway tests passed.
- 5 Redis rate-limit integration tests passed.
- 2 Redis session integration tests passed.
- 3 User Service unit tests passed.
- 1 User Service database integration test passed.
- Compose configuration validation passed without printing environment secrets.
- Setup helper ran in an isolated temporary directory; generated secrets and
  host database URLs were checked, and a second run preserved existing files.
- README file links resolve; both diagram JSON files parse and PNGs were visually
  inspected. Excalidraw scenes were generated as editable files; an interactive
  import into the Excalidraw application was not performed.
- The Postman Docker environment and 29-request collection parse; embedded
  scripts compile. The collection has not been executed in Postman.

Earlier Docker demo results are recorded in `docker-gateways.md`,
`docker-load-balancing.md`, and `review-circuit-breaker.md`. Those demos were not
repeated merely for documentation changes. A completely fresh Docker volume
installation has not been exercised in this step; existing volumes were preserved.

## Reviewer demonstration order

1. Start the stack and open the main product overview at port 3380.
2. Show X-Gateway-Upstream and downstream logs to establish both routing levels.
3. Use the session walkthrough and live session demo for shared sessions and restart persistence.
4. Run the product outage demo and show circuit transitions on both gateways.
5. Run the review outage demo to show graceful degradation and recovery.
6. Run the live rate-limit demo for atomic concurrent admission.

Use the commands in the root README. Run demos individually and allow rate
buckets to refill before repeating them. Do not delete data volumes to reset a
demo. Inspect the files to be published and exclude secrets before initializing
Git and publishing the eventual repository.
