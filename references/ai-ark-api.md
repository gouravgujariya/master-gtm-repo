# AI Ark — API Reference (company sourcing + lookalikes + fallback finder + catch-all cross-check)

- **Roles:** (1) company sourcing + **native lookalikes**, (2) fallback contact/email finder after AgenticData,
  (3) **catch-all cross-check verifier** (its email-finder verifies via BounceBan and flags SMTP vs CATCH_ALL).
- **Base URL:** `https://api.ai-ark.com/api/developer-portal` (+ `/v1/...`)
- **Auth:** header `X-TOKEN: <AI_ARK_API_KEY>` + `Content-Type: application/json`
- **Env var:** `AI_ARK_API_KEY`
- **Rate limits:** 5 req/s, 300/min, 18,000/hr. **Docs:** https://docs.ai-ark.com

## Endpoints (confirmed)
| Action | Method + path | Notes |
|---|---|---|
| Credit balance | `GET /v1/payments/credits` | → `{ total }`. Free. |
| **People search** | `POST /v1/people` | body: `account` + `contact` filter DSL, `page`, `size` (≤100). → `content[]` + **`trackId`** (uuid) |
| **Email finder (submit)** | `POST /v1/people/email-finder` | body: `{ trackId, webhook? }`. Async; trackId expires 6h, single-use. → `state:"PENDING"`, `statistics` |
| **Email finder (poll)** | `GET /v1/people/email-finder/{trackId}/inquiries?page=&size=` | → `content[]`, each `output[]` = `{ address, domainType:"SMTP"\|"CATCH_ALL", status:"VALID"…, found, mx.provider }` |
| **Company search + lookalike** | `POST /v1/companies` | body: `lookalikeDomains[]` (≤5 domains/LinkedIn URLs) + `account` DSL (industries, employeeSize, location, revenue, funding), `page`, `size`. → `content[]` |

### People filter DSL (POST /v1/people)
- `account`: `domain`, `name` (SMART/WORD/STRICT), `linkedin`, `industries`, `employeeSize` (RANGE), `revenue`,
  `type`, `foundedYear`, `location`, `technologies`.
- `contact`: `fullName`, `seniority` (founder, c-suite, …), `departmentAndFunction`,
  `experience.current.title` (with match mode), tenure, `skill`, `education`, `linkedin`, `profileBadge`.

### Company filter DSL (POST /v1/companies)
- `lookalikeDomains`: up to 5 seed domains/LinkedIn URLs → similar companies (the lookalike feature).
- `account.industries` `{any/all:{include/exclude:{mode:WORD|SMART|STRICT, content:[…]}}}`,
  `account.employeeSize` `{type:"RANGE", range:[{start,end}]}`, `account.location`, `account.revenue`,
  `account.funding` `{type:[…], totalAmount:{start,end}}`.

## How this repo uses AI Ark
1. **Lookalikes:** seed `lookalikeDomains` from client case studies (`firecrawl-enrich`) → `POST /v1/companies`.
2. **Company sourcing:** `POST /v1/companies` with `account` DSL (for non-bulk B2B).
3. **Fallback finder:** for contacts AgenticData missed → `POST /v1/people` (by company `domain` + `contact` title/seniority)
   → take `trackId` → `POST /v1/people/email-finder` → poll `…/inquiries` → keep `status:VALID`.
4. **Catch-all cross-check:** when OptimaVerifier says `catch-all`, re-find that person via AI Ark; if AI Ark
   returns `domainType:"SMTP"` + `status:"VALID"` → keep; if `CATCH_ALL`/not found → drop.

## Filter DSL (CONFIRMED from live testing)
Every filter is wrapped `{ "any": { "include": [ ... ] } }`; text filters use `{ mode:"SMART"|"WORD"|"STRICT", content:[...] }`.
- **By LinkedIn (most precise — use when you have it):** `contact.linkedin = { any: { include: ["https://www.linkedin.com/in/<slug>"] } }` → matches exactly 1 person. Normalize URLs to `https://www.` form.
- By name + domain: `account.domain = { any: { include: ["figma.com"] } }` and `contact.fullName = { any: { include: { mode:"SMART", content:["Shannon Doyle"] } } }`.
- ⚠️ Wrong shapes (e.g. `domain:{include:[…]}`) are silently ignored and return unfiltered people — always use `{any:{include:…}}`.

## Notes (CONFIRMED)
- Email-finder is **async** and **`webhook` is REQUIRED** in the submit body (even though we retrieve by polling
  `/inquiries`). Pass a placeholder HTTPS URL (`AI_ARK_WEBHOOK` in `.env`) if you don't run a real listener.
- trackId single-use, 6h TTL. Poll `/v1/people/email-finder/{trackId}/inquiries`; each `output[]` has
  `{address, domainType:"SMTP"|"CATCH_ALL", status:"VALID", found}`.
- BounceBan verification is built in → SMTP/VALID = deliverable; CATCH_ALL = unconfirmed mailbox.
- **Catch-all rescue rule (tested):** keep only `SMTP`+`VALID`; a CATCH_ALL result does NOT rescue.
- Reverse lookup (`POST /v1/people/reverse-lookup`, body `{search:"<email|phone>"}`) exists but searches by
  email/phone, not LinkedIn — not used for verification here.
