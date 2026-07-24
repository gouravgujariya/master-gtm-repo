# Stack Selector — "What's your tech stack?"

This repo is **multi-provider**. Every skill that touches a vendor asks which tool you're using and adapts.
This file is the single source of truth for the provider options + defaults. Skills point here.

## The provider matrix

| Job | Default (recommended) | Alternatives | Reference doc | Integration |
|---|---|---|---|---|
| Local US businesses (source) | **Bulk 12M CSV** (first) | Serper.dev → Apify | `bulk-list-builder`, `serper-api.md`, `apify-api.md` | local / API / MCP |
| SaaS/software (source) | **Bulk 900K CSV** (first) | AI Ark → Apify | `bulk-list-builder`, `ai-ark-api.md`, `apify-api.md` | local / API |
| Find companies + **lookalikes** | **AI Ark** | Apify | `ai-ark-api.md` | API key |
| Scraping (hiring, LinkedIn, reviews…) | **Apify** | Serper.dev (local) | `apify-api.md` | **MCP** + API |
| Tech-stack targeting | **AI Ark `technologies` filter** (source by tech) | **TechSight** (free) — fallback: detect/confirm on any list | `ai-ark-api.md`, `techsight-cli.md` | API + Python CLI |
| Buyer-language research (copy/ICP) | **reddit-find** (free) — feed into research + copy | — | `reddit-find-cli.md` | Python CLI |
| Find decision-makers + emails | **AgenticData** → **AI Ark** → **ColdIQ** (last resort) | — | `agenticdata-api.md`, `ai-ark-api.md`, `coldiq-api.md` | MCP + API |
| **Verify emails (mandatory gate)** | **OptimaVerifier** (every email) | catch-all cross-check → **AI Ark** (pending AI Ark API docs) | `optimaverifier-api.md`, `ai-ark-api.md` | API key |
| Website fetch / research | **FireCrawl** | Open Web Ninja (news, fallback) | `firecrawl-api.md` | **MCP** + API |
| Data storage | **Supabase** | local CSV | `supabase-schema.md` | client |
| Strategy + copy | **Kept skills** (Eric's) | — | `skills/campaign-*` | n/a |
| Domains | **Porkbun** | Dynadot | `porkbun-api.md`, `dynadot-api.md` | API key |
| Inboxes + warmup | **Inboxkit** | Maildoso · Zapmail | `inboxkit-api.md`, `maildoso-api.md`, `zapmail-api.md` | API key |
| Sending | **Plusvibe** | Smartlead | `plusvibe-api.md`, `smartlead-api.md` | API key |

## Contact + verification waterfall (the priority path)

**Find** (stop at first success): AgenticData (primary) → AI Ark → **ColdIQ** (last resort, expensive).
**Verify** every email through **OptimaVerifier** (primary) before upload:
- `valid` → keep · `invalid` → drop
- `catch-all` → **cross-check with a 2nd verifier**: 2nd says valid → keep; 2nd also catch-all → drop
- `unknown` → hold (don't send yet)

> **Catch-all cross-check = AI Ark (implemented).** When OptimaVerifier says `catch-all`, re-find the person
> via AI Ark's email-finder (BounceBan-verified): AI Ark returns `SMTP`/`VALID` → keep; `CATCH_ALL`/not found
> → drop. Run: `npm run ai-ark -- --verify-catchall --in=verified.csv --out=rechecked.csv`. (AgenticData
> can't do this — it returns no verification verdict.)

## Two rules every skill follows

1. **Bulk-CSV-first.** Always try `bulk-list-builder` before any paid live source.
   - Local businesses → 12M CSV first, then Serper.dev, then Apify.
   - SaaS/software → 900K CSV first, then AI Ark, then Apify.
   - Only go live if the user isn't satisfied (freshness, coverage, richer fields).

2. **Adapt-to-strategy.** Tools aren't hardcoded to one job. Especially Apify (many actors) and AI Ark
   (sourcing + lookalikes + fallback contacts). Read the campaign strategy, pick the right tool + approach.

## Integration methods (how Claude operates each tool)
- **MCP (preferred where it exists):** AgenticData ✅ (connected), Apify, FireCrawl. No script needed.
- **API-key script:** Serper.dev, AI Ark, Plusvibe, Smartlead, Inboxkit, Maildoso, Porkbun, Dynadot,
  Zapmail, Open Web Ninja. Keys live in `.env` (see `.env.example`).
- **Local:** the bulk CSVs (DuckDB/stream), later Supabase.

## Per-client stack
Because this is an agency repo, each client's chosen providers are stored in
`profiles/<client>/client-profile.yaml` under `stack:` so campaigns are reproducible.
