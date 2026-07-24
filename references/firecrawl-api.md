# FireCrawl — API / MCP Reference

- **Role:** website fetch + crawl + extract (client research, case-study extraction, personalization). Used by `firecrawl-enrich`.
- **Integration:** **MCP preferred**, REST API fallback.
- **Env var (script fallback):** `FIRECRAWL_API_KEY` (`fc-…`).
- **Base URL (REST):** `https://api.firecrawl.dev`
- **Auth:** `Authorization: Bearer fc-...`

## MCP (preferred)
FireCrawl's MCP server exposes scrape / crawl / map / extract tools — call directly, no script. Best for
interactive client research where Claude reads pages and reasons over them.

## REST endpoints (fallback)
| Action | Endpoint | Use |
|---|---|---|
| Scrape one URL | `POST /v1/scrape` | Single page → markdown/structured content |
| Crawl a site | `POST /v1/crawl` (async) → `GET /v1/crawl/{id}` | Whole site (homepage + subpages) |
| Map a site | `POST /v1/map` | List all URLs on a domain (find /customers, /case-studies fast) |
| Extract | `POST /v1/extract` | LLM-structured extraction against a schema |

### Scrape body
```json
{ "url": "https://example.com/customers", "formats": ["markdown"] }
```

## Flow (client deep research → lookalike seeds)
1. `map` the client domain → find Customers / Case Studies / Testimonials URLs.
2. `scrape`/`crawl` those pages → markdown.
3. Extract named customer companies + industry/size/metrics → `profiles/<client>/lists/lookalike-seeds.csv`.
4. Feed seeds to `ai-ark-companies` (lookalike); research to `campaign-strategy`.

## Notes
- Public data only (matches strategy rules). Cache pages per run; polite rate limits.
- **Open Web Ninja** (`openwebninja-api.md`) is the optional side-by-side source for news/PR signals.
