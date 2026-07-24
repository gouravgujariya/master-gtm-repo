# Open Web Ninja — API Reference (optional news/enrichment)

- **Role:** OPTIONAL side-by-side enrichment for company news/PR/blog signals, alongside FireCrawl. Used by `firecrawl-enrich`.
- **Integration:** API-key script.
- **Env var:** `OPENWEBNINJA_KEY`.
- **Access:** historically offered via RapidAPI (`openweb-ninja.p.rapidapi.com`) and/or direct.
- **Base URL / auth:** _confirm from your Open Web Ninja / RapidAPI subscription._

> ⚠️ **Verify with live key.** Confirm host, headers (`X-RapidAPI-Key`/`X-RapidAPI-Host` if via RapidAPI),
> and endpoints against your subscription. Optional — only wire if the user wants news-based personalization.

## Capabilities the scripts need
| Capability | Purpose | Confirm |
|---|---|---|
| Company news / recent events | personalization lines ("saw you launched X") | ▢ |
| Web/Google search enrichment | fill firmographic/context gaps | ▢ |

## Notes
- FireCrawl is the primary web-fetch tool; Open Web Ninja is complementary for fresh news/PR.
- Public data only. Keep personalization honest and specific.
