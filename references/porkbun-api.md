# Porkbun — API Reference (domains, DEFAULT registrar)

- **Role:** buy sending domains (default). Used by `inbox-infrastructure`. Alternative: Dynadot.
- **Integration:** API-key script.
- **Env vars:** `PORKBUN_API_KEY` (`pk1_…`), `PORKBUN_SECRET_KEY` (`sk1_…`).
- **Base URL:** `https://api.porkbun.com/api/json/v3`
- **Auth:** every request is a `POST` with JSON body containing `{"apikey": "...", "secretapikey": "..."}`.

## Key endpoints
| Action | Endpoint | Notes |
|---|---|---|
| Test auth / get IP | `POST /ping` | confirm keys + whitelisted IP |
| Check availability + price | `POST /domain/checkDomain/{domain}` | price + availability |
| **Register a domain** | *(see Porkbun domain purchase API)* | confirm exact route with docs; purchase spends money |
| List domains | `POST /domain/listAll` | inventory |
| Get/edit DNS | `POST /dns/retrieve/{domain}`, `POST /dns/create/{domain}` | set records; usually the inbox provider manages DNS |
| Update nameservers | `POST /domain/updateNs/{domain}` | point NS to the inbox provider (Inboxkit/Maildoso/Zapmail) |

## Flow (in `inbox-infrastructure`)
1. `ping` to confirm keys + that your IP is allowed (Porkbun requires API access enabled on the account).
2. `checkDomain` each generated candidate for availability + price.
3. **Confirm the exact list + total cost with the user, then register** (never auto-buy).
4. `updateNs` to the inbox provider's nameservers so it can create inboxes + set SPF/DKIM/DMARC.

## Notes
- API access must be enabled per-domain/account in Porkbun settings; keys are `pk1_`/`sk1_`.
- Verify the current register endpoint + params against Porkbun's live docs before scripting.
- `.com` default (fallback `.co`); avoid `.info`/`.xyz`.
