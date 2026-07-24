# Campaign Workflow Rules (finalized)

These rules are the operating contract for the master GTM repo. They override convenience.
**Entry point:** when the user says "GTM" (or `/gtm`), run the orchestration in `CLAUDE.md`.

## 0. The order — inputs → stack → research → STRATEGY MENU → execute
1. **Collect inputs first** (website, onboarding questionnaire, call transcripts, docs) → `profiles/<client>/inputs/`.
2. **Confirm the GTM stack** — customize the tooling per client; build a script for any tool that has none
   (from its API docs), keeping the strategy identical (see rule 4).
3. **Research → ICP** (confirm).
4. **Show the campaign angle menu** (`docs/campaign-angles.md`) and get the user's pick — including any
   angle the client already has — BEFORE sourcing anything (see rule 5).
5. Then execute source → find → verify → copy → draft, confirming at each gate.

## 4. Stack is customizable — build scripts for new tools (strategy stays fixed)
The STACK is per-user; the STRATEGY is Eric's and constant. If the user uses a GTM tool this repo has no
script for, **create one**: get its API docs + key, write a script in the existing pattern, add the `.env`
key + npm alias + `references/<tool>-api.md`. Never change the strategy to fit a tool — wire the tool to fit
the strategy.

## 5. Always show the strategy menu; support the client's own angles
Never source before presenting `docs/campaign-angles.md` and getting the user's chosen angle(s). If the
client has their own angle or existing GTM strategy, build a campaign plan around it and run it alongside
the standard ones — and append it to `docs/campaign-angles.md` so it's reusable. Users may add new angles to
test variations.

## 1. Confirmation gates — real campaigns run STEP BY STEP

For any **real** campaign (an actual client or the user), stop and get **explicit approval at every
stage** before building the next. Feedback at each stage is how the best campaign gets made.

| Stage | Produce | Then STOP and confirm |
|---|---|---|
| ICP | `client-profile.yaml` (site research + questionnaire) | "Is this ICP right?" |
| Strategy | 15–25 campaign angles | "Which campaign do we run first?" |
| List — companies | sourced/lookalike company list | "Are these the right accounts?" |
| List — contacts | decision-makers + verified emails | "Right people? Good to enrich?" |
| Copy | sequence (with personalization) | "Approve the copy?" |
| Send | DRAFT in the sender | "Approve to Start" (human hits Start) |

**Autonomous end-to-end runs are ONLY for explicit testing** (e.g. the aforanalytic.com test on
2026-07-24). Never chain a real client campaign without sign-off between stages.

## 2. Finder order — AgenticData is PRIMARY

Decision-maker + email finding follows the waterfall **AgenticData → AI Ark → ColdIQ**:
- **Step-by-step (real) campaigns:** AgenticData via **MCP** is primary — run `search`/`enrich` per company,
  present results for confirmation, then proceed. AI Ark fills gaps; ColdIQ is last resort.
- **Scriptable primary (built):** `agenticdata-find.ts` calls AgenticData's HTTP API
  (`GET /v1/search/people?company_domain=&title=`, Bearer `ADATA_live_…`) so AgenticData runs first even in
  automation — persona-first via the `title` filter, with `/v1/email/find` backfill. Run:
  `npm run agenticdata-find -- --in=companies.csv --out=contacts.csv --title="Owner"`.
- **AI Ark batch** (`ai-ark --find-batch`) fills the gaps AgenticData leaves, and is the fallback for very
  large pools. ColdIQ is last resort.
- Verify every email with **OptimaVerifier**; rescue catch-all/unknown when a finder already
  verified the mailbox as VALID (AI Ark BounceBan / AgenticData).

## 3. Personalization — company + persona is an added VARIANT (Eric's rules stay)

**Eric's copywriting rules always apply**, including **subject lines of 2–3 words** (the email's context,
4 max), lowercase for personalized subjects, no em dashes, one job per email, low-effort CTA. On top of
those, this repo adds an optional **company + persona personalization variant** (recommended for broad /
lookalike lists; niche lists may not need it):

| Layer | What it is | When |
|---|---|---|
| Merge tags | `{{first_name}}`, `{{company_name}}` | baseline, always present |
| **Company-level (AI)** | a researched opening line specific to each prospect's business (via FireCrawl) | the variant — especially for lookalike/broad lists |
| **Persona-level** | angle tailored to the decision-maker's role (Ops vs Marketing vs Finance) | the variant — requires pinning the target title first |

**Implications for the workflow:**
- **Pin the persona (target title) before finding contacts** — you can't tailor to a role you didn't target.
  Lookalike campaigns must still choose a primary persona per send.
- **Generate a company-level AI line per account** — FireCrawl-research each prospect's site → one specific
  opening line (`{{ai_company_context}}`) via the `firecrawl-enrich` + `personalization-subagent-pattern`
  skills. Keep it public-data-only and honest.
- The test copy for aforanalytic.com was **offer/industry-level with merge tags only** — acceptable for a
  test, but below this standard for a real campaign.

---

_See also: `roadmap.md` (flow), `stack-selector.md` (tools), `skills/agenticdata-contacts`,
`skills/firecrawl-enrich`, `skills/campaign-copywriting`._
