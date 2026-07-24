# Serper.dev — API Reference

- **Role:** fresh local-business scraping (Google Search / Maps / Places). Used by `serper-local-list-builder`.
- **Integration:** API-key script.
- **Env var:** `SERPER_API_KEY`.
- **Base URL:** `https://google.serper.dev`
- **Auth:** header `X-API-KEY: <SERPER_API_KEY>`, `Content-Type: application/json`.
- **NOTE:** this is **Serper.dev**, NOT SerpApi — different product.

## Endpoints (POST, JSON body)
| Endpoint | Use |
|---|---|
| `POST /places` | Local business/Maps results (name, address, phone, website, rating, ratingCount, category) — **primary for local lists** |
| `POST /maps` | Maps results (similar, with lat/lng) |
| `POST /search` | Standard Google web search (org discovery, directories) |

### Example body
```json
{ "q": "roofers in Phoenix AZ", "gl": "us", "hl": "en", "num": 20, "page": 1 }
```

## Flow for local lists
1. Expand target geography into cities/ZIPs via `Common Outbound Lists/us-zip-codes.csv`.
2. For each location, `POST /places` with `"{category} in {city} {state}"`; paginate `page`.
3. Collect `name, website, phone, address, city, state, category, rating, ratingCount`.
4. Dedup by website/domain (or name+address). Normalize to the company list schema.

## Notes
- Cheap + fast; rate-limit politely, retry 429/5xx with backoff.
- Returns businesses, NOT decision-makers — emails always go through AgenticData.
- Confirm exact response field names against Serper docs when scripting (fields above are the documented shape).
