# Smartlead — API Reference (ALTERNATIVE sending platform)

- **Role:** alternative sending platform (default is Plusvibe). Used by `campaign-upload`, `positive-reply-scoring`, `email-deliverability-audit` when the user is on Smartlead.
- **Integration:** API-key script.
- **Env var:** `SMARTLEAD_API_KEY`.
- **Base URL:** `https://server.smartlead.ai/api/v1`
- **Auth:** **query param** `?api_key=<SMARTLEAD_API_KEY>` (not a header).
- **Rate limits:** ~2,000-3,000 req/min; retry 429/5xx with backoff; concurrency ~8-15.

## Key endpoints (from Eric's proven usage)
| Action | Endpoint |
|---|---|
| Create campaign | `POST /campaigns/create` |
| Save sequence (A/B/C) | `POST /campaigns/{id}/sequences` (`seq_variants`) |
| List email accounts | `GET /email-accounts` (paginated) |
| Attach inboxes | `POST /campaigns/{id}/email-accounts` |
| Add leads (batch 100) | `POST /campaigns/{id}/leads` |
| Settings | `POST /campaigns/{id}/settings` |
| Schedule | `POST /campaigns/{id}/schedule` |
| Analytics | `GET /campaigns/{id}/analytics` |
| Replies (master inbox) | `GET /campaigns/{id}/replies` (confirm route) |

## Upload flow (DRAFT, from `smartlead-campaign-upload-public/upload.ts` — porting reference)
create → sequences (sanitize dashes) → GET email-accounts (filter tag+healthy, sort daily_sent ASC/LRU,
attach top-N) → add leads in batches of 100 (extras → `custom_fields`) → settings → schedule → **leave DRAFT**.

## Notes
- Always DRAFT; a human hits Start.
- Sub-client pattern via `client_id`.
- This doc is retained because Smartlead is the supported alternative; **Plusvibe is the default** (see `plusvibe-api.md`).
