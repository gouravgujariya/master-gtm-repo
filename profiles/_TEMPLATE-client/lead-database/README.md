# lead-database/ — all lead outputs + the FINAL campaign file

Everything the pipeline produces for this client lands here. Files are named per campaign.

## Files (per campaign `<slug>`)
| File | Stage | Contents |
|---|---|---|
| `companies-<slug>.csv` | sourcing | sourced / lookalike companies |
| `contacts-<slug>.csv` | find | decision-makers found (AgenticData → AI Ark → ColdIQ) |
| `contacts-verified-<slug>.csv` | verify | after OptimaVerifier (+ catch-all rescue) |
| **`final-campaign-<slug>.csv`** | **deliverable** | **one row per prospect with EVERYTHING** |

## `final-campaign-<slug>.csv` — the single source of truth
This one file holds the finalized data: contacts, emails, verification, and the personalized copy.

Columns:
```
# identity
email, first_name, last_name, company_name, company_domain, title, linkedin_url
# find + verify
email_status, sendable, find_source
# personalization (company + persona variant)
persona, ai_company_context
# the personalized emails (per sequence step)
subject_1, body_1, subject_2, body_2, subject_3, body_3
```
If a value is the same for every row (e.g. subject templates), it still lives here so the file is
self-contained and ready to hand to `campaign-upload` / Plusvibe.
