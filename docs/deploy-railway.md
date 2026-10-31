# Deploy on Railway

One GitHub repo → one Railway project → two environments, each with its own Postgres + two services:

| Service | Start | Railway settings |
|---|---|---|
| `api` | `npm start` | pre-deploy `npm run db:migrate:deploy`, healthcheck `/health`, public domain |
| `worker` | `npm run worker` | no domain/healthcheck, restart `ON_FAILURE`, Volume at `/data` |
| `postgres` | — | Railway Postgres; services get `DATABASE_URL` by reference |

| Environment | Branch | Notes |
|---|---|---|
| `production` | `main` | `DEMO_MODE=off`, `LLM_DAILY_BUDGET_USD=20` |
| `development` | `develop` | `DEMO_MODE=auto`, `LLM_DAILY_BUDGET_USD=5` |

All of this is declared in **`.railway/railway.ts`** (Railway Infrastructure as Code). We don't use
`railway.json` because Config as Code is deprecated. New services can't opt into it, and existing
files stop being read on 2026-12-01 ([docs](https://docs.railway.com/config-as-code)).

## One-time setup

1. **Install the CLI and SDK:** `npm i -g @railway/cli`, `railway login`, then `npm i -D railway`. The SDK provides `railway/iac`.
2. **Create the project:** `railway init` (name `master-gtm`), then create a `development` environment in the dashboard. `production` exists already.
3. **Connect GitHub:** install the Railway GitHub App on `gouravgujariya/master-gtm-repo`. Autodeploy needs a project member with contributor access.
4. **Set shared variables per environment.** In the dashboard, go to Project, then Shared Variables. Set these separately in each environment and never commit them:
   `SECRETS_MASTER_KEY` (`openssl rand -base64 32`, back it up), `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`,
   `ADATA_API_KEY`, `AI_ARK_API_KEY`, `COLDIQ_API_KEY`, `OPTIMAVERIFIER_API_KEY`, `PLUSVIBE_API_KEY`, `SERPER_API_KEY`.
   Both services reference them as `${{shared.X}}`. If a key is missing it resolves empty, and under `DEMO_MODE=auto` that job falls back to fixtures.
5. **Apply the infrastructure.** Run this once per environment:
   ```bash
   railway environment development && railway config plan && railway config apply
   railway environment production  && railway config plan && railway config apply
   ```
   Review the plan before you apply. An unexpected delete is a warning sign. This creates postgres, api, worker and the `worker-data` volume with the variables below.
6. **Add the public domain:** go to api, then Settings, then Networking, and click **Generate Domain**. Do this in each environment. Generated domains can't be declared in IaC. `CORS_ORIGIN` resolves to `https://${{RAILWAY_PUBLIC_DOMAIN}}` automatically.
7. **Turn on Wait for CI.** The IaC sets `checkSuites: true` on both services. The setting only appears after `.github/workflows/ci.yml` has run on a push. Once it's on, a deploy waits in `WAITING` until every GitHub Actions workflow on the commit passes, and is skipped if one fails.
8. **Create the first admin user.** The pod's `DATABASE_URL` is private (`*.railway.internal`), so run the command inside the service:
   ```bash
   railway ssh --service api -- npx tsx scripts/add-user.ts --email=you@x.com --password='...'
   ```
   Don't use `railway run npm run user:add`. It injects the private URL, which your laptop can't reach, and the script also requires a local `.env.development`.

Later infra changes: edit `.railway/railway.ts`, then run `railway config plan` and `railway config apply`. Code changes deploy on push. Watch patterns limit which paths trigger a deploy: `src/**`, `fixtures/**`, `package*.json`, plus `ui-prototype/**` for api and `skills/**` for worker.

## Variables (set by `.railway/railway.ts`)

| Var | api | worker | Value |
|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | `${{postgres.DATABASE_URL}}` (that environment's own DB) |
| `PORT` | injected | — | Railway sets it; don't set it yourself |
| `NODE_ENV` | ✓ | ✓ | `production` in both environments, so cookies are secure behind HTTPS |
| `RAILPACK_NODE_VERSION` | ✓ | ✓ | `24`, matching `.nvmrc` |
| `DEMO_MODE` | ✓ | ✓ | prod `off`, dev `auto` |
| `LLM_DAILY_BUDGET_USD` | ✓ | ✓ | prod `20`, dev `5` |
| `CORS_ORIGIN` | ✓ | — | `https://${{RAILWAY_PUBLIC_DOMAIN}}`; append the gtm-ui origin, comma-separated, when it ships |
| `STORAGE_DIR` | — | ✓ | `/data/files` (volume) |
| `BULK_DIR` | — | ✓ | `/data/bulk` (volume) |
| `WORKER_CONCURRENCY` | — | ✓ | `2` |
| keys (step 4) | ✓ | ✓ | `${{shared.*}}` |

## Files and bulk lists

A volume attaches to **one** service, and a service can have only one volume. Services with a volume
can't run replicas, and a redeploy causes brief downtime
([docs](https://docs.railway.com/reference/volumes)). The volume is mounted on the **worker**, because
the worker is the process that writes research markdown and reads the bulk CSVs. **The api must not
read from `STORAGE_DIR`.** Anything the api serves, such as the research markdown, has to come from
Postgres (the `files` table or `client_profiles.context_md`).

**Uploading the bulk lists** (`Common Outbound Lists/`, several GB). Hobby volumes are capped at 5 GB,
so this needs the **Pro** plan (50 GB). Resize the volume in the dashboard first. Then upload:
```bash
tar czf - "Common Outbound Lists" | railway ssh --service worker -- "mkdir -p /data/bulk && tar xzf - -C /data/bulk --strip-components=1"
```
I haven't verified that `railway ssh` accepts piped stdin. If the pipe fails, use `railway volume files` or scp over `railway ssh` instead. Volumes are per environment, so
upload once to each environment that needs real sourcing.

## CI (`.github/workflows/ci.yml`)

CI runs on every push and PR. It runs Node from `.nvmrc`, then `npm ci`, `npm run typecheck`, migrations against a Postgres 16 service container, and `npm test`. `DATABASE_URL` and `TEST_DATABASE_URL` both point at that container, and `DEMO_MODE=on` so CI never calls paid providers.

## Local dev (equivalent)

```bash
cp .env.example .env.development   # point DATABASE_URL at local Postgres (gtm_dev)
npm run db:migrate                 # = pre-deploy
npm run dev                        # api on :3000 + worker, both watching
npm run user:add -- --email=you@x.com --password=...
```
