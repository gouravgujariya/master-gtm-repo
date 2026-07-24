-- ============================================================
-- GTM sample: create a `contacts` table + load the sample rows.
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste ALL of this → Run.
-- Then open Table Editor → contacts to preview it as a spreadsheet grid.
-- ============================================================

create table if not exists contacts (
  id            bigint generated always as identity primary key,
  client        text not null,          -- WHICH client this contact belongs to (agency model)
  segment       text,                   -- e.g. fintech-saas
  target_market text,                   -- e.g. US
  company_size  text,                   -- e.g. 201-500
  list_source   text,                   -- e.g. ai-ark-lookalike, bulk-saas, apify-hiring
  email         text,
  first_name    text,
  last_name     text,
  company_name  text,
  company_domain text,
  title         text,
  linkedin_url  text,
  email_status  text,                   -- valid | catch-all | invalid | unknown
  sendable      boolean,
  find_source   text,                   -- agenticdata | ai-ark | coldiq
  created_at    timestamptz default now()
);

insert into contacts
  (client, segment, target_market, company_size, list_source, email, first_name, last_name, company_name, company_domain, title, linkedin_url, email_status, sendable, find_source)
values
  ('acme-co','fintech-saas','US','201-500','ai-ark-lookalike','sdoyle@figma.com','Shannon','Doyle','Figma','figma.com','Enterprise Growth','https://www.linkedin.com/in/shannondoyle913','valid',true,'ai-ark'),
  ('acme-co','fintech-saas','US','201-500','ai-ark-lookalike','nate.parry@gusto.com','Nathan','Parry','Gusto','gusto.com','Business Analytics','https://www.linkedin.com/in/nathanparry','valid',true,'coldiq'),
  ('acme-co','fintech-saas','US','201-500','ai-ark-lookalike','nithin@stripe.com','Nithin','Chandy','Stripe','stripe.com','Software Engineer','https://www.linkedin.com/in/nithinchandy','catch-all',false,'agenticdata'),
  ('acme-co','fintech-saas','US','201-500','ai-ark-lookalike','huashuai@stripe.com','Huashuai','Qu','Stripe','stripe.com','Data Scientist','https://www.linkedin.com/in/huashuai','invalid',false,'agenticdata');

-- Try these in the SQL Editor after loading:
--   select * from contacts where sendable = true;                       -- only the good ones
--   select client, count(*) from contacts group by client;             -- per-client counts
--   select email_status, count(*) from contacts group by email_status; -- verification breakdown
