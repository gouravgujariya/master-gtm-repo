# Supabase for GTM — a beginner's guide

You have no Supabase experience — this explains what it is, the 4 parts you'll actually use, how to
**preview** data, and the **file-naming convention** for GTM lists.

## What Supabase is (in one line)
Supabase = a **hosted database (Postgres) + file storage + auto-generated API**, all behind a web
dashboard. Think of it as "a spreadsheet-grade database + a Google-Drive-style file store + a built-in
API", so our scripts and your team share one source of truth.

Your project: `pwquvcpgwwicdsqsuppa` → dashboard: https://supabase.com/dashboard/project/pwquvcpgwwicdsqsuppa

## The 4 parts you'll use for GTM

| Part | What it is | Use it for | Where in dashboard |
|---|---|---|---|
| **Table Editor** | Spreadsheet-like grid of database tables | The real system of record: `companies`, `contacts`, `campaigns`. Sort/filter/preview like Excel. | left sidebar → Table Editor |
| **Storage** | File buckets (like Drive folders) | Raw list snapshots, CSV exports, client docs. Each file gets a shareable link. | left sidebar → Storage |
| **SQL Editor** | Run SQL commands | Create tables, load data, run reports. Paste a snippet → Run. | left sidebar → SQL Editor |
| **API keys** | Auto-generated REST API + keys | How our `.ts` scripts read/write data. | Settings → API |

### Two ways to hold GTM data — and when to use each
- **Tables (Table Editor)** → structured records you filter/sort/query. **This is where contacts & companies live.** Best for "show me all sendable contacts for Acme in fintech".
- **Storage (files)** → whole files (a CSV list snapshot, a PDF). Best for "keep the exact list we uploaded on 2026-07-24" or sharing a file link.

## How to PREVIEW data (your question)

**CSV files in Storage don't render as a grid** — Supabase only previews images/PDF inline. Two options:
1. **Preview the file text in-browser:** we now upload list files as `text/plain`, so the **public link opens the CSV right in your browser** (no download). Good for a quick look.
2. **Preview as a real spreadsheet grid (recommended):** load the data into a **table**, then open **Table Editor** → it shows a sortable, filterable grid — the closest thing to Excel inside Supabase.
   - One-time: SQL Editor → paste `supabase/contacts-sample.sql` → Run → open Table Editor → `contacts`.

So: **Storage = keep the file; Tables = preview & work with the data.**

## File-naming convention (every file is tagged & self-describing)

Files uploaded via `npm run supabase-upload` follow:
```
{client}__{segment}__{market}__{size}__{source}__{YYYY-MM-DD}.csv
```
stored under a per-client folder: `gtm-lists/{client}/…`

Example:
```
gtm-lists/acme-co/acme-co__fintech-saas__us__201-500__ai-ark-lookalike__2026-07-24.csv
```
- **client** — which client the list is for (required; agency model)
- **segment** — e.g. `fintech-saas`
- **market** — e.g. `us`
- **size** — headcount band, e.g. `201-500`
- **source** — where it came from, e.g. `ai-ark-lookalike`, `bulk-saas`, `apify-hiring`, `serper-local`
- **date** — when it was built

Upload command:
```
npm run supabase-upload -- --file=list.csv --client="Acme Co" --segment="fintech-saas" \
  --market="US" --size="201-500" --source="ai-ark-lookalike"
```
In **tables**, the same info lives as columns (`client`, `segment`, `target_market`, `company_size`,
`list_source`) so you can filter instead of reading filenames.

## API keys (important, was mislabeled)
- `sb_secret_…` = **service-role / admin key** → full read+write, server-side scripts only. **Never expose.**
- `sb_publishable_…` = **public/anon key** → limited, safe for browsers.
- In `.env`: `SUPABASE_SERVICE_ROLE_KEY` = the `sb_secret_…` one; `SUPABASE_ANON_KEY` = the `sb_publishable_…` one. (These were swapped and are now fixed.)

## Security note — Row Level Security (RLS)
New tables are open to the service key but you should keep the **anon** key locked down. For our
server-side scripts (using the secret key) this doesn't block us. When you later expose data to a
browser app, enable **RLS** on each table and add policies. Not needed for the current script-based flow.

## What our scripts do with Supabase
- `scripts/supabase-upload.ts` — push a list file to Storage with the naming convention → shareable link.
- (next) write verified `contacts` + sourced `companies` straight into **tables** so the pipeline persists
  automatically. Schema in `references/supabase-schema.md`; sample loader in `supabase/contacts-sample.sql`.

## Quick tour checklist (do this once)
1. Open the dashboard link above.
2. **Storage → gtm-lists → acme-co** → click the file → the panel shows it; the public link previews in-browser.
3. **SQL Editor → New query** → paste `supabase/contacts-sample.sql` → **Run**.
4. **Table Editor → contacts** → sort/filter the grid. That's your data preview.
