# Inboxkit — API Reference (DEFAULT inbox provider + warmup)

- **Role:** DEFAULT inbox provisioning + warmup; exports inboxes to the sending platform. Used by `inbox-infrastructure`.
- **Integration:** API-key script.
- **Env var:** `INBOXKIT_API_KEY`.
- **Base URL / auth:** _confirm from Inboxkit dashboard → API._

> ⚠️ **Verify with live key.** Confirm base URL, auth, and routes against Inboxkit's docs once the key is
> in `.env`. This doc defines the capabilities the scripts must call. The user's infra is built primarily in
> **Inboxkit**, exporting domains + inboxes to **Plusvibe**.

## Capabilities the scripts need
| Capability | Purpose | Confirm |
|---|---|---|
| Connect / add domain | attach a Porkbun/Dynadot domain (after NS set) | ▢ |
| Create mailboxes (2/domain) | provision inboxes; auto SPF/DKIM/DMARC | ▢ |
| Get nameservers to set | the NS to put on the registrar | ▢ |
| Enable warmup + ramp | built-in warmup, slow ramp | ▢ |
| Inbox health / status | reputation, blocks (feeds deliverability-audit) | ▢ |
| **Export to sending platform** | push ACTIVE inboxes to Plusvibe / Smartlead | ▢ |

## Flow (in `inbox-infrastructure`)
1. Buy domains (Porkbun) → set NS to Inboxkit's nameservers.
2. Connect domains in Inboxkit → create 2 mailboxes/domain → DNS auth auto-set.
3. Enable warmup; record start date; **2-week minimum** before sending.
4. Export ACTIVE inboxes to Plusvibe (default).

## Notes
- Purchasing/provisioning may incur cost — confirm counts with the user first.
- Maildoso (`maildoso-api.md`) is the interchangeable alternative.
