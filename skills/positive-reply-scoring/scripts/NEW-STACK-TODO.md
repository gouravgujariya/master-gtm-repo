# Rebuild TODO — positive-reply-scoring scripts

The `.ts` files in this folder (`fetch-campaign-replies.ts`, `aggregate-scores.ts`) are **legacy
Smartlead** scripts copied from Eric's repo. They are kept **only as porting reference**. Do not run
them against this stack.

## What to rebuild (later milestone)
- **`fetch-replies.ts`** — pull replies for a campaign from the configured sending platform:
  - Default: **Plusvibe** (see `references/plusvibe-api.md`).
  - Alt: **Smartlead** (see `references/smartlead-api.md`).
- **`aggregate-scores.ts`** — unchanged in spirit: pull `total_sent` from the platform, classify each
  reply with Claude using the schema in `SKILL.md`, compute `positive_replies / total_sent`.

The classification schema and metric in `SKILL.md` are platform-neutral — reuse them directly.
Store results in Supabase (`references/supabase-schema.md`) and/or `profiles/<client>/scores/`.
