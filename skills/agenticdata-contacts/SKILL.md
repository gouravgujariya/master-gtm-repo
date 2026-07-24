---
name: agenticdata-contacts
description: Turn a company list into VERIFIED decision-maker contacts. Find waterfall AgenticData → AI Ark → ColdIQ (last resort); verify EVERY email with OptimaVerifier (primary) before upload. Use after any list-building skill (bulk-list-builder, ai-ark-companies, apify-list-builder, serper-local-list-builder) produced companies.
scripts: TODO. AgenticData = MCP (search, enrich). OptimaVerifier/AI Ark/ColdIQ = API-key scripts (see references/).
---

# Contacts — Find Decision-Makers + Verify Emails

This is where a company list becomes a **sendable, verified** contact list. Two stages: **find** the
decision-maker + email, then **verify** every email. Verification is the top priority — nothing unverified
ever reaches `campaign-upload`.

## Inputs
- Company list CSV from a list-building skill (`profiles/<client>/lists/<campaign>-companies.csv`).
- Target **titles / seniority** from the campaign strategy + `client-profile.yaml`.

**Pin the PERSONA first.** Before finding anyone, decide the target title/role for this campaign (e.g.
"Head of Ops", "VP Marketing", "Owner"). You can't personalize to a role you didn't target — see
`docs/campaign-workflow-rules.md` (personalization = company + persona).

## Stage 1 — FIND (waterfall, stop as soon as you have a person + email)

1. **AgenticData (PRIMARY)** — MCP `search` (company + the pinned title → decision-makers), then `enrich`
   to resolve the email. **This is the default primary.** In step-by-step (real) campaigns, run it per
   company via MCP and confirm results with the user. Most contacts resolve here.
2. **AI Ark (secondary / scriptable batch)** — for companies AgenticData missed, use `ai-ark --find-batch`
   (`references/ai-ark-api.md`). NOTE: AI Ark batch is also the fallback used for **autonomous/large-pool**
   runs where AgenticData's MCP can't be looped unattended — a tooling tradeoff, flag it when used.
3. **ColdIQ (LAST RESORT)** — only for contacts still missing an email after 1 + 2. Expensive (40+
   providers); gate per-missing-contact, never bulk. (`references/coldiq-api.md`.)

Dedup across sources by email + LinkedIn URL. Record which source found each contact.

## Stage 2 — VERIFY (OptimaVerifier, PRIMARY — run on EVERY email)

Every email — regardless of which finder returned it, even if the finder already called it "valid" — is
verified through **OptimaVerifier** (`references/optimaverifier-api.md`) before upload.

- Batch: submit all emails via `POST /verifications/bulk` (auto-dedup, 1 credit/unique), poll, read results.
- Apply the gate:
  | OptimaVerifier status | action |
  |---|---|
  | `valid` | ✅ keep |
  | `invalid` | ❌ drop |
  | `catch-all` | **cross-check with AI Ark** → AI Ark says valid → keep; can't confirm → drop. (Pending AI Ark API docs; until then HELD, `sendable=no`.) |
  | `unknown` | hold (do not send yet); re-verify later |
- **Catch-all cross-check = AI Ark** (AgenticData can't verify). Needs AI Ark API docs to implement.

## Operational runbook (working today)

1. **Find — AgenticData PRIMARY (two ways):**
   - **Scriptable (default for batches):** `npm run agenticdata-find -- --in=companies.csv --out=contacts.csv --title="<persona>"`
     — HTTP `/v1/search/people` per company, persona-first, `/v1/email/find` backfill. Skips step 2 (emails included).
   - **Interactive (step-by-step campaigns):** call the AgenticData MCP `search` per company, present for
     confirmation, collect records into JSON, then run `select-contacts` (step 2).
2. **Select:** `npm run select-contacts -- --in=raw.json --out=contacts.csv --titles="VP Sales,Head of Growth,Founder,Owner"`
   — ranks by target title + seniority, extracts the business email, one decision-maker per company.
3. **Fallback finders** (for companies/contacts step 1-2 missed):
   - AI Ark: `npm run ai-ark -- --find --first=Jane --last=Doe --domain=acme.com` (search → email-finder → poll).
   - ColdIQ (last resort): `npm run coldiq -- --in=missing.csv --out=found.csv` (LinkedIn → work email via LimaData).
4. **Verify:** `npm run verify-emails -- --in=contacts.csv --out=verified.csv` — OptimaVerifier gate.
5. **Catch-all cross-check:** `npm run ai-ark -- --verify-catchall --in=verified.csv --out=rechecked.csv` —
   rescues catch-all rows AI Ark confirms as SMTP/VALID, drops the rest. Keep `sendable=yes`.

Auth confirmed live for all four tools (AgenticData MCP, OptimaVerifier, AI Ark 18k credits, ColdIQ 350
credits). AgenticData search + OptimaVerifier bulk are proven end-to-end; the AI Ark/ColdIQ finder spend
paths are built and await a first live tuning run.

## Stage 3 — ASSEMBLE

1. Write the sendable list: `profiles/<client>/lists/<campaign>-contacts.csv` with the upload schema
   (`campaign-upload`): `email, first_name, last_name, company_name, company_domain, title, linkedin_url`
   + any personalization columns, plus `email_status` and `find_source`.
2. **Grade** with `list-quality-scorecard` (verification coverage, dupes, ICP fit, title diversity).
3. Store contacts in Supabase (`references/supabase-schema.md`) as the system of record; CSV is the artifact.

## Rules
- **Never send unverified emails.** OptimaVerifier is the mandatory final gate.
- **Find is a waterfall, not a broadcast** — stop at the first source that returns a verified-findable email;
  escalate to ColdIQ only when truly stuck (cost control).
- One verified email per person; dedup across sources.
- ENRICHING a company list into contacts is cheaper than re-sourcing people — prefer it.

## Output contract
`profiles/<client>/lists/<campaign>-contacts.csv` (verified only) → `campaign-upload` (Plusvibe/Smartlead DRAFT).
