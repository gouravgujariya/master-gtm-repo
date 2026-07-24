# ColdIQ — API Reference (LAST-RESORT contact/email finder)

- **Role:** LAST-RESORT work-email finder (waterfall across 40+ providers). Use ONLY after AgenticData AND
  AI Ark fail. Expensive — gate per-missing-contact, never bulk by default.
- **Base URL:** `https://api.coldiq.com`
- **Auth:** `Authorization: Bearer <COLDIQ_API_KEY>` (`ciq_live_…`)
- **Env var:** `COLDIQ_API_KEY`
- **Docs:** https://api.coldiq.com/docs (OpenAPI JSON at `/openapi.json`)

## Endpoints (confirmed from openapi.json)
ColdIQ is a **multi-provider aggregator** (Apollo, Prospeo, LeadMagic, LimaData, BlitzAPI, Wiza, AI Ark, …)
under `/v1/<provider>/…`. There is no single "waterfall verb"; pick a provider route. For last-resort work
email we use **LimaData**:

| Action | Method + path | Body | Notes |
|---|---|---|---|
| **Find work email (by LinkedIn)** | `POST /v1/limadata/find/work-email-linkedin` | `{ "linkedin_url": "<uri>" }` | primary last-resort finder |
| Find work email (by name+domain) | `POST /v1/limadata/find/work-email` | `{ "full_name": "...", "company_domain": "..." }` | fallback when no LinkedIn URL |
| Credit balance | `GET /v1/me/credits` | — | → `{ balance, usedThisMonth }`. Free. (NOTE: `/credits` 404s; `/dashboard/credits` is session-scoped.) |

Other provider routes exist if ever needed: `POST /v1/leadmagic/people/email-finder`,
`POST /v1/blitzapi/enrichment/find-work-email`, `POST /v1/apollo/people/search`, `POST /v1/ai-ark/*`
(we call AI Ark **directly** instead — see `ai-ark-api.md`).

Response bodies for the LimaData finders are loosely typed (nullable) — extract the email defensively.

## How this repo uses ColdIQ
- Last resort only, after AgenticData + AI Ark fail. Prefer the LinkedIn route; fall back to name+domain.
- Any email ColdIQ returns still passes through **OptimaVerifier** before sending.
- Check `GET /v1/me/credits` before batching; log every call (cost control).
