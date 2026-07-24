# Maildoso — API Reference (ALTERNATIVE inbox provider + warmup)

- **Role:** alternative inbox provisioning + warmup (default is Inboxkit). Used by `inbox-infrastructure`.
- **Integration:** API-key script.
- **Env var:** `MAILDOSO_API_KEY`.
- **Base URL / auth:** _confirm from Maildoso dashboard → API._

> ⚠️ **Verify with live key.** Confirm base URL, auth, and routes against Maildoso's docs once the key is in
> `.env`. Same capability surface as Inboxkit — this is the interchangeable alternative the user "sometimes"
> uses.

## Capabilities the scripts need (mirror Inboxkit)
| Capability | Purpose | Confirm |
|---|---|---|
| Connect / add domain | attach registrar domain (after NS set) | ▢ |
| Create mailboxes (2/domain) | provision inboxes; auto SPF/DKIM/DMARC | ▢ |
| Get nameservers to set | NS for the registrar | ▢ |
| Enable warmup + ramp | built-in warmup | ▢ |
| Inbox health / status | feeds deliverability-audit | ▢ |
| Export to sending platform | push ACTIVE inboxes to Plusvibe / Smartlead | ▢ |

## Flow
Identical to `inboxkit-api.md`: buy domains → NS to Maildoso → connect → create inboxes → warmup (2 wks) →
export to Plusvibe. Pick Inboxkit **or** Maildoso per the stack-selector; don't split one domain across both.
