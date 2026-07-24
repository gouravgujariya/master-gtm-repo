---
name: apify-list-builder
description: Strategy-driven scraping via Apify. Use for scraping use cases the bulk data and AI Ark don't cover — companies hiring on LinkedIn, LinkedIn people/company data, Google Maps local businesses (fresh), reviews, directories, and more. Apify has many actors; pick the actor that fits the campaign strategy. Default scraping tool; try bulk-list-builder first for US local/SaaS.
scripts: TODO (MCP-first — Apify MCP; API/actor fallback — see references/apify-api.md)
---

# Apify List Builder

**Apify is the scraping workhorse, and it is strategy-driven.** There is no single "Apify job" — Apify is
a marketplace of thousands of *actors* (pre-built scrapers). The right actor depends entirely on the
campaign strategy you're running. Your job: read the strategy, pick the actor, run it, normalize output.

> **Stack note:** Apify is wired via **MCP** (preferred) with the API/actor calls as fallback
> (`references/apify-api.md`). It's the default scraping tool. For US local/SaaS that the bulk files
> already cover, use `bulk-list-builder` FIRST — come to Apify for fresh data, signals, and verticals
> the bulk files miss.

## Match the actor to the strategy (examples)

| Campaign strategy | What to scrape | Typical Apify actor category |
|---|---|---|
| **Companies hiring** (buying-intent signal) | LinkedIn / job-board postings for a role | LinkedIn Jobs / Indeed / job-post scrapers |
| **New-hire campaign** | People who recently started a target role | LinkedIn people / profile scrapers |
| **Local businesses (fresh)** | Google Maps by query + location | Google Maps scraper |
| **Competitor engagers** | People engaging with a competitor's LinkedIn posts | LinkedIn post-engagement scrapers |
| **Directory / association** | Members of an industry directory | Website / list crawlers |
| **Reviews / ratings** | Businesses by review count or rating | Google Maps / review scrapers |

If you're unsure which actor, ask the user or check the Apify store for the target site; document the
chosen actor id in the run so it's repeatable.

## Flow

1. **Read the campaign strategy** (`profiles/<client>/campaign-strategy.md`) to know the signal being
   targeted, and confirm the ICP (`client-profile.yaml`).
2. **Pick the actor** that produces that signal (table above). Note its input schema.
3. **Build inputs** — search terms, locations (use `Common Outbound Lists/us-zip-codes.csv` to iterate
   geography), role keywords, result caps.
4. **Run** via the Apify MCP (preferred) or the actor run API; poll to completion; fetch the dataset.
5. **Normalize** to the standard company/contact columns; dedup.
6. **Write** to `profiles/<client>/lists/<campaign>-companies.csv` (or `-contacts.csv` if the actor already
   returns people).
7. **Enrich to contacts**: if the actor returned companies only, hand off to `agenticdata-contacts` to find
   + verify decision-makers. If it returned people without verified emails, still route emails through
   AgenticData for verification.

## Guardrails

- **Respect ToS + law.** LinkedIn scraping carries ToS risk — flag it to the user, keep volumes sane, and
  prefer signal (hiring, engagement) over bulk profile dumps.
- **Cost:** actors bill by compute/results. Cap results, run a small test first, confirm the actor before a
  large run.
- **Freshness beats size:** the point of Apify over the bulk files is *fresh, signal-rich* data — target
  tight, intent-heavy lists, not the biggest possible dump.

## Output contract

Standard list CSV in `profiles/<client>/lists/`. Companies → `agenticdata-contacts`. People → verify emails
via AgenticData before upload.
