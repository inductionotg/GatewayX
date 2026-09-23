# Review Service circuit breaker and graceful degradation

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

Review Service now uses the same downstream client as Product and User Services.
`REVIEW_SERVICE_URL` remains unchanged. It uses `CIRCUIT_FAILURE_THRESHOLD`,
`CIRCUIT_RESET_TIMEOUT_MS`, and `DOWNSTREAM_TIMEOUT_MS` (defaults: 3 consecutive
failures, 10-second cooldown, 2-second request timeout).

Each gateway owns an independent review circuit. Network failures, timeouts,
5xx responses, invalid JSON, and successful JSON responses without a `data`
array count as failures. Normal 4xx responses do not indicate an unhealthy
service, though the overview still degrades when reviews cannot be retrieved.
An empty reviews array is a valid successful response.

The overview still calls Product and Review Services concurrently using
`Promise.all`. When reviews fail, a healthy product produces HTTP 200 with
`data.reviews: null` and a `REVIEWS_UNAVAILABLE` warning. Product failure retains
the existing essential-dependency behavior; a successful product response is
required to return an overview.

Once the review circuit opens, requests skip Review Service immediately instead
of repeatedly waiting for its timeout. The product fetch still takes its normal
time. After cooldown, one request per gateway is admitted as a half-open probe.
Other requests receive partial overviews while that probe is pending. Success
closes the circuit; failure starts a new cooldown.

## Dashboard and logs

The development-only dashboard now contains `products`, `users`, and `reviews`:

- http://localhost:3320/debug/circuits
- http://localhost:3321/debug/circuits

Inspect both direct gateways because circuit state is local to each process.
The shared entry dashboard may select either gateway. Review calls now include
instance address, downstream latency, and circuit transitions in gateway logs.
The dashboard stays disabled in production.

## Automated checks

```powershell
docker compose --profile apps build gateway-1
docker compose --profile apps up -d --wait gateway-1 gateway-2
node scripts/docker-review-outage-demo.mjs
```

The live demo requires the full Docker setup and seeded product data. It stops
the actual Review Service container, verifies partial overviews through both
gateways and the shared entry URL, checks that open circuits issue no additional
review calls, restores Review Service, and verifies recovery in each gateway's
logs. It restores a stopped Review Service even if an assertion fails. Avoid
concurrent manual requests during the demo's call-count assertions. Normal
anonymous rate limits remain enabled; allow the bucket to refill before reruns.

The automated integration test also proves parallel aggregation by withholding
both mock responses until both calls arrive, tests one half-open probe with
concurrent requests, distinguishes normal 4xx from service failures, and checks
that malformed successful review payloads open the circuit.

## Recorded verification

All 18 gateway tests passed. In the live Docker outage test, six overviews
returned HTTP 200 with product data and review warnings while the first failures
waited approximately 2 seconds for the configured timeout. Both review circuits
opened; product and user circuits remained closed. Subsequent direct overviews
took 27 ms and 24 ms, with zero extra review calls while open (also verified
through the entry URL). After Review Service restarted, both gateway logs showed
`CLOSED -> OPEN -> HALF_OPEN -> CLOSED`, and complete overviews returned without
restarting either gateway. Latencies are observations, not performance guarantees.
