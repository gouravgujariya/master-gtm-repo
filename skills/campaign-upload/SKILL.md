---
name: campaign-upload
description: Upload a verified leads CSV + email variants to the sending platform as a DRAFT campaign (never auto-send). Multi-provider: Plusvibe (default) or Smartlead. Handles sequence A/B/C variants, schedule, and tag-based inbox selection. Use as the final step after contacts are verified and copy is written.
scripts: TODO (API-key script per platform — see references/plusvibe-api.md, references/smartlead-api.md)
---

# Campaign Upload (Plusvibe / Smartlead)

The last mile: take a **verified contacts CSV** + a **variants file** (the copy) and create the campaign in
the sending platform **as a DRAFT**. A human reviews in the platform UI and hits Start. This repo never
auto-activates a campaign.

> **Stack note (confirm via `docs/stack-selector.md`):** sending platform = **Plusvibe** (default) /
> **Smartlead** (alt). Inboxes must already be provisioned + warmed + exported (see `inbox-infrastructure`).

## Inputs

- `profiles/<client>/lists/<campaign>-contacts.csv` — verified contacts (from `agenticdata-contacts`).
- `profiles/<client>/campaigns/<campaign>/variants.yaml` — the copy (from `campaign-copywriting`).

### leads CSV schema (contract)
Required: `email, first_name, last_name, company_name`. Optional/personalization:
`company_domain, title, linkedin_url, situation_line, value_line, cta_line`, plus any `{{custom}}` vars the
copy references. Reject unknown columns loudly (keeps the upload clean). Extra columns → platform custom fields.

### variants.yaml schema (contract — reused from Eric)
`campaign_name`; `schedule` (timezone, sending_days, start/end hour, min_time_between_emails, max_leads_per_day);
`inbox_selection` (by tag=active, count); `sequences` (steps with `delay_days` and A/B/C `variants`, each
`subject` + `body`). **YAML body must match the copywriting markdown body exactly.**

## Flow

1. **Confirm platform** + that inboxes are live and tagged `active`.
2. **Validate** the leads CSV against the schema; abort on unknown columns or missing required fields.
3. **Create campaign** (DRAFT) on the platform.
4. **Add sequence** with A/B/C variants; sanitize any em/en-dashes (spam flag) before upload.
5. **Select inboxes**: filter by tag=`active` + healthy, sort by **least-recently-used (lowest daily sent
   count)**, attach top-N per the schedule. This LRU logic ports directly from Eric's `upload.ts`.
6. **Upload leads** in batches (platform-appropriate size); map extra columns to custom fields.
7. **Set settings + schedule** (tracking off or per policy, stop-on-reply on, schedule from YAML).
8. **Leave in DRAFT.** Print the review URL. Tell the user to review and hit Start manually.

## Rules

- **Always DRAFT, never auto-send.** A human hits Start.
- **Real campaigns: get explicit sign-off on the list AND the copy before drafting** (per
  `docs/campaign-workflow-rules.md`). Autonomous upload is testing-only.
- **Verified emails only** — this step assumes `agenticdata-contacts` already verified. Do not upload
  unverified lists.
- **Respect volume caps** (30/inbox/day post-warmup; max leads/day from the schedule).
- Log the campaign (platform id, list, variants, date) to `profiles/<client>/campaigns/<campaign>/` and
  Supabase for the weekly-rhythm + scoring loop.

## Milestone 1 status

Playbook only. The Plusvibe (and Smartlead) upload scripts are a later milestone — see
`references/plusvibe-api.md` / `references/smartlead-api.md`. Eric's `smartlead-campaign-upload-public/upload.ts`
is the porting reference for the create → sequence → inbox-select(LRU) → add-leads → schedule flow.
