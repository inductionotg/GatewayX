# Product circuit breaker demo

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

Each product instance has its own in-memory breaker in each gateway process.
Settings in `gateway/.env`:

```dotenv
CIRCUIT_FAILURE_THRESHOLD=3
CIRCUIT_RESET_TIMEOUT_MS=10000
DOWNSTREAM_TIMEOUT_MS=2000
```

Restart the gateway after changing environment variables. State resets when a
gateway restarts; sessions and rate limits will use Redis separately.

## Run and inspect

From the repository root, run these in separate terminals:

```powershell
npm run dev -w services/product-service
npm run dev:instance2 -w services/product-service
npm run dev -w gateway
```

Product instances use 3102 and 3104. Ensure port 3000 is running this gateway:
`GET http://localhost:3000/health` must identify `gateway`.

View `http://localhost:3000/debug/circuits` to see state, failure counts,
probe-in-flight status, and remaining cooldown per instance. This endpoint is
not registered when NODE_ENV=production. Reading it never triggers a probe.

1. Request `/api/products` several times and observe alternating destinations.
2. Stop only instance 3104 with Ctrl+C.
3. Make at least six product requests promptly (within the 10-second cooldown).
   Calls to the stopped instance fail initially; its third failure opens its
   circuit. The healthy instance's successes do not reset the failed instance.
4. Inspect `/debug/circuits` and verify 3104 is OPEN. New requests use 3102.
5. After cooldown, request again while 3104 remains stopped. Logs show
   OPEN -> HALF_OPEN -> OPEN. The failed probe is visible to its caller.
6. Restart 3104. After its next cooldown, request again. Logs show
   OPEN -> HALF_OPEN -> CLOSED and round-robin distribution resumes.
7. Optionally stop both replicas and trip both breakers. Once both are open,
   requests return 503 without a downstream network call. `/health` still works.
8. Restart stopped services when finished.

For a burst of requests in PowerShell:

```powershell
1..8 | ForEach-Object {
  try {
    (Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/products).StatusCode
  } catch {
    Write-Host $_.Exception.Message
  }
}
```

## Semantics

- CLOSED allows calls. Consecutive failures are counted in completion order.
- Connection errors, timeouts, 5xx, and invalid successful JSON responses count.
  Ordinary 4xx responses count as healthy, including a half-open 404 probe.
- OPEN skips calls until cooldown expires. The next selected request reserves
  the sole HALF_OPEN probe synchronously. Other requests use eligible replicas
  or get 503 if none are available.
- Existing in-flight calls are not canceled. Their results cannot change a
  newer state generation. Each permit is settled at most once.
- This step does not retry failed requests, run background probes, add global
  concurrency limits, or add breakers to Review Service. The shared downstream
  client is reusable when that service is integrated later.
- Product overview already degrades gracefully when reviews fail and returns
  503 when the essential product lookup fails.

## Automated checks



Tests cover transitions, cooldown, late results, single concurrent probes,
timeouts during body reads, 404 classification, service isolation, an actual
HTTP replica stopping/restarting, gateway 503 responses, and debug visibility.
The automated outage uses isolated temporary HTTP servers; it does not stop
your running product services. Perform the live demo above separately.
