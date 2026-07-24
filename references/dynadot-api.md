# Dynadot — API Reference (domains, ALTERNATIVE registrar)

- **Role:** alternative domain registrar (default is Porkbun). Used by `inbox-infrastructure`.
- **Integration:** API-key script.
- **Env var:** `DYNADOT_API_KEY`.
- **Base URL:** `https://api.dynadot.com/api3.json`
- **Auth:** key in query string; **your server IP must be whitelisted** in Dynadot API settings.

## Key commands (GET, `?command=…&key=…`)
| Action | Command |
|---|---|
| Account/wallet info | `command=account_info` |
| Search availability (batch 100) | `command=search&domain0=…&domain1=…` |
| Register (1 per call) | `command=register&domain=…&duration=1` |
| Set nameservers | `command=set_ns&domain=…&ns0=…&ns1=…` |

## Gotchas (from Eric's `zapmail-full-setup.ts`)
- **Comma encoding:** batch `set_ns` needs commas sent un-encoded (`safe=','`). URL-encoding them breaks it.
- **One domain per `register` call** — loop, don't batch registrations.
- Check wallet balance (`account_info`) before bulk registering.

## Flow
Same as Porkbun path: search → confirm cost with user → register (never auto-buy) → `set_ns` to the inbox
provider's nameservers. Then the inbox provider (Zapmail/Inboxkit/Maildoso) handles DNS + inbox creation.
