# AgenticData — API / MCP Reference

- **Role:** PRIMARY for decision-makers + finding & verifying emails. Used by `agenticdata-contacts`.
- **Host:** `agenticdata.host`
- **Integration:** **MCP (already connected)** — this is the preferred path. Raw HTTP API is the fallback.
- **Env var (for script fallback):** `ADATA_API_KEY` (`ADATA_live_…`), sent as a Bearer token.

## MCP tools (use these first)

| Tool | Purpose | Returns |
|---|---|---|
| `search(filters)` | Find people by filters (company, title/seniority, location, etc.) | up to 100 matching people |
| `enrich(email \| phone \| linkedin)` | Enrich + verify a single identifier | a person + company record (incl. verified email) |

Typical use in `agenticdata-contacts`:
1. `search` with company + target titles → candidate decision-makers.
2. `enrich` per candidate (by linkedin or name+company) → resolved + verified email.
3. Keep verified/valid; drop invalid/unknown. Fallback to AI Ark for misses.

## HTTP API (CONFIRMED — powers the scriptable primary finder `agenticdata-find.ts`)

- Base: `https://api.agenticdata.host` · Auth: `Authorization: Bearer ADATA_live_…` (or `X-API-Key`)
- Docs: https://agenticdata.host/docs/api-reference · full ref: `/llms-full.txt`

| Endpoint | Use | Notes |
|---|---|---|
| `GET /v1/search/people?company_domain=&title=&seniority=&limit=` | **primary finder** — decision-makers by company + title | returns `results[]` with `first_name,last_name,job_title,primary_email,linkedin_url,company_domain`; `primary_email` may be null |
| `POST /v1/email/find` `{first_name,last_name,domain}` | backfill email when `primary_email` is null | |
| `GET /v1/enrich/person?email=` · `POST /v1/enrich` `{email\|phone\|linkedin\|name\|company\|domain}` | enrich a known identifier | |
| `POST /v1/email/verify` `{email}` | verify (MillionVerifier) → `result` (ok/catch_all/invalid…), `is_safe_to_deliver` | we use OptimaVerifier as the gate instead |
| `GET /v1/search/companies?company_industry=&…&limit=` | company sourcing by ICP | |
| `POST /v1/search/list-build` `{companies{…},contacts{titles[]},per_company_limit}` | sync list build (≤~500) | ICP-filter based, not a fixed domain list |
| `POST /v1/search/list-build/jobs` → poll `/{job_id}` → `/download` | async export (1k–10k+) | |

Pricing is per-call (micro-priced); with an `ADATA_live_` key + plan, billing is on the account (no x402
micropayment needed). Same data as the MCP `search`/`enrich` tools.

## Notes
- Prefer MCP — no script needed, results are live and interactive.
- Rate limits + credit costs: confirm on the account. Batch enrich calls with polite concurrency.
- System of record for contacts = Supabase (`supabase-schema.md`); dedup by email + LinkedIn URL.
