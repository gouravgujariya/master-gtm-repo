# Apify — API / MCP Reference

- **Role:** strategy-driven scraping (hiring, LinkedIn, Google Maps, reviews, directories). Used by `apify-list-builder`.
- **Integration:** **MCP preferred** (Apify MCP server), REST API as fallback.
- **Env var (script fallback):** `APIFY_TOKEN`.
- **Base URL (REST):** `https://api.apify.com/v2`

## Core concept: actors
Apify is a marketplace of **actors** (pre-built scrapers). You pick an actor by `actor_id` (e.g.
`apify/google-maps-scraper`, LinkedIn jobs/profile scrapers, etc.), pass its input JSON, run it, and read
the resulting dataset. There is no single endpoint — the actor choice IS the scraping strategy.

## MCP (preferred)
The Apify MCP server exposes actor discovery + run tools. Search the store for the right actor for the
campaign signal, run it with inputs, and fetch the dataset — no script required.

## REST API (fallback) — key endpoints
| Action | Endpoint |
|---|---|
| Run an actor (sync, small) | `POST /acts/{actorId}/run-sync-get-dataset-items?token=…` |
| Run an actor (async) | `POST /acts/{actorId}/runs?token=…` → returns runId |
| Poll run status | `GET /actor-runs/{runId}?token=…` |
| Fetch dataset items | `GET /datasets/{datasetId}/items?token=…&format=json` |

Auth: token via `?token=` query param or `Authorization: Bearer <APIFY_TOKEN>`.

## Common actors by campaign strategy
- **Google Maps / local:** `compass/crawler-google-places` or `apify/google-maps-scraper`.
- **Hiring signal / jobs:** LinkedIn Jobs / Indeed job-post actors.
- **LinkedIn people / new-hire:** LinkedIn profile/people actors (flag ToS risk to the user).
- **Post engagement / competitor engagers:** LinkedIn post-reactions/comments actors.
Confirm the exact actor id + input schema in the Apify store per run; record it for repeatability.

## Notes
- Bills by compute + results — cap `maxItems`, run a small test first.
- Normalize actor output to the standard company/contact columns; dedup.
- ToS/legal: prefer signal-rich targeted pulls over bulk profile dumps.
