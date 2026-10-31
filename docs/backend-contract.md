# Backend contract (API ⇄ worker ⇄ UI)

Shared source of truth for the parallel build. Change it here first, then in code.

## Processes (each runs and deploys independently — one Railway service each)
| Process | Entry | npm | Railway service |
|---|---|---|---|
| API (Hono, HTTP + SSE) | `src/api-main.ts` | `npm start` / `npm run dev:api` | `api` (public domain, healthcheck `/health`) |
| Worker (job runner, no HTTP) | `src/worker-main.ts` | `npm run worker` / `npm run dev:worker` | `worker` (no domain) |
| Migrations | `src/db/migrate.ts` | `npm run db:migrate:deploy` | `api` pre-deploy command |
| Postgres | — | — | Railway Postgres plugin (`DATABASE_URL`) |
| UI | `ui-prototype/index.html` (later gtm-ui repo) | served by API at `/` in dev | `api` serves it for now |

They share **only the database**. API enqueues rows in `jobs`; worker claims them
(`FOR UPDATE SKIP LOCKED`), writes `log`/`result`/`status`; API streams the row over SSE.

## Gates — `src/core/gates.ts` (already written, do not change semantics)
`STAGES`, `JOB_TYPES`, `REQUIRES`, `PRODUCES`, `CLIENT_STAGES`, `missingApproval(type, approvals)`,
`laterStages(stage)`. Client-level stages (`icp`, `competitors`) have `approvals.campaign_id = null`;
the rest are per campaign. Pass client-level ∪ that campaign's approvals.

## Config — `src/config.ts`
`DATABASE_URL, PORT, STORAGE_DIR, BULK_DIR, SECRETS_MASTER_KEY?, CORS_ORIGIN (comma list),
DEMO_MODE off|auto|on (default auto), LLM_DAILY_BUDGET_USD (default 5), NODE_ENV`.
Global provider keys (`FIRECRAWL_API_KEY`, `ADATA_API_KEY`, `AI_ARK_API_KEY`, `COLDIQ_API_KEY`,
`OPTIMAVERIFIER_API_KEY`, `PLUSVIBE_API_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`) come from process env.

## HTTP API (all JSON; errors `{error:{code,message}}`; `/api/*` needs the `sid` session cookie)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | `{ok:true}` |
| POST | `/auth/login` | `{email,password}` → `{user:{id,email,role}}` + `sid` cookie |
| POST | `/auth/logout` | → `{ok:true}` |
| GET | `/auth/me` | → `{user, demoMode}` (401 if none) |
| GET | `/api/lookup?url=` | → `{domain,name,description,favicon}` (homepage `<title>`/meta, 5s timeout, no key) |
| GET | `/api/clients` | → `[{id,name,website,campaigns:[{id,name,status}]}]` |
| POST | `/api/clients` | `{website}` or `{name,description?,questionnaire?}` → client |
| GET | `/api/clients/:id` | → `{client,profile,approvals,campaigns,latestJobs:{[type]:job}}` |
| PATCH | `/api/clients/:id/profile` | `{icp?,angles?,contextMd?}` → profile; revokes `icp` + later stages |
| POST | `/api/clients/:id/campaigns` | `{name,angle,persona?,segment?,targeting?}` → campaign (`targeting` = the UI's source/find form, survives reloads) |
| GET | `/api/campaigns/:id` | → `{campaign,latestJobs,companies,contacts}` (`latestJobs` = this campaign's jobs) (contacts joined with campaign_leads: `leadStatus, personalization`) |
| PATCH | `/api/campaigns/:id` | `{name?,sequence?}` → campaign |
| PATCH | `/api/campaigns/:id/leads/:contactId` | `{personalization?,status?}` → lead |
| POST | `/api/jobs` | `{clientId,campaignId?,type,input?}` → 202 `{jobId}` · 409 `{error:{code:"GATE",needs}}` |
| GET | `/api/jobs/:id` | → job row |
| GET | `/api/jobs/:id/events` | SSE: `log` `{line}` · `status` `{status,result?}`; closes on done/error/cancelled |
| POST | `/api/jobs/:id/cancel` | → `{ok:true}` |
| POST | `/api/approvals` | `{clientId,campaignId?,stage,decision,note?}` → approval · 409 if the producing job isn't `done`. `approved` on a re-run stage revokes later stages first. `send` is refused here — only `/campaigns/:id/draft` approves it. `strategy` is satisfied by the client-level `segments` job. |
| POST | `/api/campaigns/:id/draft` | → 202 `{jobId}` (one tx: `send` approval + enqueue `draft`) |

## Job types — input → result (result is also persisted to tables by the worker)
| type | input | result | persists |
|---|---|---|---|
| research | `{website?}` | `{icp: Icp}` | `files` (research md), `client_profiles.icp`, `context_md` |
| competitors | `{}` | `Competitors` | `client_profiles.icp.competitors/queries` |
| segments | `{}` | `Segments` | `client_profiles.angles` |
| source | `{dataset:"saas"\|"local"\|"lookalike", filters, seedDomains?, allowPaid?, reason?, limit?}` | `{companies:CompanyRow[]}` | `companies` (skip domains already used by this client — log it) |
| find | `{titles?:string[]}` | `{contacts:ContactRow[]}` | `contacts` + `campaign_leads` |
| verify | `{}` | `{contacts:[{email,emailStatus,sendable,verifyNote}], counts:{sendable,held,dropped}}` | `contacts`, `email_verifications` |
| copy | `{method?:"default"\|"braun"}` | `Copy` | `campaigns.sequence`, `campaign_leads.personalization` |
| draft | `{}` | `{externalCampaignId, uploaded}` | `campaigns.external_campaign_id/status`, `campaign_leads` |

`CompanyRow = {companyName,domain,industry?,companySize?,location?,listSource}`
`ContactRow = {email,firstName,lastName,title,companyName,companyDomain,findSource,linkedinUrl?}`
Every result may carry `demo: true` (fixture) and `costUsd` (LLM jobs). Failed jobs: `status=error`, `result.error`.
`campaigns.sequence = {subject, sequence:[{step,waitDays,body}]}` — step 1 body is per lead (`campaign_leads.personalization.body`), later steps shared.
`source` filters use `providers/bulk.ts` keys: saas `industry,location,size`; local `category,state`.

## LLM — `src/agents/run.ts` (Claude Agent SDK)
`runIcp(ctx,{website,researchMd,questionnaire?}) → Icp` · `runCompetitors(ctx,{icp}) → Competitors` ·
`runSegments(ctx,{icp,competitors,questionnaire?}) → Segments` · `runCopy(ctx,{icp,campaign,leads,method}) → Copy`.
Zod schemas in `src/agents/schemas.ts` (`Icp, Competitors, Segments, Copy`).

## Demo fixtures — `fixtures/demo/scriptlens.json`
`{ results: {[jobType]: result}, logs: {[jobType]: string[]} }` — every result parses with its schema.
`DEMO_MODE=on`: all jobs replay fixtures. `auto`: a live handler throwing `MissingKeyError` falls back
(log "demo data (missing X)"). **`draft` is never faked under `auto`.**

## Defaults chosen (change by asking)
Competitors is its own approval stage · per-lead email body (step 1) + shared follow-ups ·
skip already-used domains per client · support chat hidden · DEMO_MODE auto · $5/day LLM cap ·
Agent SDK for all LLM jobs · unwired angles (new-hire/hiring/competitor-engagers/tech-stack) → 409 `NOT_WIRED`.
