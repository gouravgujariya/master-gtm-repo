---
name: firecrawl-enrich
description: Website fetching, crawling, and enrichment via FireCrawl. Use to read a company's website (homepage + subpages), extract case studies/customers for lookalike seeding, pull personalization data points, and power the campaign-strategy Deep Research Protocol. Open Web Ninja is an optional side-by-side source for news/blog enrichment.
scripts: MCP (FireCrawl MCP preferred; API fallback — see references/firecrawl-api.md). Open Web Ninja = API-key script.
---

# FireCrawl — Website Fetch & Enrichment

**FireCrawl is how this repo reads the web.** It replaces Eric's raw `fetch` + HTML-stripping scripts with
a clean crawler that returns readable content (markdown/structured), so Claude can research and personalize.

> **Stack note:** FireCrawl wired via **MCP** (preferred), API fallback (`references/firecrawl-api.md`).
> **Open Web Ninja** (`references/openwebninja-api.md`) is an optional side-by-side source for company
> news/blog signals. Default web-fetch = FireCrawl.

## Primary uses

1. **Client deep research (for lookalikes + strategy)** — crawl the client's own site: homepage, and all
   subpages, prioritizing **Customers / Case Studies / Testimonials / About / Pricing / Blog**. Extract
   every named customer → seeds for `ai-ark-companies` lookalikes. This powers `campaign-strategy`'s Deep
   Research Protocol and `icp-onboarding`'s website scrape.
2. **Prospect personalization** — for a target company, fetch its homepage/relevant pages to pull the
   specific data points a great rep would use (their positioning, product, recent launches, unusual job
   titles) to write the "Creative Ideas" opener and AI variables.
3. **Enrichment columns** — resolve a company's real domain, one-line description, industry, and any public
   signal the campaign needs. News/PR signals can come from Open Web Ninja alongside FireCrawl.

## Flow (client research)

1. Input: the client's website URL (and any competitor/reference URLs).
2. Crawl homepage → follow real nav links (don't guess URLs). Prioritize the customer/case-study pages.
3. Extract: value prop, positioning, real ICP, differentiators, quantified outcomes, and the **full list of
   named customers** with any industry/size/metric per case study.
4. Write research to `profiles/<client>/research/website-research.md` and the case-study seed list to
   `profiles/<client>/lists/lookalike-seeds.csv`.
5. Feed seeds to `ai-ark-companies` (lookalike) and the research to `campaign-strategy` / `campaign-copywriting`.

## Flow (company + persona personalization — the DEFAULT, at scale)

This produces the **company-level AI line** the master repo requires by default (see
`docs/campaign-workflow-rules.md`):

- Use `personalization-subagent-pattern`: fan out one Claude sub-agent per lead. Each one:
  1. FireCrawl-scrapes that prospect's domain (homepage + a relevant subpage).
  2. Extracts ONE specific, true, public fact about their business.
  3. Writes a single natural opening line for the email — `{{ai_company_context}}` — that references that
     fact and ties it to the offer, angled for the **pinned persona** (an Ops leader vs a Marketing leader
     get different framings of the same product).
- Output: the contacts CSV gains an `ai_company_context` column (+ any `{{ai_*}}` variables). Feed to
  `campaign-copywriting`, which uses it as the situation/first line.
- **Public data only** (website, public news). Keep the line honest and specific — no fabricated claims.

## Rules

- **Public data only** — website content, public news/PR, public social. No protected review sites, no
  private/proprietary data (matches `campaign-strategy` constraints).
- Cache fetched pages per run to avoid re-crawling; be polite with rate limits.

## Output contract

- `profiles/<client>/research/website-research.md`
- `profiles/<client>/lists/lookalike-seeds.csv`
- Personalization variables merged into the contacts CSV for `campaign-copywriting` / `campaign-upload`.
