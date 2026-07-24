---
name: serper-local-list-builder
description: Scrape local businesses via Serper.dev (Google Search/Maps/Places API). Use for fresh local/SMB lists by category + location when the bulk 12M dataset is insufficient. Fallback under bulk-list-builder for local businesses; a lighter alternative to the Apify Google Maps actor.
scripts: TODO (API-key script — see references/serper-api.md)
---

# Serper.dev Local List Builder

Serper.dev is a fast, cheap Google Search / Maps / Places API. Use it to pull **fresh local business
listings** by category and location.

> **Stack note:** Serper.dev = `serper.dev` (NOT SerpApi). API-key script (`references/serper-api.md`).
> This is the **second** choice for local businesses, after `bulk-list-builder` (the 12M dataset). Use it
> when the user wants fresher data or a category/geo the bulk file covers thinly.

## When to use

- Local / SMB targeting by "what + where" (e.g. "roofers in Phoenix", "med spas in NYC").
- The 12M bulk dataset returned too few, stale, or off-target results.
- You want a lighter/cheaper pull than spinning up an Apify actor.

## Flow

1. Confirm the ICP + vertical + geography. Use `Common Outbound Lists/us-zip-codes.csv` to expand a state
   or metro into cities/ZIPs to iterate.
2. For each location, query the Serper **Places/Maps** endpoint with the category term
   (see `references/serper-api.md` for endpoints + params).
3. Paginate, collect results, dedup by place/domain.
4. Normalize to standard columns: `company_name, domain(website), phone, address, city, state, category, rating, reviews_count`.
5. Write to `profiles/<client>/lists/<campaign>-companies.csv`.
6. Hand off to `agenticdata-contacts` to find + verify decision-makers and emails.

## Notes

- Rate-limit politely and retry on 429/5xx with backoff.
- Serper returns website + phone but **no decision-maker contacts** — email finding is always AgenticData's job.
- If you need richer or non-Maps scraping (job posts, LinkedIn, directories), use `apify-list-builder` instead.

## Output contract

Standard company list CSV in `profiles/<client>/lists/`. Feeds `agenticdata-contacts`.
