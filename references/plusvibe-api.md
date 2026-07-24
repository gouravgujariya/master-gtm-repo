# Plusvibe — API Reference (DEFAULT sending platform)

- **Role:** DEFAULT email sending platform. Used by `campaign-upload`, `positive-reply-scoring`, `email-deliverability-audit`.
- **Integration:** API-key script.
- **Env var:** `PLUSVIBE_API_KEY`.
- **Base URL:** _confirm from Plusvibe dashboard → API/Settings._
- **Auth:** _confirm (Bearer header or `?api_key=`)._

> ⚠️ **Verify with live key.** The exact base URL, auth style, and routes below must be confirmed against
> Plusvibe's own API docs / dashboard once the key is in `.env`. This doc defines WHAT the scripts must do;
> fill in the exact endpoints during the script-building milestone. Plusvibe's API is broadly Smartlead/
> Instantly-shaped (campaigns → sequences → email accounts → leads → schedule), so `smartlead-api.md` and
> Eric's `upload.ts` are the closest porting reference.

## Operations the scripts need (map each to a Plusvibe endpoint)
| Capability | Used by | Confirm endpoint |
|---|---|---|
| Create campaign (DRAFT) | campaign-upload | ▢ |
| Add email sequence with A/B/C variants | campaign-upload | ▢ |
| List email accounts / inboxes (+ health, daily sent) | campaign-upload, deliverability-audit | ▢ |
| Attach inboxes to campaign (tag=active, LRU by daily-sent) | campaign-upload | ▢ |
| Add leads (batched) + custom fields | campaign-upload | ▢ |
| Set campaign settings (stop-on-reply, tracking) | campaign-upload | ▢ |
| Set schedule (tz, days, hours, caps) | campaign-upload | ▢ |
| Pull campaign analytics (sent/reply/bounce) | deliverability-audit, scoring | ▢ |
| Pull replies (for classification) | positive-reply-scoring | ▢ |

## Rules (platform-independent)
- **Always create as DRAFT** — a human hits Start.
- Verified emails only (enforced upstream by `agenticdata-contacts`).
- Volume caps: 30/inbox/day post-warmup; respect the schedule's max leads/day.
- Sanitize em/en-dashes in copy before upload (spam flag).

## Inbox source
Inboxes are provisioned + warmed in **Inboxkit / Maildoso** and exported into Plusvibe (see
`inboxkit-api.md`, `maildoso-api.md`, `inbox-infrastructure` skill).
