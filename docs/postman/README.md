# Import into Postman

For the full Docker deployment, import `GatewayX-Docker.postman_environment.json`
and select **GatewayX Docker**. It uses the entry URL `http://localhost:3380`,
gateway 2 on 3321, product replicas on 3312/3314, reviews on 3313, and users on
3315. To inspect gateway 1 directly, change `gateway_url` to
`http://localhost:3320`. The existing Local environment below is for host Node
processes. Both environments work with the same collection.

1. Choose **Import** and select `GatewayX.postman_collection.json` and
   `GatewayX-Local.postman_environment.json`.
2. Select the **GatewayX Local** environment.
3. Run the health requests, then run **02 — Registration and shared-session
   walkthrough** in order. Keep Postman's cookie jar enabled.

The collection contains 29 requests covering all currently implemented public
gateway and direct backend endpoints, plus error examples and rate-limit checks.
No real session secrets or database credentials are included. The password is a
demo value; the collection creates unique demo email addresses when email values
are blank. Registration requests create real accounts in the local users database.
Repeat registration returns 409. Clear `email` or `direct_email` to generate a new
demo identity, or supply your own email/password.

## Local addresses

| Variable | Default |
|---|---|
| gateway_url | http://localhost:3200 |
| gateway_2_url | http://localhost:3201 |
| product_service_url | http://localhost:3102 |
| product_replica_2_url | http://localhost:3104 |
| review_service_url | http://localhost:3103 |
| user_service_url | http://localhost:3105 |

Use localhost consistently. Session cookies are shared across the two gateway
ports automatically; do not manually add Authorization or Cookie headers.
The logout request intentionally has a JSON `{}` body and returns 204. The next
current-user request intentionally expects 401.

The product ID defaults to the seeded keyboard UUID. Review Service must be
running for direct review calls; the overview can instead return a warning if
Review Service is unavailable. Debug circuits are available only outside
production mode.

Real rate limits apply. If an ordinary request returns 429, wait the number of
seconds in Retry-After. The manual rate-limit folder accepts either 200 or 429
and checks rate-limit headers. Repeated sequential Postman requests are useful
for inspection but are not a substitute for the project's concurrent load test.

Backend folders bypass the gateway. Internal credential verification does not
create a session; use the gateway login endpoint for session tests. There are
no implemented product/review write endpoints, gateway `/api/reviews` endpoint,
or public user-list endpoint, so none are invented in this collection.

Files were parsed as JSON; 29 request URLs were checked for defined variables,
and all pre-request/test scripts were syntax-checked. The collection was not
executed in Postman as part of export.
