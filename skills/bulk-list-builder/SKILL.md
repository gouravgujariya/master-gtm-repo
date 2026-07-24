---
name: bulk-list-builder
description: FIRST-PRIORITY list source. Query the local bulk datasets in `Common Outbound Lists/` (12M US businesses, 900K US SaaS/software companies, US ZIP codes) before any live scraping. Use whenever the user needs local US businesses or US software/SaaS companies by location/industry/size. Always try this BEFORE serper-local-list-builder, apify-list-builder, or ai-ark-companies.
scripts: TODO (see references/supabase-schema.md and the "Querying efficiently" section)
---

# Bulk List Builder

**Rule #1 of sourcing in this repo: check the bulk data first.** We already own ~1.8 GB of pre-scraped
US company data. It is free, instant, and already local. Only go to a paid live scrape (Serper, Apify)
or a database (AI Ark) if the bulk data can't satisfy the request.

## The datasets (in `Common Outbound Lists/`)

| Dataset | File(s) | Rows | Use for |
|---|---|---|---|
| **12M US businesses** | `Google Maps Scrape - 12M US Businesses/part1..13.csv` | ~12.3M | **Local businesses** (SMB, brick-and-mortar). Columns: `title, link, phone, category_titles, zip_code, normalized_display_link` |
| **900K US SaaS/software** | `us-software-saas-companies-cleaned.csv` | ~900K | **Software/SaaS sourcing.** 27 firmographic columns: `Domain, Company Name, LinkedIn Company URL, Industry, Country, Employee Headcount, Employee Size Range, Founded, Locality, Specialties, Annual Revenue, Total Funding Range, SubIndustry, Follower Count, ...` |
| **US ZIP codes** | `us-zip-codes.csv` | ~42.7K | Geographic driver: map a state/metro/city to its ZIPs (`zip, primary_city, state, timezone, area_codes, latitude, longitude, irs_estimated_population`) |

## Decision: which dataset

1. **Local / SMB / brick-and-mortar / by-category-and-location** (dentists in Texas, gyms in Miami, HVAC
   in the Midwest) → **12M businesses**. Filter by `category_titles` + join `zip_code` to `us-zip-codes.csv`
   for state/city/population targeting.
2. **Software / SaaS / tech companies (sourcing)** → **900K SaaS**. Ask the user for **location** and any
   firmographic filters (industry, headcount, funding, founded year), then return matching companies.
3. **Anything else** (non-US, niche B2B verticals not in these files, hiring signals, lookalikes) → this
   skill can't serve it; hand off to the right live source (see "Fallback order").

## Flow

1. **Confirm the request** against the ICP (`profiles/<client>/client-profile.yaml`) — titles come later
   (this step produces COMPANIES). Run the `icp-prompt-builder` qualification if filters are fuzzy.
2. **Pick the dataset** (above).
3. **Build the filter**: for local, translate the location to a ZIP set via `us-zip-codes.csv` (filter by
   `state` / `primary_city` / min `irs_estimated_population`); translate the vertical to `category_titles`
   match terms. For SaaS, translate to column filters on the 900K file.
4. **Query** (see "Querying efficiently") and write results to `profiles/<client>/lists/<campaign>-companies.csv`.
5. **Show the user a sample + count.** Ask: "Happy with this, or should I go live-scrape for more/fresher?"
6. **If satisfied → done.** The company list goes to `agenticdata-contacts` to find + verify decision-makers.
7. **If NOT satisfied → fallback** (below).

## Fallback order (only if bulk data is insufficient)

- **Local businesses:** bulk 12M → **Serper.dev** (`serper-local-list-builder`) → **Apify** (`apify-list-builder`).
- **SaaS/software:** bulk 900K → **AI Ark** (`ai-ark-companies`) → **Apify**.

Reasons to fall back: user wants fresher data, a vertical/geography thinly covered in the bulk files, or
richer fields (emails, tech stack, hiring signals) the bulk files don't carry.

## Querying efficiently (scripts = TODO, later milestone)

The 12M file is ~1.55 GB across 13 shards — do NOT load it into memory. Planned approaches, cheapest first:
- **DuckDB over the CSVs** (recommended): `SELECT ... FROM read_csv_auto('Common Outbound Lists/Google Maps Scrape - 12M US Businesses/*.csv') WHERE zip_code IN (...) AND lower(category_titles) LIKE '%dentist%'`. Handles 12M rows on a laptop in seconds, no import step.
- **Streaming filter** (`csv-parse` line stream) when DuckDB isn't available.
- **Supabase** (later): one-time load into indexed tables (`bulk_local_businesses`, `bulk_saas_companies`) so queries are instant and shareable. See `references/supabase-schema.md`.

Data caveats: `phone` is stored as a float (e.g. `12027276436.0`) — cast to clean string. `category_titles`
is a Python-list-style string (e.g. `['Government office']`) — parse before matching. Dedup by
`normalized_display_link` (local) or `Domain` (SaaS).

## Output contract

`profiles/<client>/lists/<campaign>-companies.csv` with at least: `company_name, domain, [location], [category/industry], [phone]`.
This is the input to `agenticdata-contacts` (find decision-makers + verified emails).
