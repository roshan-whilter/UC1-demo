# UC1 Demo Mock API

MERN implementation of the two endpoints in `UC1-DEMO-MOCK-APIS.md`. Standalone —
it shares nothing with the other repos in this folder except the local MongoDB
from `infra-compose.yml`.

| Part | Stack | Port |
|------|-------|------|
| API | Express 4 + Mongoose 8 (Node, ESM) | 4000 |
| Console | React 18 + Vite | 4200 |
| Store | MongoDB (`uc1_demo_mock`) | 27017 |

Port 4000/4200 avoid every port `RUNBOOK.md` assigns to the nine app repos.

---

## Run it

```bash
# MongoDB must be up — from the workspace root:
#   docker compose -f infra-compose.yml up -d mongodb

cd uc1-demo-mock-api
npm install
npm run seed          # loads the demo subscribers (idempotent)
npm run dev           # API on :4000, console on :4200
```

Then open <http://localhost:4200>.

```bash
npm start             # API only, no console
npm test              # 34 contract tests
npm run seed -- --reset   # also wipes tickets and the ticketId counters
```

`npm test` needs MongoDB running; it uses its own throwaway databases and never
touches `uc1_demo_mock`.

---

## Authentication

**Every endpoint except `GET /demo/health` requires an `x-api-key` header.** The
server refuses to start if `API_KEYS` is empty, so it can never come up
unprotected.

```bash
curl -X POST https://your-host/account/balance_usage \
  -H 'x-api-key: <your key>' \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-bal-001","timestamp":"20260907120000","msisdn":"85510234567"}'
```

A bad or missing key gets **HTTP 401** — the one place this API doesn't answer
200, because auth is a transport concern rather than an outcome of either
documented operation. A teammate with the wrong key gets an unmistakable
signal, and the voice agent can't mistake it for "the lookup failed, offer a
callback". The body is still the spec's FAILURE envelope, so a caller that only
parses `status` / `error.code` keeps working:

```json
{
  "status": "FAILURE",
  "error": { "code": "401", "message": "Missing x-api-key header" },
  "requestId": "req-bal-001",
  "timestamp": "20260907120001",
  "msisdn": "85510234567"
}
```

Details:

- Keys are compared **constant-time** against a SHA-256 digest, so the compare
  leaks nothing through timing.
- `API_KEYS` is **comma-separated** — issue one key per teammate and you can
  revoke a single person without rotating everyone.
- The header is the only accepted channel. A key in the query string or body is
  ignored, so it can't end up in access logs or a shared URL.
- Logs record a 6-character fingerprint (`uc1_gi…`), never the whole key.
- An unauthenticated caller is rejected **before** anything about their request
  is evaluated — they aren't even told their JSON was malformed.

### Rotating a key

Change `API_KEYS` and restart. Nothing else stores it.

```bash
node -e "console.log('uc1_'+require('node:crypto').randomBytes(32).toString('base64url'))"
```

---

## The two endpoints

Mounted at exactly the paths in the spec — no `/api/v1` prefix. Both require
`x-api-key`.

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `POST /account/balance_usage` | Read balance + data usage |
| 2 | `POST /ticket/create` | Raise a callback ticket |

Both follow the spec's convention:

- **Always HTTP 200.** The outcome is `status` in the body (`SUCCESS` / `FAILURE`).
  This holds even for a body that isn't valid JSON — that comes back as HTTP 200
  with `error.code` `"400"`.
- `error` is `{}` on success, `{ code, message }` on failure.
- `error.code` is a **string** (`"404"`), never a number.
- `timestamp` is `yyyyMMddHHmmss`, generated at response time. `expiry` is `yyyyMMdd`.
- `requestId` is echoed back. On failure, so is `msisdn`.

### 1. Balance & usage

```bash
curl -X POST http://localhost:4000/account/balance_usage \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-bal-001","timestamp":"20260907120000","msisdn":"85510234567"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-bal-001",
  "timestamp": "20260907120001",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "balance": {
    "main": { "amount": 2.75, "currency": "USD", "expiry": "20261005" },
    "bonus": { "amount": 0.5, "currency": "USD", "expiry": "20260915" }
  },
  "data": { "allowanceMB": 10240, "usedMB": 7680, "remainingMB": 2560, "expiry": "20260930" }
}
```

`balance.bonus` is `null` for a subscriber with no bonus wallet (try `85510555111`).

Failure codes: `400` malformed request · `404` subscriber not found · `500` internal error.

### 2. Create ticket

```bash
curl -X POST http://localhost:4000/ticket/create \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-tkt-001","timestamp":"20260907120130","msisdn":"85510234567",
       "type":"COMPLAINT","category":"BALANCE_USAGE",
       "summary":"Customer says 2 GB of data disappeared overnight without use.",
       "callbackNumber":"85510234567"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-tkt-001",
  "timestamp": "20260907120131",
  "ticket": { "ticketId": "TKT-20260907-0001", "status": "OPEN", "createdAt": "20260907120131" }
}
```

`ticketId` is `TKT-<yyyyMMdd>-<4-digit daily sequence>`, allocated from an atomic
per-day counter in Mongo, so concurrent calls can't be handed the same number.

Failure codes: `400` malformed request · `500` internal error.

**A ticket does not require the subscriber to exist.** The spec's fallback path is
"lookup returned 404 → apologise → raise a ticket anyway", so an unknown `msisdn`
still gets a ticket.

---

## Demo numbers

Seeded by `npm run seed`, chosen so both paths of the flow can be shown live.

| msisdn | Endpoint 1 result |
|--------|-------------------|
| `85510234567` | SUCCESS — the spec's example payload, field for field |
| `85510555111` | SUCCESS — POSTPAID, `bonus: null` |
| `85510777222` | SUCCESS — zero balance, data exhausted (`remainingMB: 0`) |
| `85510000000` | FAILURE `404` — any unseeded number does this |
| `85510999500` | FAILURE `500` — forces the internal-error branch on **both** endpoints |

The forced-failure numbers are env-driven, not hardcoded data — change
`FORCE_BALANCE_ERROR_MSISDNS` / `FORCE_TICKET_ERROR_MSISDNS` in `server/.env`.
They're checked before the DB lookup, so a forced `500` beats a would-be `404`.

`msisdn` matching is on digits only, so `+855 10 234 567` resolves to
`85510234567`. The success response returns the stored canonical number; a
failure echoes back exactly what was sent.

---

## Console

<http://localhost:4200> — one panel per endpoint with an editable request body
(edit it into invalid JSON to demo the `400` branch), the raw response, the HTTP
status, and **what the agent would say** with that payload. Below them, the
tickets raised so far.

Paste the key into the bar at the top; it's masked so the console can be
screen-shared, and stored in that browser's `localStorage` only.

**The key is deliberately not built into the console.** A Vite `VITE_*` variable
is inlined into the output JavaScript, so baking it in would commit it to the
repo and hand it to every visitor of the deployed page. Each teammate supplies
their own key instead, and the deployed console is inert until they do.

---

## Deploying (for devops)

**Deploy the `server` only.** The React console is a local development tool — it
needs no deployment for the team to use the APIs, which they call directly with
the key.

### Option A — Docker Compose (recommended)

Brings up the API and its MongoDB together. Two steps:

```bash
cp .env.example .env     # then set API_KEYS in it
docker compose up -d
```

That's the whole deploy. Compose **refuses to start** if `API_KEYS` is unset,
and the API container waits for Mongo to pass a real health check before it
starts.

| | |
|---|---|
| API | `http://localhost:4000` (`API_HOST_PORT` to change) |
| Mongo | bundled, data in the `mongo-data` volume |
| Health | `GET /demo/health` |

Seeding happens automatically on container boot. It's an idempotent upsert, so
restarts don't duplicate subscribers and **don't** wipe tickets or reset the
ticketId sequence.

To use a managed database (Atlas) instead of the bundled one, set `MONGO_URI` in
`.env` — it overrides the default and the `mongodb` service can be deleted.

```bash
docker compose logs -f api      # follow logs
docker compose down             # stop, keep data
docker compose down -v          # stop, delete data
```

### Option B — plain Node

Node 20+. From the repo root:

```bash
npm install
npm run seed     # ONCE, after the database is reachable
npm start
```

Skipping `npm run seed` leaves the database empty, and then **every lookup
returns `404 Subscriber not found`** — that's the first thing to check if the
API is up but nothing resolves. (The Docker path runs this for you.)

### Environment variables

For Docker, these go in the repo-root `.env` (see `.env.example`). For plain
Node, in `server/.env`. Either way — **not** in a committed file; both are
gitignored and must stay that way.

Only `API_KEYS` has no default, and only `MONGO_URI`'s default is wrong for a
deployment. Everything else can be left alone.

| Var | Required | Value |
|-----|----------|-------|
| `API_KEYS` | **yes** | the key(s) the team was issued, comma-separated. The server **exits on startup** if this is missing |
| `MONGO_URI` | **yes** | a real MongoDB connection string (Atlas or managed). The default points at a local dev database that won't exist on the host |
| `PORT` | no | defaults to `4000`; most hosts inject their own |
| `TZ` | recommended | `Asia/Phnom_Penh`. Containers default to UTC, which shifts the `yyyyMMddHHmmss` timestamps and the date inside every `ticketId` |
| `CORS_ORIGIN` | no | leave `*` unless a browser app will call this |
| `LOG_LEVEL` | no | `info` |

### Health check

`GET /demo/health` — needs no API key, returns liveness and Mongo status only.
Use it for the platform's health probe.

### Notes

- **Serve over HTTPS.** An `x-api-key` on plain HTTP is readable in transit;
  every managed host terminates TLS for you.
- Node 20 or newer.
- Anyone holding a key can read the seeded subscribers and every ticket raised.
  The data is mock, but treat a key as trusted-teammate access.

---

## Layout

```
server/
  server.js                     entry — connect Mongo, then listen
  src/app.js                    Express wiring, JSON-parse-error → 200 FAILURE
  src/routes/specRoutes.js      the two documented endpoints
  src/routes/demoRoutes.js      /demo/* console helpers — NOT part of the spec
  src/middleware/apiKeyAuth.js  mandatory x-api-key, constant-time compare
  src/controllers/              per-endpoint request → envelope
  src/services/                 lookup + ticket creation, builds spec payloads
  src/validation/               per-endpoint field rules (every failure is a 400)
  src/models/                   Subscriber, Ticket, Counter
  src/utils/envelope.js         the SUCCESS/FAILURE envelope, single source
  src/utils/errors.js           AppError with the spec's string codes
  seed/                         demo subscribers + seed script
  tests/                        contract tests, asserted against the spec examples
client/
  src/App.jsx                   the two panels + ticket list
  src/readback.js               response → what the agent says
```

Response shape lives in exactly one place — `src/utils/envelope.js` — and every
controller goes through it, so key order and the `error: {}` convention can't
drift endpoint to endpoint.

### `/demo/*` helpers (not in the spec)

Mounted under `/demo` so they can't be confused with the two documented
endpoints.

| Route | Key | Returns |
|-------|-----|---------|
| `GET /demo/health` | not required | liveness only — no data, no config |
| `GET /demo/subscribers` | **required** | the seeded subscribers |
| `GET /demo/tickets?limit=20` | **required** | recent tickets |

The two data routes need a key because they return customer-shaped records —
leaving them open would undo the point of protecting the endpoints they support.

---

## Decisions where the spec left room

1. **`callbackNumber` is marked required but "defaults to `msisdn`".** Read as: if
   omitted, it's filled in from `msisdn` rather than rejected. A value that *is*
   supplied must be a usable number.
2. **`type` accepts only `COMPLAINT`** — the one enum member the spec names.
   Widen `TICKET_TYPES` in `src/validation/ticketCreateRequest.js` if the real
   ticketing system exposes more.
3. **`category` is validated as a non-empty string, not an enum.** The spec's
   table types it `string` and says `BALANCE_USAGE` is what *this demo* sends.
4. **`msisdn` validation is deliberately loose** — anything with 6+ digits. The
   spec puts no pattern on it, and a real CLI may arrive as `+855…`.
5. **`error.message` for a `400` carries the detail** (`"Malformed request: msisdn
   is required"`). The spec fixes the `{code, message}` shape and the text for
   `404`/ticket-`500`, but not for `400`; the detail rides inside `message` so no
   extra key is added.
6. **Unknown paths return a real HTTP 404** with a pointer to the two endpoints.
   The HTTP-200 convention describes the documented endpoints, not typos.
7. **`0.50` serialises as `0.5`.** JSON numbers can't carry a trailing zero — the
   value is identical. Format it for speech at the point of readback (as
   `client/src/readback.js` does), not in the payload.
8. **Auth returns a real HTTP 401**, the only non-200 on the spec paths. The
   spec defines no auth, so its HTTP-200 convention doesn't cover this case; the
   body still carries the FAILURE envelope for envelope-parsing callers. If your
   agent code can only handle 200s, `src/middleware/apiKeyAuth.js` is a one-line
   change to `res.status(200)`.

---

## Environment

`server/.env` (copied from `.env.example`, already pointed at the local
`infra-compose.yml` Mongo):

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `4000` | |
| `API_KEYS` | — | **mandatory**, comma-separated; server won't start without it |
| `MONGO_URI` | `…/uc1_demo_mock` | root/root from `infra-compose.yml` |
| `MONGO_URI_TEST` | `…/uc1_demo_mock_test` | `npm test` suffixes it per test file |
| `CORS_ORIGIN` | `*` | narrow to the console's origin when deployed |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `TZ` | `Asia/Phnom_Penh` | timezone for `yyyyMMddHHmmss` / `yyyyMMdd` |
| `MAX_SUMMARY_LENGTH` | `2000` | longer summaries are a `400` |
| `FORCE_BALANCE_ERROR_MSISDNS` | `85510999500` | comma-separated |
| `FORCE_TICKET_ERROR_MSISDNS` | `85510999500` | comma-separated |
