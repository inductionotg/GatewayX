# User Service

> Publication note: automated test suites and smoke-test scripts were removed
> at the owner's request. Recorded test results below are historical; retained
> live-demo scripts and manual API checks remain available.

User Service runs on port 3105 and owns `users_db`. It follows the existing
route -> controller -> service -> Prisma structure. Redis sessions are a later
step; registration and credential verification do not create a session or token.

## Setup

Copy `services/user-service/.env.example` to `.env` in that folder and adjust
credentials if your local database setup differs. From the project root:

```powershell
npm install
npm run db:generate -w services/user-service
npm run db:deploy -w services/user-service
npm run dev -w services/user-service
```

The checked-in migration can be deployed without a shadow database. To author
future migrations with `prisma migrate dev`, create `users_shadow_db` owned by
`users_app` and configure SHADOW_DATABASE_URL to point to that separate database.
The shadow database has already been created in this development environment.

The service binds to 127.0.0.1 by default. When containerizing, use HOST=0.0.0.0
within the private service network. `/auth/verify` is a trusted internal API;
do not publish that backend directly as an internet-facing login endpoint.

## Endpoints

| Endpoint | Behavior |
|---|---|
| Gateway `POST /api/users` | Register; returns 201 with safe user fields |
| User Service `POST /users` | Backend registration operation |
| User Service `POST /auth/verify` | Verify credentials; returns safe identity or generic 401 |
| User Service `GET /health` | HTTP liveness |

Registration body:

```json
{
  "name": "Demo User",
  "email": "demo@example.com",
  "password": "A-long-demo-password-42"
}
```

Email is trimmed and lowercased. Name is trimmed. Passwords are not trimmed.
Passwords require at least 8 characters and at most 128 UTF-8 bytes. Request
bodies are limited to 16 KB. Duplicate email returns 409, invalid input 400,
oversized bodies 413. The database enforces normalized, unique email even under
concurrent registrations.

Passwords use Node's asynchronous scrypt with a random 16-byte salt and parameters
N=32768, r=8, p=3, with timingSafeEqual for hash comparison. Unknown emails still
perform password verification against a dummy hash. Hashes are never returned
in API responses and submitted request bodies are not logged. The implementation
uses [Node's built-in crypto API](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

## Try registration

The live demonstration gateway uses port 3200 because another project uses 3000.
Restart the gateway after configuration or code changes. Replace the port below
if you run the gateway elsewhere.

```powershell
$registration = @{
  name = "Demo User"
  email = "demo@example.com"
  password = "A-long-demo-password-42"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3200/api/users `
  -ContentType application/json -Body $registration
```

Repeating registration returns 409; use another email to create another user.
Credential verification accepts only email/password at the backend URL
`http://127.0.0.1:3105/auth/verify`; the gateway intentionally has no public route
for that operation. Next, the gateway login controller will call it and create
a Redis session. That login flow and shared token-bucket limiting are now
implemented; see `sessions.md` and `rate-limiting.md` for their endpoints and tests.

User calls use their own circuit breakers and the existing downstream client.
POSTs are never automatically retried because an interrupted request may already
have committed. `/debug/circuits` now includes both products and users.

## Tests



Integration tests use the configured development database, create unique test
accounts, and remove only those accounts in cleanup. They verify registration,
safe responses, password storage, valid/invalid credential checks, concurrent
duplicate registration, malformed JSON, and request size limits.
