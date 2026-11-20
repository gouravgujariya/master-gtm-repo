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

## Gates — `src/core/gates.ts` (do not change semantics without changing this file first)
`STAGES`, `JOB_TYPES`, `REQUIRES`, `PRODUCES`, `CLIENT_STAGES`, `missingApproval(type, approvals)`,
`laterStages(stage)`. Client-level stages (`intake`, `icp`, `competitors`) have `approvals.campaign_id = null`;
the rest are per campaign. Pass client-level ∪ that campaign's approvals.

Stage order (the ScaleSprint workflow): `intake → icp → competitors → strategy → offer → companies → qualified
→ contacts → copy → send`. Requirements: research `[intake]` · offer `[strategy]` · source `[strategy, offer]` ·
qualify `[companies]` · find `[qualified]` · copy `[contacts, offer]` · draft `[copy, send]`. `intake` has no
producing job: `POST /api/approvals` approves it only when `intakeStatus().missing` is empty (offer text + ≥1
`case_study` file), else 409 `INTAKE_INCOMPLETE`. Migration `0001` backfills `intake`/`offer`/`qualified`
approvals for work that was already past those gates.

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
| POST | `/auth/demo` | Only with `DEMO_MODE=on` and not in production: signs in the shared `demo@demo.local` user → `{user}` + `sid` cookie. 404 otherwise |
| GET | `/api/lookup?url=` | → `{domain,name,description,favicon}` (homepage `<title>`/meta, 5s timeout, no key) |
| GET | `/api/clients` | → `[{id,name,website,campaigns:[{id,name,status}]}]` |
| POST | `/api/clients` | `{website}` or `{name,description?,questionnaire?}` → client |
| GET | `/api/clients/:id` | → `{client,profile,approvals,campaigns,latestJobs:{[type]:job},files:[{id,kind,filename,size,createdAt}],intake}` |
| PATCH | `/api/clients/:id/profile` | `{icp?,angles?,contextMd?}` → profile; an `icp`/`contextMd` edit revokes `icp` + later stages, an `angles`-only edit revokes nothing |
| PATCH | `/api/clients/:id/intake` | `{offer?,pricing?,bookingLink?,senderNames?}` (merged into `client_profiles.offer`) → `{offer,intake}` |
| POST | `/api/clients/:id/files` | `{kind:questionnaire\|transcript\|case_study\|dnc\|other, filename, contentText≤200k}` → 201 `{file,intake}` |
| GET / DELETE | `/api/clients/:id/files/:fileId` | → file incl. `contentText` / → `{ok,intake}` |
| POST | `/api/clients/:id/campaigns` | `{name,angle,persona?,segment?,targeting?}` → campaign (`targeting` = the UI's source/find form, survives reloads) |
| GET | `/api/campaigns/:id` | → `{campaign,latestJobs,companies,contacts}` (`latestJobs` = this campaign's jobs) (contacts joined with campaign_leads: `leadStatus, personalization`) |
| PATCH | `/api/campaigns/:id` | `{name?,sequence?,offer?}` → campaign; an `offer` edit revokes `offer` + later stages of this campaign |
| PATCH | `/api/campaigns/:id/leads/:contactId` | `{personalization?,status?}` → lead; `excluded` leads are skipped by verify/copy/draft |
| PATCH | `/api/campaigns/:id/companies/:companyId` | `{qualified}` → company (operator override, reason recorded) |
| GET | `/api/campaigns/:id/export?what=companies\|contacts` | → `text/csv` attachment |
| POST | `/api/jobs` | `{clientId,campaignId?,type,input?}` → 202 `{jobId}` · 409 `{error:{code:"GATE",needs}}` |
| GET | `/api/jobs/:id` | → job row |
| GET | `/api/jobs/:id/events` | SSE: `log` `{line}` · `status` `{status,result?}`; closes on done/error/cancelled |
| POST | `/api/jobs/:id/cancel` | → `{ok:true}` |
| POST | `/api/approvals` | `{clientId,campaignId?,stage,decision,note?}` → approval · 409 if the producing job isn't `done`. `approved` on a re-run stage revokes later stages first. `send` is refused here — only `/campaigns/:id/draft` approves it. `strategy` is satisfied by the client-level `segments` job. |
| POST | `/api/campaigns/:id/draft` | → 202 `{jobId}` (one tx: `send` approval + enqueue `draft`) |

## Job types — input → result (result is also persisted to tables by the worker)
| type | input | result | persists |
|---|---|---|---|
| research | `{website?, feedback?}` | `{icp: Icp}` | `files` (research md), `client_profiles.icp`, `context_md` |
| competitors | `{feedback?}` | `Competitors` | `client_profiles.icp.competitors/queries` |
| segments | `{feedback?}` | `Segments` + `segments[].reachable: number\|null` (bulk-list count, capped 200,001) | `client_profiles.angles` |
| offer | `{feedback?}` | `Offer {headline, frontEndOffer, proofPoints[], cta, riskReversal?}` | `campaigns.offer` |
| source | `{dataset:"saas"\|"local"\|"lookalike", filters, seedDomains?, allowPaid?, reason?, limit?}` | `{companies:CompanyRow[], skipped:{[reason]:n}}` | `companies` (skips: already used · competitor · do-not-contact list · the client itself — each logged) |
| qualify | `{criterion?}` (default built from the segment's criteria) | `{results:[{domain, qualified:boolean\|null, reason}], counts}` (null = site unreachable) | `companies.qualified/qualify_reason` |
| find | `{titles?:string[]}` (qualified companies only) | `{contacts:ContactRow[]}` | `contacts` + `campaign_leads` |
| verify | `{}` | `{contacts:[{email,emailStatus,sendable,verifyNote}], counts:{sendable,held,dropped}}` | `contacts`, `email_verifications` |
| copy | `{method?:"default"\|"braun", feedback?}` (gets the approved offer + intake sender names/booking link) | `Copy` | `campaigns.sequence`, `campaign_leads.personalization` |
| draft | `{}` | `{externalCampaignId, uploaded}` | `campaigns.external_campaign_id/status`, `campaign_leads` |

`CompanyRow = {companyName,domain,industry?,companySize?,location?,listSource}`
`ContactRow = {email,firstName,lastName,title,companyName,companyDomain,findSource,linkedinUrl?}`
Every result may carry `demo: true` (fixture) and `costUsd` (LLM jobs). Failed jobs: `status=error`, `result.error`.
`campaigns.sequence = {subject, sequence:[{step,waitDays,body}]}` — step 1 body is per lead (`campaign_leads.personalization.body`), later steps shared.
`source` filters use `providers/bulk.ts` keys: saas `industry,location,size`; local `category,state`.

## LLM — `src/agents/run.ts` (Claude Agent SDK)
`runIcp(ctx,{website,researchMd,questionnaire?}) → Icp` · `runCompetitors(ctx,{icp}) → Competitors` ·
`runSegments(ctx,{icp,competitors,questionnaire?}) → Segments` · `runOffer(ctx,{icp,segment,intake?,questionnaire?}) → Offer` ·
`runQualify(ctx,{criterion,companies}) → Qualify` (HAIKU, batches of 20) · `runCopy(ctx,{icp,campaign,leads,method,offer?}) → Copy`.
Every LLM job takes an optional `feedback` (the operator's redo note → `<operator_feedback>` in the prompt).
"questionnaire" = all client inputs (questionnaire + transcripts + case studies) as labelled text.
Zod schemas in `src/agents/schemas.ts` (`Icp, Competitors, Segments, Offer, Qualify, Copy`).

## Demo fixtures — `fixtures/demo/scriptlens.json`
`{ results: {[jobType]: result}, logs: {[jobType]: string[]} }` — every result parses with its schema.
`DEMO_MODE=on`: all jobs replay fixtures. `auto`: a live handler throwing `MissingKeyError` falls back
(log "demo data (missing X)"). **`draft` is never faked under `auto`.**

## Defaults chosen (change by asking)
Competitors is its own approval stage · per-lead email body (step 1) + shared follow-ups ·
skip already-used domains per client · support chat hidden · DEMO_MODE auto · $5/day LLM cap ·
Agent SDK for all LLM jobs · unwired angles (new-hire/hiring/competitor-engagers/tech-stack) → 409 `NOT_WIRED`.
