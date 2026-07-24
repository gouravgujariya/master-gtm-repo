-- ============================================================
-- GTM `contacts` table — the system of record for verified contacts.
-- RUN ONCE: Supabase dashboard → SQL Editor → New query → paste ALL → Run.
-- (Table/DDL creation can't be done with the API key, so this one-time paste is required.)
-- ============================================================

create table if not exists contacts (
  id             bigint generated always as identity primary key,
  client         text not null,          -- agency model: which client this belongs to
  segment        text,                   -- e.g. fintech-saas
  target_market  text,                   -- e.g. US
  company_size   text,                   -- e.g. 201-500
  list_source    text,                   -- ai-ark-lookalike | bulk-saas | apify-hiring | serper-local
  email          text,
  first_name     text,
  last_name      text,
  company_name   text,
  company_domain text,
  title          text,
  linkedin_url   text,
  email_status   text,                   -- valid | catch-all | invalid | unknown
  sendable       boolean,
  find_source    text,                   -- agenticdata | ai-ark | coldiq
  verify_note    text,
  created_at     timestamptz default now(),
  -- lets the push script UPSERT (update instead of duplicate) on re-runs:
  unique (client, email)
);

-- handy filtered views once data is in:
--   select * from contacts where client = 'acme-co' and sendable = true;
--   select list_source, count(*) from contacts group by list_source;
