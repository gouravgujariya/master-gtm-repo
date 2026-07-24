# Supabase — Data Model / Schema Reference

- **Role:** system of record for companies, contacts, campaigns, sends, replies, and the bulk lists.
- **Integration:** Supabase JS client (or REST/`postgrest`) in scripts; Postgres under the hood.
- **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side scripts), `SUPABASE_ANON_KEY` (read).
- **Status:** project exists but is **empty** — this schema is designed here and CREATED in a later milestone.

## Multi-client (agency) model
Every row is scoped by `client_id`. `clients` is the top table; profiles on disk
(`profiles/<slug>/`) mirror a `clients` row.

## Proposed tables
```
clients            (id, slug, name, website, created_at)
client_profiles    (client_id, icp jsonb, offer jsonb, questionnaire text, updated_at)

companies          (id, client_id, domain, name, industry, size_range, location,
                    source enum[bulk|ai_ark|apify|serper|manual], lookalike_seed bool, raw jsonb)
contacts           (id, client_id, company_id, first_name, last_name, title, linkedin_url,
                    email, email_status enum[verified|accept_all|invalid|unknown],
                    source enum[agenticdata|ai_ark|apify], enriched jsonb)

campaigns          (id, client_id, name, platform enum[plusvibe|smartlead], platform_campaign_id,
                    status enum[draft|active|paused|done], variants jsonb, schedule jsonb, created_at)
campaign_leads     (campaign_id, contact_id, added_at)
sends              (id, campaign_id, contact_id, inbox, step, sent_at)
replies            (id, campaign_id, contact_id, body, classification
                    enum[positive_interested|neutral|negative|ooo|bounce|unsub], scored_at)

experiments        (id, client_id, campaign_id, variable, result jsonb, day21_at)

-- bulk data (optional load; DuckDB-over-CSV is fine until scale demands this)
bulk_local_businesses (title, domain, phone, category, zip, state, city)   -- from 12M Maps scrape
bulk_saas_companies   (domain, name, industry, size_range, hq, founded, funding, ...) -- from 900K file
```

## Indexes (when created)
- `companies(client_id, domain)`, `contacts(client_id, email)`, `campaign_leads(campaign_id)`.
- `bulk_local_businesses(zip)`, `bulk_local_businesses(category)`, `bulk_saas_companies(industry)`,
  `bulk_saas_companies(hq/state)` — so bulk queries are instant.

## Notes
- Until the bulk tables are loaded, `bulk-list-builder` queries the CSVs directly via DuckDB.
- `contacts.email_status` gates upload — only verified/accept_all (per risk tolerance) get sent.
- Confirm final column types when we build the migration; keep `raw`/`enriched` jsonb for provider payloads.
