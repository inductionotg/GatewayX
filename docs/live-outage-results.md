# Live circuit breaker demonstration — 2026-09-22

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

Executed against the actual Product Service processes and PostgreSQL, not mock
servers. Gateway ran on port 3200 because port 3000 belonged to another project.
Product replicas: 3102 and 3104. Threshold: 3 failures. Cooldown: 10 seconds.

## Observed results

1. Four baseline product requests returned 200, alternating between both replicas.
   Both breakers were CLOSED with zero failures.
2. Stopped replica 3104 through its running terminal session. Replica 3102 stayed up.
3. Ten requests returned these statuses in order:

   `200, 502, 200, 502, 200, 502, 200, 200, 200, 200`

   Replica 3104 transitioned CLOSED -> OPEN after its third connection failure.
   Replica 3102 remained CLOSED. The gateway health endpoint continued returning 200.
4. After cooldown, a trial call to the still-stopped replica failed. Logs showed
   OPEN -> HALF_OPEN -> OPEN. A fresh cooldown was observed at 9987 ms remaining.
5. Restarted replica 3104 using `npm run dev:instance2`. After cooldown, four
   product requests returned 200. Logs showed OPEN -> HALF_OPEN -> CLOSED.
   Requests again used both replicas. Final state: both CLOSED, failure counts 0.

## Selected transition logs

```text
[circuit] product http://127.0.0.1:3104: CLOSED -> OPEN
[circuit] product http://127.0.0.1:3104: OPEN -> HALF_OPEN
[circuit] product http://127.0.0.1:3104: HALF_OPEN -> OPEN
[circuit] product http://127.0.0.1:3104: OPEN -> HALF_OPEN
[circuit] product http://127.0.0.1:3104: HALF_OPEN -> CLOSED
```

## Scope and final running state

The failed calls and failed recovery probe were returned to their callers;
automatic retries are not implemented. This run demonstrated one product
replica outage, continued product availability through the healthy replica,
gateway liveness, failed probing, and successful automatic recovery. It did not
test an outage of every replica or cross-service availability. Review Service
was not running during this demonstration.

Gateway was left running on 3200; product replicas were left running on 3102 and
3104. The port override for the demonstration did not change `gateway/.env`.
