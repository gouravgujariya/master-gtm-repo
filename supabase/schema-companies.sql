-- ============================================================
-- GTM `companies` table — sourced companies (before contacts are found).
-- RUN ONCE: Supabase dashboard → SQL Editor → New query → paste ALL → Run.
-- ============================================================

create table if not exists companies (
  id            bigint generated always as identity primary key,
  client        text not null,          -- which client this list is for
  segment       text,                   -- e.g. fintech-saas
  target_market text,                   -- e.g. US
  list_source   text,                   -- bulk-saas | bulk-local | ai-ark-lookalike | apify-hiring | serper-local
  company_name  text,
  domain        text,
  industry      text,
  company_size  text,
  location      text,
  linkedin_url  text,
  phone         text,
  created_at    timestamptz default now(),
  unique (client, domain)               -- lets the push UPSERT on re-runs
);

-- example:  select list_source, count(*) from companies where client='acme-co' group by list_source;
