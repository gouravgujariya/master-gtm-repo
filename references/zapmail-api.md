# Zapmail — API Reference (inboxes, ALTERNATIVE provider)

- **Role:** alternative inbox provider + warmup (defaults are Inboxkit / Maildoso). Used by `inbox-infrastructure`.
- **Integration:** API-key script.
- **Env var:** `ZAPMAIL_API_KEY`.
- **Base URL:** `https://api.zapmail.ai/api/v2`
- **Auth:** header `x-auth-zapmail: <ZAPMAIL_API_KEY>`.

## Key endpoints (from Eric's `zapmail-full-setup.ts`)
| Action | Endpoint | Notes |
|---|---|---|
| Connect domains (batch 50) | `POST /connect-domain` | after NS point to Zapmail |
| Poll assignable | `GET /assignable` | wait until domains are ready |
| Create mailboxes (batch 25) | `POST /mailboxes` | whole batch 400s if any mailbox already exists |
| Export mailboxes | `POST /exports/mailboxes` | export to sending platform; filter `status: ACTIVE` |
| Link third-party sender | `POST /exports/accounts/third-party` | connect the platform login |

## Nameservers
Zapmail uses its own NS (e.g. `pns61-64.cloudns.*`) — set these on the registrar (`set_ns`).

## Timing
NS switch → wait ~15-20 min DNS → connect → poll assignable → create 2 inboxes/domain → wait ~4-6 hr
provisioning → export. Then **2-week warmup** before real sends.

## Export target
Zapmail can export to Plusvibe / Smartlead / EmailBison / Instantly. Default export target here = **Plusvibe**.
