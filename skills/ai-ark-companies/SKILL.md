---
name: ai-ark-companies
description: Primary tool for COMPANY sourcing and LOOKALIKE company discovery via AI Ark (ai-ark.com). Use to find companies matching an ICP, and especially to build lookalike lists seeded from a client's existing customers/case studies. Also the fallback for finding decision-makers + emails when AgenticData can't (only on user request). Prefer bulk-list-builder first for US SaaS/local; use AI Ark for lookalikes, non-bulk verticals, and richer company discovery.
scripts: TODO (API-key script — see references/ai-ark-api.md)
---

# AI Ark — Company Sourcing & Lookalikes

**AI Ark leads company discovery.** Its standout capability is **native lookalike** company generation:
give it seed companies and it returns similar ones. That is the backbone of the Lookalike campaign type
in `campaign-strategy`.

> **Stack note:** AI Ark = `ai-ark.com`. Default for company sourcing + lookalikes. Runs as an API-key
> script (`references/ai-ark-api.md`). For US SaaS/local, try `bulk-list-builder` FIRST; come here for
> lookalikes, verticals thin in the bulk data, or when the user asks AI Ark to also find contacts/emails.

## Three jobs AI Ark does here

1. **Company sourcing** — find companies matching an ICP (industry, size, geo, keywords).
2. **Lookalike discovery** (its best use) — seed with a client's best customers → get similar companies.
3. **Contact + email finding (fallback only)** — AI Ark can find decision-makers and emails, but that is
   the job of `agenticdata-contacts` by default. Use AI Ark for it **only when the user explicitly asks**
   or AgenticData came up empty.

## Lookalike flow (the important one — per client)

Lookalikes are built per client from the client's own proof, NOT from a static list:

1. **Research the client's website** with `firecrawl-enrich`: crawl the homepage + all subpages, especially
   **Customers / Case Studies / Testimonials**. Extract every named customer company.
2. **Add the client questionnaire** (`profiles/<client>/questionnaire.md`) — their described best-fit
   customers, target verticals, dream accounts.
3. **Assemble the seed set** = case-study companies + questionnaire dream accounts + any customer CSV.
4. **Feed the seed to AI Ark's lookalike** → get similar companies at scale.
5. **Qualify** the output against `client-profile.yaml` (run `icp-prompt-builder` if fuzzy).
6. **Write** to `profiles/<client>/lists/<campaign>-companies.csv` → hand to `agenticdata-contacts`.

This is exactly Eric's `campaign-strategy` "Deep Research Protocol + Lookalike campaign", now powered by
FireCrawl (research) + AI Ark (lookalike generation).

## Sourcing flow (non-lookalike)

1. Translate the ICP into AI Ark filters (see `references/ai-ark-api.md` for the filter schema).
2. Pull companies, paginate, dedup by domain.
3. Qualify + write to the list CSV.

## When NOT to use AI Ark

- US local businesses or US SaaS that the bulk files already cover → `bulk-list-builder` first.
- Hiring/LinkedIn/review-scraping signals → `apify-list-builder`.
- Finding + verifying the actual people/emails → `agenticdata-contacts` (AI Ark is only the fallback).

## Output contract

`profiles/<client>/lists/<campaign>-companies.csv` — `company_name, domain, [industry], [size], [location], [lookalike_seed]`.
Feeds `agenticdata-contacts`.
