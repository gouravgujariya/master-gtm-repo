---
name: inbox-infrastructure
description: Set up cold-email sending infrastructure — buy domains, create + warm inboxes, and export them to the sending platform. Multi-provider: domains via Porkbun (default) or Dynadot; inboxes + warmup via Inboxkit (default) or Maildoso or Zapmail; export to Plusvibe (default) or Smartlead. Use when the user has no sending infrastructure yet, or needs to add domains/inboxes.
scripts: TODO (API-key scripts per provider — see references/porkbun-api.md, inboxkit-api.md, maildoso-api.md, dynadot-api.md, zapmail-api.md)
---

# Inbox Infrastructure (multi-provider)

Cold email lives or dies on infrastructure. This skill provisions it: **domains → inboxes → warmup →
export to sender.** Every step is provider-selectable — always confirm the stack first.

> **Stack note (confirm via `docs/stack-selector.md`):**
> - **Domains:** Porkbun (default) · Dynadot (alt)
> - **Inboxes + warmup:** Inboxkit (default) · Maildoso (alt) · Zapmail (alt)
> - **Export target (sending platform):** Plusvibe (default) · Smartlead (alt)
>
> The user's real setup: domains bought on **Porkbun**, inboxes built + warmed in **Inboxkit** (or
> **Maildoso**), then **exported from Inboxkit to Plusvibe**. Ask which providers before running anything.

## The pipeline

```
1. Generate domain candidates   → brandable variants (buy-domains, avoid look-alike spam patterns)
2. Buy domains                  → Porkbun (default) / Dynadot
3. Create inboxes + set DNS     → Inboxkit / Maildoso / Zapmail (SPF/DKIM/DMARC auto-configured)
4. Warm up (2+ weeks)           → provider's built-in warmup; ramp slowly
5. Export inboxes to sender     → Inboxkit/Maildoso export → Plusvibe (default) / Smartlead
6. Configure in sender          → signatures, from-names, active/insurance tags (campaign-upload picks tagged inboxes)
```

## Eric-proven defaults (portable to any provider)

- **~20 domains × 2 inboxes = 40 sending inboxes** for a first program (max 2 inboxes/domain).
- **30 emails/day/inbox** post-warmup — never exceed.
- **2-week warmup minimum** before sending real campaigns. Loudly warn the user: warmup takes time, plan for it.
- **`.com` default** (fall back `.co`); avoid `.info` / `.xyz`.
- Signature template: `{from_name} / {title} / {company} / {address}` — a real physical address is required
  (CAN-SPAM). Store sender identity in `.env` (`SENDER_*`).

## Flow

1. **Confirm providers** (domains / inboxes / sender) and that the required API keys are in `.env`.
2. **Domains:** generate candidates → check availability + price → purchase (Porkbun/Dynadot).
3. **Inboxes:** create 2/domain on Inboxkit/Maildoso/Zapmail; provider handles DNS auth + nameservers.
4. **Warmup:** enable built-in warmup with a slow ramp; record the start date; **do not send for 2 weeks**.
5. **Export:** push ACTIVE inboxes from Inboxkit/Maildoso to the sending platform (Plusvibe/Smartlead).
6. **Tag** inboxes active vs insurance so `campaign-upload` can select the healthy active pool.

## What's real vs TODO (Milestone 1)

This is a **playbook only right now** — the per-provider scripts are a later milestone. See each provider's
reference doc for the endpoints the scripts will call. Domain purchase spends real money: **never auto-buy;
always confirm the exact domains + total cost with the user first.**

## Timing model (set expectations)

Buy domains → NS/DNS propagation (~15-20 min) → connect → create inboxes → provisioning (hours) → **2-week
warmup** → export → send. From zero, plan ~2-3 weeks before the first real campaign can go out.
