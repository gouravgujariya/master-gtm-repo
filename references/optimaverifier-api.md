# OptimaVerifier — API Reference (PRIMARY email verification)

- **Role:** PRIMARY email verification. Every email is gated through here before upload. Used by `agenticdata-contacts`.
- **Env var:** `OPTIMAVERIFIER_API_KEY` (`sk_live_…`)
- **Base URL:** `https://app.optimaverifier.com/api/v1`
- **Auth:** `Authorization: Bearer <OPTIMAVERIFIER_API_KEY>`, `Content-Type: application/json`
- **Docs:** https://app.optimaverifier.com/docs

## Status values (the gate)
| status | meaning | default action |
|---|---|---|
| `valid` | mailbox exists & accepts mail | ✅ SEND |
| `invalid` | mailbox/domain bad | ❌ DROP |
| `catch-all` | domain accepts everything; mailbox indeterminate | ⚠️ per policy (confirm with user) |
| `unknown` | server gave no definitive answer in time | ⚠️ hold / re-verify (confirm with user) |

## Endpoints
| Action | Method + path | Notes |
|---|---|---|
| Single verify | `POST /verifications/single` | body `{"email":"a@b.com"}` → `status`, `verified_at`, `credits_remaining`. ~800ms. **15 req/min**, 1 credit each. |
| Bulk verify (JSON) | `POST /verifications/bulk` | body `emails[]` (≤1,000,000), `job_name` (1-255), optional `row_metadata`, `extra_columns`. → job id, `status:"queued"`. **1 credit per UNIQUE email.** |
| Bulk verify (file) | `POST /verifications/bulk/upload` | form: `.txt` (one email/line) + `job_name`. ≤~200MB. |
| Poll job | `GET /verifications/job/{job_id}` | `status` queued/processing/completed, `progress_percentage`, per-status counts. Free. |
| Read results | `GET /verifications/job/{job_id}/results?page=&per_page=&status_filter=` | per_page max 100. |
| Export CSV | `GET /verifications/job/{job_id}/export?format=csv` | results retained 30 days. |
| History | `GET /verifications/history?page=&per_page=` | |
| Credit balance | `GET /credits` | `balance` + recent ledger. Free. |

Status codes: 200 ok, 401 bad key, 422 bad email, 429 rate-limited.

## How the scripts use it
- **Batch is the norm.** After a contact list is assembled, submit all emails via `POST /verifications/bulk`
  (dedup is automatic and you're only billed per unique email), poll the job, read results, keep `valid`
  (+ `catch-all`/`unknown` per the confirmed policy), drop `invalid`.
- **Single** endpoint for one-off checks or tiny lists (mind the 15/min limit; back off on 429).
- Write `email_status` back to Supabase `contacts` and the upload CSV. Only gated emails reach `campaign-upload`.

## Cost control
- Check `GET /credits` before large batches. 1 credit/unique email. Dedup upstream anyway.
