# UC1 Demo Mock API

MERN implementation of the mock telco APIs for the inbound-call demo — UC1
(Balance & Data Usage Check, three branches), UC2 (Recharge & Top-up
Assistance, three branches) and UC3 (Plan and Package Upgrade). Standalone —
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
npm test              # 302 contract tests
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

## The endpoints

Mounted at exactly the paths in the spec — no `/api/v1` prefix. All require
`x-api-key`.

| # | Endpoint | Branch | Purpose |
|---|----------|--------|---------|
| 1 | `POST /account/balance_usage` | UC1 A | Read balance + data usage |
| 2 | `POST /account/usage_history` | UC1 B | Usage history + CDR for the last month, with the cause of a deduction |
| 3 | `POST /account/plan_details` | UC1 C, UC3 A | Active plan (with inclusions) + active service / VAS list + **the last 2 plans held** |
| 4 | `POST /recharge/send_link` | UC2 A | Text the caller a recharge deep-link |
| 5 | `POST /recharge/details` | UC2 B, UC2 C, UC3 B | Recharge/charge history, and whether one matches the caller's claim |
| 6 | `POST /plan/send_details` | UC3 A | Text the caller their plan details, current or previous |
| 7 | `POST /plan/recommendations` | UC3 B | A recommended plan, plus the rest of the catalog in the same call |
| 8 | `POST /plan/send_change_link` | UC3 B | Text a deep-link to actually switch plans |
| 9 | `POST /notification/send` | UC3 B | Push a Smart App notification — the **first non-SMS channel** |
| 10 | `POST /ticket/create` | shared | Raise a ticket and return its reference |

Endpoints 1–3 and 7 are lookups. Endpoints 4, 6, 8 and 9 are the project's
**action** endpoints — each has a real-world side effect (an SMS or a push),
though the mock records the send rather than calling a gateway.
`/ticket/create` is shared by every branch and differs only in the `type` and
`category` values sent:

| Branch | `type` | `category` |
|--------|--------|------------|
| UC1 A | `COMPLAINT` | `BALANCE_USAGE` |
| UC1 B | `COMPLAINT` | `NEW_COMPLAINT` |
| UC1 C | `ENQUIRY` | `NEW_ENQUIRY_PREHANDLED` |
| UC2 A | `ENQUIRY` | `NEW_ENQUIRY_PREHANDLED` |
| UC2 B | `COMPLAINT` | `NEW_COMPLAINT` |
| UC2 C | `ENQUIRY` | `NEW_ENQUIRY_PREHANDLED` |
| UC3 A | `ENQUIRY` | `NEW_ENQUIRY_PREHANDLED` |
| UC3 B | `COMPLAINT` | `NEW_COMPLAINT` |

All follow the spec's convention:

- **Always HTTP 200.** The outcome is `status` in the body (`SUCCESS` / `FAILURE`).
  This holds even for a body that isn't valid JSON — that comes back as HTTP 200
  with `error.code` `"400"`.
- `error` is `{}` on success, `{ code, message }` on failure.
- `error.code` is a **string** (`"404"`), never a number.
- `timestamp` is `yyyyMMddHHmmss`, generated at response time. `expiry` is `yyyyMMdd`.
- `requestId` is echoed back. On failure, so is `msisdn`.

### 1. Balance & usage  (UC1 Branch A)

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

### 3. Send a recharge link  (UC2 Branch A)

The first of the two **action** endpoints: it sends the caller an SMS with a
recharge deep-link. `amount` is optional — omit it for a generic link.

```bash
curl -X POST http://localhost:4000/recharge/send_link \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-rcg-001","timestamp":"20260910120000","msisdn":"85510234567","amount":5.00}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-rcg-001",
  "timestamp": "20260910120001",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "message": {
    "messageId": "SMS-20260910-0001", "channel": "SMS", "to": "85510234567",
    "status": "SENT", "sentAt": "20260910120001", "resendCount": 0
  },
  "link": {
    "reference": "RCG-20260910-0001",
    "url": "https://smart.com.kh/recharge?ref=RCG-20260910-0001&amount=5.00",
    "amount": 5.00, "currency": "USD", "expiresAt": "20260911120001"
  }
}
```

**Nothing is actually texted.** No SMS gateway is called — the mock records the
send and returns a gateway-shaped response, so it is safe to run repeatedly
against real numbers. Each send is listed by `GET /demo/recharge_links`.

Failure codes: `400` malformed request · `404` subscriber not found ·
`422` unusable amount (zero, negative, or over `MAX_TOPUP_AMOUNT`) ·
`500` gateway unavailable. On a `500` the agent must fall back to voice-only
guidance and **not** claim an SMS was sent.

### 4. Recharge details  (UC2 Branch B)

Checks whether a top-up the caller *claims* to have made is actually there.
`date` and `amount` are the caller's claim, both optional.

```bash
curl -X POST http://localhost:4000/recharge/details \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-rcd-001","timestamp":"20260911120000","msisdn":"85510234567","date":"20260910","amount":5.00}'
```

The pivotal field is `match.confirmed` — **true only for a matching, credited
top-up.** `match.status` (`CREDITED` · `PENDING` · `FAILED` · `REVERSED` ·
`NOT_FOUND`) says which situation it is, so an escalating human knows what they
inherit. The full history comes back either way.

Failure codes: `400` malformed request · `404` subscriber not found ·
`422` claim out of range (future date, older than `RECHARGE_HISTORY_DAYS`, or a
non-positive amount) · `500` internal error.

**UC3 Branch B calls this same endpoint, unchanged**, to check whether the
charge for a plan change posted — the manager confirmed this branch
deliberately reuses UC2 Branch B's check rather than needing its own.

### 6. Plan details, with history  (UC1 Branch C + UC3 Branch A)

```bash
curl -X POST http://localhost:4000/account/plan_details \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-pln-001","timestamp":"20260911120000","msisdn":"85510234567"}'
```

Returns `subscriber`, `plan`, `services` — and, since UC3 Branch A,
`previousPlans`: **the last 2 plans the subscriber held**, newest-ended first.

```json
"previousPlans": [
  {
    "planId": "SMART-COMBO-3",
    "name": "Smart Combo 3",
    "price": { "amount": 3.00, "currency": "USD", "cycle": "MONTHLY" },
    "activatedOn": "20260701",
    "endedOn": "20260830",
    "inclusions": { "dataMB": 5120, "onNetMinutes": 150, "offNetMinutes": 30, "smsCount": 50 }
  }
]
```

`previousPlans` is **purely additive** — it is appended after `services` and no
existing field changed, so UC1 Branch C callers can ignore it. A past plan
carries `endedOn` where the active `plan` carries `renewsOn`: an ended plan does
not renew. `inclusions` is kept in full so the agent can answer *"my old plan had
more data, didn't it?"*.

A subscriber who never changed plan gets `previousPlans: []` — a **SUCCESS**, not
an error. The cap is `MAX_PREVIOUS_PLANS` (default 2, the number the workflow
diagram specifies).

Failure codes: `400` malformed request · `404` subscriber not found · `500`
internal error. Unchanged from UC1 Branch C.

### 7. Send plan details by SMS  (UC3 Branch A)

The second **action** endpoint. `planId` is optional — omit it for the current
active plan, or name one from `previousPlans` to text an old one instead.

```bash
curl -X POST http://localhost:4000/plan/send_details \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-psm-001","timestamp":"20260911120000","msisdn":"85510234567"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-psm-001",
  "timestamp": "20260911120001",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "message": {
    "messageId": "SMS-PLN-20260911-0001", "channel": "SMS", "to": "85510234567",
    "status": "SENT", "sentAt": "20260911120001", "resendCount": 0
  },
  "content": {
    "planId": "SMART-COMBO-5", "planName": "Smart Combo 5",
    "scope": "CURRENT", "includesAddOns": true,
    "summary": "Smart Combo 5 — 5.00 USD monthly, renews 30 Sep 2026. Includes 10 GB data, 300 on-net and 60 off-net minutes, 100 SMS. Add-ons: CallerTune 0.50 USD/mo, NewsAlerts 0.25 USD/mo."
  }
}
```

**Nothing is actually texted**, exactly as with the recharge link. Each send is
listed by `GET /demo/plan_messages`.

`content.scope` is `CURRENT` or `PREVIOUS`. Add-ons only ever go out with a
current plan — no historical add-on data is held, so listing today's VAS against
a plan the caller left months ago would be an invention. The `messageId` uses the
`SMS-PLN-` prefix so it can never collide with `/recharge/send_link`'s series.

Only plans that `/account/plan_details` actually returns are selectable, so the
agent can never text a plan the caller was never read out.

Failure codes: `400` malformed request · `404` subscriber not found ·
`422` unknown plan — not this subscriber's current or previous plan, or they hold
none at all · `500` gateway unavailable. On a `500` the agent must read the plan
details aloud and **not** claim a text is coming.

### 8. Get plan recommendations  (UC3 Branch B)

A pure lookup, same shape as `/account/plan_details`.

```bash
curl -X POST http://localhost:4000/plan/recommendations \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-rec-001","timestamp":"20260911120000","msisdn":"85510234567"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-rec-001",
  "timestamp": "20260911120001",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "plans": [
    {
      "planId": "SMART-COMBO-10", "name": "Smart Combo 10",
      "price": { "amount": 10.00, "currency": "USD", "cycle": "MONTHLY" },
      "inclusions": { "dataMB": 20480, "onNetMinutes": 600, "offNetMinutes": 120, "smsCount": 200 },
      "recommended": true, "reason": "More data and minutes than your current plan"
    },
    {
      "planId": "SMART-POSTPAID-10", "name": "Smart Postpaid 10",
      "price": { "amount": 10.00, "currency": "USD", "cycle": "MONTHLY" },
      "inclusions": { "dataMB": 20480, "onNetMinutes": 500, "offNetMinutes": 150, "smsCount": 250 },
      "recommended": false, "reason": null
    }
  ]
}
```

`plans[]` is **every catalog plan bigger than the caller's current one**, sorted
closest-upgrade first — deliberately the full alternative list, not just the top
pick, so "no, give me a different one" needs no second API call. Only the first
entry is `recommended: true`. A caller already on the top plan gets `plans: []`
— a **SUCCESS**, not an error.

The catalog itself (`server/src/data/planCatalog.js`) is shared reference data,
not per-subscriber — the same six plans for every caller, ranked by an internal
tier. Real plan data and recommendation logic are open items with Axiata.

Failure codes: `400` malformed request · `404` subscriber not found · `500`
internal error.

### 9. Send the plan-change link  (UC3 Branch B)

The project's **third action** endpoint. `planId` is **required** — unlike
`/plan/send_details` there's no default plan to fall back to.

```bash
curl -X POST http://localhost:4000/plan/send_change_link \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-pch-001","timestamp":"20260911120100","msisdn":"85510234567","planId":"SMART-COMBO-10"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-pch-001",
  "timestamp": "20260911120101",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "message": {
    "messageId": "SMS-PCH-20260911-0001", "channel": "SMS", "to": "85510234567",
    "status": "SENT", "sentAt": "20260911120101", "resendCount": 0
  },
  "change": {
    "planId": "SMART-COMBO-10", "planName": "Smart Combo 10",
    "link": {
      "reference": "PCH-20260911-0001",
      "url": "https://smart.com.kh/plan-change?ref=PCH-20260911-0001&plan=SMART-COMBO-10",
      "expiresAt": "20260912120101"
    }
  }
}
```

**Nothing is actually texted.** `messageId` uses a **third distinct prefix**,
`SMS-PCH-`, so it can never collide with UC2-A's `SMS-…` or UC3-A's `SMS-PLN-…`
series. Each send is listed by `GET /demo/plan_change_links`.

Failure codes: `400` malformed request (including a missing `planId`) ·
`404` subscriber not found · `422` `planId` isn't a plan in the catalog ·
`500` gateway unavailable. On a `500` the agent must **not** claim a link is coming.

### 10. Send a Smart App notification  (UC3 Branch B)

The project's **first non-SMS channel** — a push notification, not a text.
Fired alongside the plan-change link, same request shape.

```bash
curl -X POST http://localhost:4000/notification/send \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"req-not-001","timestamp":"20260911120100","msisdn":"85510234567","planId":"SMART-COMBO-10"}'
```

```json
{
  "status": "SUCCESS",
  "error": {},
  "requestId": "req-not-001",
  "timestamp": "20260911120101",
  "subscriber": { "msisdn": "85510234567", "name": "Sok Dara", "type": "PREPAID" },
  "notification": {
    "notificationId": "PUSH-20260911-0001", "channel": "PUSH", "status": "SENT",
    "sentAt": "20260911120101", "title": "Plan change ready",
    "body": "Tap to confirm your switch to Smart Combo 10."
  }
}
```

**Nothing is actually pushed.** Each send is listed by `GET /demo/notifications`.
Whether Axiata's platform has real push infrastructure to wire this up to later
is an open item — the mock demos it either way.

Failure codes: `400` malformed request · `404` subscriber not found ·
`422` `planId` isn't a plan in the catalog · `500` push service unavailable.

### 5. Create ticket

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
| `9654987095` | SUCCESS — Guneet Gandhiok |
| `9870566624` | SUCCESS — Raghav Kumaria, has a bonus wallet |
| `919899047146` | SUCCESS — Ravinder Malhotra, POSTPAID |
| `85510000000` | FAILURE `404` — any unseeded number does this |
| `85510999500` | FAILURE `500` — forces the internal-error branch on **both** endpoints |

The forced-failure numbers are env-driven, not hardcoded data — change
the `FORCE_*_ERROR_MSISDNS` variables in `server/.env` — one per endpoint, so a
single branch can be broken on demand.
They're checked before the DB lookup, so a forced `500` beats a would-be `404`.

`msisdn` matching is on digits only, so `+855 10 234 567` resolves to
`85510234567`. The success response returns the stored canonical number; a
failure echoes back exactly what was sent.

If the exact digits don't match, the **last 10 digits** are tried — so a number
stored as `9654987095` still resolves when a call arrives as `+919654987095`,
and vice versa. Real CLI delivery isn't consistent about the country code, and
without this a subscriber added one way 404s when dialled the other. The
fallback only applies when exactly one stored number matches that tail, so two
numbers sharing a suffix resolve to nobody rather than to the wrong account.

---

## Console

Served two ways:

- **Deployed / Docker** — at the API's own root, `http://<host>:4000/`. The image
  builds it and Express serves the static files from the same origin.
- **Local development** — `npm run dev`, on <http://localhost:4200>, with hot
  reload and Vite proxying API calls to `:4000`.

One panel per endpoint with an editable request body
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

One container serves both the API and the console — the image builds the React
app and Express serves it from the same origin.

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
| **Console** | `http://localhost:4000/` — the full UI, key bar and Send buttons |
| API | `http://localhost:4000/account/{balance_usage,usage_history,plan_details}`, `/recharge/{send_link,details}`, `/plan/{send_details,recommendations,send_change_link}`, `/notification/send`, `/ticket/create` |
| Mongo | bundled, data in the `mongo-data` volume |
| Health | `GET /demo/health` |

The image builds the React console and the API server **serves it from its own
origin**, so one URL gives you both — no proxy, no CORS, no second deployment.
Opening the base URL in a browser gets the console rather than a 404.

Anyone can load the page, but it does nothing until a key is pasted into the bar
at the top, so publishing it doesn't widen access.

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
npm run build    # builds the console; skip it to run the API alone
npm run seed     # ONCE, after the database is reachable
npm start
```

Express serves `client/dist` if that directory exists, so `npm run build` is
what makes the console appear at `/`. Without it you get the API only.

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
  src/routes/specRoutes.js      the documented endpoints (SPEC_PATHS)
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

Mounted under `/demo` so they can't be confused with the documented
endpoints.

| Route | Key | Purpose |
|-------|-----|---------|
| `GET /demo/health` | not required | liveness only — no data, no config |
| `GET /demo/subscribers` | **required** | list the stored subscribers |
| `POST /demo/subscribers` | **required** | add a subscriber to a running instance |
| `GET /demo/tickets?limit=20` | **required** | recent tickets |
| `GET /demo/recharge_links?limit=20` | **required** | recharge links sent (console panel) |
| `GET /demo/plan_messages?limit=20` | **required** | plan-detail SMSs sent (console panel) |
| `GET /demo/plan_change_links?limit=20` | **required** | plan-change links sent (console panel) |
| `GET /demo/notifications?limit=20` | **required** | Smart App notifications sent (console panel) |

Everything but health needs a key: these return and accept customer-shaped
records, so leaving them open would undo the point of protecting the endpoints
they support.

### Adding a subscriber without a redeploy

`POST /demo/subscribers` exists so testers can put their own numbers in against
a deployed instance. Only `msisdn` and `name` are required:

```bash
curl -X POST http://<host>:4000/demo/subscribers \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"msisdn":"9654987095","name":"Guneet Gandhiok"}'
```

Everything else defaults — `PREPAID`, $5.00 main balance, no bonus, a 10 GB
bundle with nothing used, expiries 30 days out. Override any of it:

```bash
curl -X POST http://<host>:4000/demo/subscribers \
  -H "x-api-key: $UC1_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "msisdn": "9870566624",
    "name": "Raghav Kumaria",
    "type": "POSTPAID",
    "balance": {
      "main":  { "amount": 8.20, "currency": "USD", "expiry": "20261020" },
      "bonus": { "amount": 1.50, "currency": "USD", "expiry": "20260925" }
    },
    "data": { "allowanceMB": 20480, "usedMB": 12288, "expiry": "20261010" }
  }'
```

- `201` on create, `200` when it replaced an existing record (upsert by number,
  so re-posting never duplicates), `400` with a message for a bad body.
- `remainingMB` is derived from `allowanceMB - usedMB` unless you send it, so
  the figure the agent reads out can't contradict the other two.
- The number is stored digits-only, so `+91 98990 47146` and `919899047146`
  are the same record.
- Added subscribers survive container restarts — they live in the Mongo volume,
  not the image.

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
| `FORCE_BALANCE_ERROR_MSISDNS` | `85510999500` | comma-separated; forces UC1-A `500` |
| `FORCE_USAGE_ERROR_MSISDNS` | `85510999500` | forces UC1-B `500` |
| `FORCE_PLAN_ERROR_MSISDNS` | `85510999500` | forces UC1-C `500` |
| `FORCE_RECHARGE_ERROR_MSISDNS` | `85510999500` | forces UC2-A `500` (gateway down) |
| `FORCE_TICKET_ERROR_MSISDNS` | `85510999500` | forces the ticket `500` |
| `RECHARGE_LINK_BASE_URL` | `https://smart.com.kh/recharge` | placeholder — real format is an open item |
| `RECHARGE_LINK_TTL_HOURS` | `24` | how long a sent link stays valid |
| `MAX_TOPUP_AMOUNT` | `100` | top-up ceiling; above this is a `422` |
| `FORCE_RECHARGE_DETAILS_ERROR_MSISDNS` | `85510999500` | forces UC2-B `500` |
| `RECHARGE_HISTORY_DAYS` | `30` | how far back UC2-B searches; older claims are a `422` |
| `FORCE_PLAN_SMS_ERROR_MSISDNS` | `85510999500` | forces UC3-A `500` (gateway down) |
| `MAX_PREVIOUS_PLANS` | `2` | how many previous plans `plan_details` returns |
| `FORCE_PLAN_RECOMMENDATIONS_ERROR_MSISDNS` | `85510999500` | forces UC3-B `500` |
| `FORCE_PLAN_CHANGE_LINK_ERROR_MSISDNS` | `85510999500` | forces UC3-B `500` (gateway down) |
| `PLAN_CHANGE_LINK_BASE_URL` | `https://smart.com.kh/plan-change` | placeholder — real format is an open item |
| `PLAN_CHANGE_LINK_TTL_HOURS` | `24` | how long a sent plan-change link stays valid |
| `FORCE_NOTIFICATION_ERROR_MSISDNS` | `85510999500` | forces UC3-B `500` (push service down) |
